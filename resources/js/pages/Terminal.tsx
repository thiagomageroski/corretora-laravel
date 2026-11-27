import { Head, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PriceChart from '@/components/chart/PriceChart';
import AssetList from '@/components/terminal/AssetList';
import PositionsPanel from '@/components/terminal/PositionsPanel';
import TradePanel, { TradePanelCompact } from '@/components/terminal/TradePanel';
import { useTradeTicket } from '@/components/terminal/useTradeTicket';
import AppLayout from '@/layouts/AppLayout';
import { api } from '@/lib/api';
import { formatPrice, formatSignedCents, RESULT_LABELS } from '@/lib/format';
import { shortcutFor } from '@/lib/shortcuts';
import { playResultTone } from '@/lib/sound';
import type { Asset, Category, Paginated, Position, SharedProps, TradingRules, WalletSummary } from '@/lib/types';
import { getEcho, useMarket } from '@/stores/market';
import { usePreferences } from '@/stores/preferences';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';

type Props = {
    assets: { data: Asset[] };
    categories: Category[];
    recentAssetIds: number[];
    wallet: WalletSummary;
    openPositions: { data: Position[] };
    closedPositions: { data: Position[] };
    rules: TradingRules;
};

const QUOTE_FRESH_MS = 5000;
type MobileTab = 'chart' | 'assets' | 'positions';

/**
 * True while the provider keeps publishing new quotes for the asset. Only a new
 * source timestamp counts, so polling that returns the same old quote does not.
 * Timing uses this browser's clock alone, so clock differences cannot affect it.
 */
function useQuoteIsFresh(assetId: number | null): boolean {
    const sourceAt = useMarket((state) => (assetId === null ? undefined : state.ticks[assetId]?.source_at));
    const [changedAt, setChangedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const previous = useRef<{
        assetId: number | null;
        sourceAt: string | undefined;
    }>({ assetId, sourceAt: undefined });

    useEffect(() => {
        const last = previous.current;

        if (last.assetId !== assetId) {
            setChangedAt(null);
        } else if (last.sourceAt !== undefined && sourceAt !== undefined && last.sourceAt !== sourceAt) {
            setChangedAt(Date.now());
        }

        previous.current = { assetId, sourceAt };
    }, [assetId, sourceAt]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, []);

    return changedAt !== null && now - changedAt < QUOTE_FRESH_MS;
}

/**
 * A panel's open or closed state, remembered in this browser. Storage can be
 * unavailable (private mode), in which case it lasts only for the visit.
 */
function useStoredFlag(key: string, fallback: boolean): [boolean, () => void] {
    const [value, setValue] = useState(() => {
        try {
            const stored = localStorage.getItem(key);

            return stored === null ? fallback : stored === '1';
        } catch {
            return fallback;
        }
    });

    const toggle = useCallback(() => {
        setValue((current) => {
            try {
                localStorage.setItem(key, current ? '0' : '1');
            } catch {
                /* Remembered for this visit only. */
            }

            return !current;
        });
    }, [key]);

    return [value, toggle];
}

function TicketArea({ asset, wallet, rules, hasFreshQuote, onOpened, variant }: { asset: Asset; wallet: WalletSummary; rules: TradingRules; hasFreshQuote: boolean; onOpened: (position: Position) => void; variant: 'full' | 'compact' }) {
    const ticket = useTradeTicket({
        asset,
        wallet,
        rules,
        hasFreshQuote,
        onOpened,
    });
    const shortcutsOn = usePreferences((state) => state.preferences.keyboard_shortcuts);
    const ticketRef = useRef(ticket);
    ticketRef.current = ticket;

    // Only the full ticket listens, so a hidden compact copy never trades twice.
    useEffect(() => {
        if (variant !== 'full' || !shortcutsOn) return;

        const onKey = (event: KeyboardEvent) => {
            const shortcut = shortcutFor(event);
            const current = ticketRef.current;

            if (!shortcut) return;

            event.preventDefault();

            if ((shortcut.action === 'call' || shortcut.action === 'put') && !current.disabled) current.open(shortcut.action);
            if (shortcut.action === 'stake-up') current.nudgeAmount(1000);
            if (shortcut.action === 'stake-down') current.nudgeAmount(-1000);
            if (shortcut.action === 'duration' && shortcut.index !== undefined && rules.durations_seconds[shortcut.index]) current.setDuration(rules.durations_seconds[shortcut.index]);
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [variant, shortcutsOn, rules.durations_seconds]);

    return variant === 'full' ? <TradePanel asset={asset} ticket={ticket} rules={rules} /> : <TradePanelCompact asset={asset} ticket={ticket} rules={rules} />;
}

export default function Terminal({ assets: initialAssets, categories, recentAssetIds, wallet: initialWallet, openPositions, closedPositions, rules }: Props) {
    const { props, url } = usePage<Props & SharedProps>();
    const userId = props.auth.user?.id;
    const push = useToasts((state) => state.push);

    const walletSummary = useWallet((state) => state.summary);
    const refreshWallet = useWallet((state) => state.refresh);
    const wallet = walletSummary ?? initialWallet;

    const [assets, setAssets] = useState(initialAssets.data);
    const [open, setOpen] = useState(openPositions.data);
    const [closed, setClosed] = useState(closedPositions.data);
    const [recentIds, setRecentIds] = useState(recentAssetIds);
    const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
    const [selectedId, setSelectedId] = useState<number | null>(() => {
        const requested = Number(new URLSearchParams(url.split('?')[1] ?? '').get('asset'));

        if (requested && initialAssets.data.some((asset) => asset.id === requested)) {
            return requested;
        }

        return initialAssets.data.find((asset) => asset.tradable && asset.quote)?.id ?? initialAssets.data[0]?.id ?? null;
    });

    const selected = useMemo(() => assets.find((asset) => asset.id === selectedId) ?? null, [assets, selectedId]);
    const refreshing = useRef(false);
    const knownOpenIds = useRef(new Set(openPositions.data.map((position) => position.id)));

    const announceSettlements = useCallback(
        (settled: Position[]) => {
            for (const position of settled) {
                if (!knownOpenIds.current.has(position.id)) continue;

                knownOpenIds.current.delete(position.id);

                const cents = position.result_cents ?? 0;
                const tone = position.result === 'won' ? 'up' : position.result === 'lost' ? 'down' : 'neutral';

                if (usePreferences.getState().preferences.notify_settlement_toast) {
                    push({
                        tone,
                        title: `${position.symbol}: ${RESULT_LABELS[position.result ?? ''] ?? 'Encerrada'} ${formatSignedCents(cents)}`,
                        detail: position.close_price ? `Entrada ${formatPrice(position.entry_price)} · Encerramento ${formatPrice(position.close_price)}` : 'Sem preço de referência no vencimento; valor devolvido.',
                    });
                }

                if (usePreferences.getState().preferences.sound_on_settlement) {
                    playResultTone(position.result === 'won' ? 'won' : position.result === 'lost' ? 'lost' : 'neutral');
                }
            }
        },
        [push],
    );

    const refresh = useCallback(async () => {
        if (refreshing.current) return;

        refreshing.current = true;

        try {
            const [, openResponse, closedResponse] = await Promise.all([refreshWallet(), api<Paginated<Position>>('/positions?status=open'), api<Paginated<Position>>('/positions?status=closed')]);
            setOpen(openResponse.data);
            setClosed(closedResponse.data);
            announceSettlements(closedResponse.data);
        } catch {
            /* The next scheduled refresh retries; the feed indicator already shows connection problems. */
        } finally {
            refreshing.current = false;
        }
    }, [announceSettlements, refreshWallet]);

    useEffect(() => {
        const channel = userId ? getEcho()?.private(`users.${userId}`) : null;
        channel?.listen('.position.changed', () => void refresh());

        return () => {
            if (userId) getEcho()?.leave(`users.${userId}`);
        };
    }, [userId, refresh]);

    const hasExpired = open.some((position) => new Date(position.expires_at).getTime() <= Date.now());

    useEffect(() => {
        if (open.length === 0) return;

        const timer = window.setInterval(() => void refresh(), hasExpired ? 2000 : 5000);

        return () => window.clearInterval(timer);
    }, [open.length, hasExpired, refresh]);

    useEffect(() => {
        if (open.length === 0) return;

        const earliest = Math.min(...open.map((position) => new Date(position.expires_at).getTime()));
        const timer = window.setTimeout(() => void refresh(), Math.max(0, earliest - Date.now()) + 1500);

        return () => window.clearTimeout(timer);
    }, [open, refresh]);

    const hasFreshQuote = useQuoteIsFresh(selectedId);

    const selectAsset = useCallback((asset: Asset) => {
        setSelectedId(asset.id);
        setMobileTab('chart');
        setRecentIds((current) => [asset.id, ...current.filter((id) => id !== asset.id)].slice(0, 8));
        void api(`/assets/${asset.id}/view`, { method: 'POST' }).catch(() => undefined);
    }, []);

    const toggleFavorite = useCallback((asset: Asset) => {
        const next = !asset.is_favorite;
        setAssets((current) => current.map((item) => (item.id === asset.id ? { ...item, is_favorite: next } : item)));
        void api(`/assets/${asset.id}/favorite`, {
            method: next ? 'PUT' : 'DELETE',
        }).catch(() => {
            setAssets((current) => current.map((item) => (item.id === asset.id ? { ...item, is_favorite: !next } : item)));
        });
    }, []);

    const onOpened = useCallback(
        (position: Position) => {
            knownOpenIds.current.add(position.id);
            setOpen((current) => [...current.filter((item) => item.id !== position.id), position]);
            push({
                tone: 'info',
                title: `${position.direction === 'call' ? 'CALL' : 'PUT'} aberto em ${position.symbol}`,
                detail: `Entrada ${formatPrice(position.entry_price)}`,
            });
            void refresh();
        },
        [push, refresh],
    );

    const [assetsOpen, toggleAssets] = useStoredFlag('trade-assets-open', false);
    const [positionsOpen, togglePositions] = useStoredFlag('trade-positions-open', false);

    // On large screens the list slides beside the chart; on phones it is its own tab.
    const onAssetsClick = useCallback(() => {
        if (window.matchMedia('(min-width: 1024px)').matches) {
            toggleAssets();
        } else {
            setMobileTab('assets');
        }
    }, [toggleAssets]);

    const panelVisibility = (tab: MobileTab) => (mobileTab === tab ? 'flex' : 'hidden');

    return (
        <AppLayout fullHeight>
            <Head title="Negociar" />
            <div className="flex h-full min-h-0 flex-col lg:flex-row">
                <div className="flex shrink-0 gap-1 border-b border-ink-800 bg-ink-900 p-2 lg:hidden" role="group" aria-label="Seções do terminal">
                    {(
                        [
                            ['chart', 'Gráfico'],
                            ['assets', 'Ativos'],
                            ['positions', `Posições (${open.length})`],
                        ] as const
                    ).map(([tab, label]) => (
                        <button key={tab} type="button" className="chip h-8 flex-1" aria-pressed={mobileTab === tab} onClick={() => setMobileTab(tab)}>
                            {label}
                        </button>
                    ))}
                </div>

                <aside
                    className={`${panelVisibility('assets')} min-h-0 flex-1 flex-col border-ink-800 bg-ink-900 lg:flex lg:flex-none lg:overflow-hidden lg:transition-[width] lg:duration-300 lg:ease-out ${assetsOpen ? 'lg:w-[264px] lg:border-r' : 'lg:w-0'}`}
                    aria-label="Ativos"
                    inert={!assetsOpen && mobileTab !== 'assets' ? true : undefined}
                >
                    <div className="flex min-h-0 w-full flex-1 flex-col lg:w-[264px]">
                        <AssetList assets={assets} categories={categories} recentIds={recentIds} selectedId={selectedId} onSelect={selectAsset} onToggleFavorite={toggleFavorite} />
                    </div>
                </aside>

                <div className={`${mobileTab === 'assets' ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
                    <section className={`${panelVisibility('chart')} min-h-0 min-w-0 flex-1 flex-col bg-ink-900 lg:flex`} aria-label="Gráfico">
                        {selected && (
                            <>
                                <div className="min-h-0 flex-1">
                                    <PriceChart key={selected.id} asset={selected} positions={open} onAssetClick={onAssetsClick} assetsOpen={assetsOpen} onToggleFavorite={toggleFavorite} />
                                </div>
                                <div className="shrink-0 border-t border-ink-800 lg:hidden">
                                    <TicketArea key={selected.id} asset={selected} wallet={wallet} rules={rules} hasFreshQuote={hasFreshQuote} onOpened={onOpened} variant="compact" />
                                </div>
                            </>
                        )}
                    </section>

                    <section className={`${panelVisibility('positions')} min-h-0 min-w-0 flex-1 flex-col border-ink-800 bg-ink-900 lg:flex lg:flex-none lg:border-t ${positionsOpen ? 'lg:h-[220px]' : ''}`} aria-label="Operações">
                        <PositionsPanel open={open} closed={closed} collapsed={!positionsOpen} onToggleCollapsed={togglePositions} />
                    </section>
                </div>

                <aside className="thin-scroll hidden min-h-0 w-[196px] shrink-0 flex-col overflow-y-auto border-l border-ink-800 bg-ink-900 lg:flex" aria-label="Painel de operação">
                    {selected && <TicketArea key={selected.id} asset={selected} wallet={wallet} rules={rules} hasFreshQuote={hasFreshQuote} onOpened={onOpened} variant="full" />}
                </aside>
            </div>
        </AppLayout>
    );
}
