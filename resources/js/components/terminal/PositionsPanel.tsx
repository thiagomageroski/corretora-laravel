import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, CircleSlash, Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AssetIcon, EmptyState, LivePrice } from '@/components/ui';
import { formatCents, formatCountdown, formatDateTime, formatPrice, formatSignedCents, potentialProfitCents, RESULT_LABELS } from '@/lib/format';
import type { Position } from '@/lib/types';
import { useMarket } from '@/stores/market';

function Direction({ direction }: { direction: Position['direction'] }) {
    return direction === 'call' ? (
        <span className="inline-flex items-center gap-0.5 font-bold text-up">
            <ArrowUpRight size={14} aria-hidden="true" />
            CALL
        </span>
    ) : (
        <span className="inline-flex items-center gap-0.5 font-bold text-down">
            <ArrowDownRight size={14} aria-hidden="true" />
            PUT
        </span>
    );
}

export function ResultBadge({ position }: { position: Position }) {
    const tone = position.result === 'won' ? 'bg-up-soft text-up' : position.result === 'lost' ? 'bg-down-soft text-down' : 'bg-ink-800 text-text-2';

    return <span className={`inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-bold tracking-wide uppercase ${tone}`}>{RESULT_LABELS[position.result ?? ''] ?? 'Aberta'}</span>;
}

function OpenRow({ position, now }: { position: Position; now: number }) {
    const tick = useMarket((state) => state.ticks[position.asset_id]);
    const expiresAt = new Date(position.expires_at).getTime();
    const openedAt = new Date(position.opened_at).getTime();
    const remaining = expiresAt - now;
    const progress = Math.min(100, Math.max(0, ((now - openedAt) / (expiresAt - openedAt)) * 100));
    const current = tick ? Number(tick.price) : null;
    const entry = Number(position.entry_price);
    const ahead = current === null || current === entry ? null : position.direction === 'call' ? current > entry : current < entry;

    return (
        <tr>
            <td className="font-semibold">
                <span className="flex items-center gap-2">
                    <AssetIcon symbol={position.symbol} size={20} />
                    {position.symbol}
                </span>
            </td>
            <td>
                <Direction direction={position.direction} />
            </td>
            <td data-align="right" className="numeric">
                {formatCents(position.stake_cents)}
            </td>
            <td data-align="right" className="numeric text-text-2">
                {formatPrice(position.entry_price)}
            </td>
            <td data-align="right">{tick ? <LivePrice price={tick.price} className="px-0.5" /> : '—'}</td>
            <td data-align="right" className="numeric">
                {ahead === null ? (
                    <span className="text-text-3">Empatada</span>
                ) : ahead ? (
                    <span className="text-up">+{formatCents(potentialProfitCents(position.stake_cents, position.payout_rate_bps))}</span>
                ) : (
                    <span className="text-down">-{formatCents(position.stake_cents)}</span>
                )}
            </td>
            <td className="w-36">
                {remaining > 0 ? (
                    <div>
                        <div className="numeric text-right text-xs">{formatCountdown(remaining)}</div>
                        <div className="progress-track mt-1" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo decorrido">
                            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${position.direction === 'call' ? 'bg-up' : 'bg-down'}`} style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                ) : (
                    <span className="block text-right text-xs font-medium text-demo">Liquidando…</span>
                )}
            </td>
        </tr>
    );
}

/**
 * Open and settled positions under the chart. On large screens it can be
 * collapsed down to its tab bar, which keeps the count of open positions.
 */
export default function PositionsPanel({ open, closed, collapsed = false, onToggleCollapsed }: { open: Position[]; closed: Position[]; collapsed?: boolean; onToggleCollapsed?: () => void }) {
    const [tab, setTab] = useState<'open' | 'closed'>('open');
    const [now, setNow] = useState(() => Date.now());

    const showTab = (next: 'open' | 'closed') => {
        setTab(next);

        if (collapsed) onToggleCollapsed?.();
    };

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className={`flex shrink-0 items-center gap-1 px-3 py-1.5 ${collapsed ? 'lg:border-b-0' : ''} border-b border-ink-800`} role="group" aria-label="Operações">
                <button type="button" className="chip" aria-pressed={tab === 'open'} onClick={() => showTab('open')}>
                    Abertas
                    <span className={`numeric rounded px-1 text-[10px] ${open.length > 0 ? 'bg-accent text-on-accent' : 'bg-ink-800 text-text-3'}`}>{open.length}</span>
                </button>
                <button type="button" className="chip" aria-pressed={tab === 'closed'} onClick={() => showTab('closed')}>
                    Histórico
                </button>
                {onToggleCollapsed && (
                    <button
                        type="button"
                        className="ml-auto hidden h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-text-3 transition-colors hover:bg-ink-800 hover:text-text-1 lg:inline-flex"
                        aria-expanded={!collapsed}
                        onClick={onToggleCollapsed}
                    >
                        {collapsed ? 'Exibir operações' : 'Ocultar'}
                        {collapsed ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                    </button>
                )}
            </div>
            <div className={`thin-scroll min-h-0 flex-1 overflow-auto ${collapsed ? 'lg:hidden' : ''}`}>
                {tab === 'open' &&
                    (open.length === 0 ? (
                        <EmptyState icon={<Clock3 size={18} aria-hidden="true" />} title="Nenhuma operação aberta">
                            Escolha um ativo e use CALL ou PUT para operar.
                        </EmptyState>
                    ) : (
                        <table className="data-table min-w-[720px]">
                            <thead>
                                <tr>
                                    <th>Ativo</th>
                                    <th>Direção</th>
                                    <th data-align="right">Valor</th>
                                    <th data-align="right">Entrada</th>
                                    <th data-align="right">Atual</th>
                                    <th data-align="right">Se fechar agora</th>
                                    <th data-align="right">Vencimento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {open.map((position) => (
                                    <OpenRow key={position.id} position={position} now={now} />
                                ))}
                            </tbody>
                        </table>
                    ))}
                {tab === 'closed' &&
                    (closed.length === 0 ? (
                        <EmptyState icon={<CircleSlash size={18} aria-hidden="true" />} title="Nada encerrado ainda">
                            As operações encerradas ficam aqui, com os preços usados.
                        </EmptyState>
                    ) : (
                        <table className="data-table min-w-[720px]">
                            <thead>
                                <tr>
                                    <th>Ativo</th>
                                    <th>Direção</th>
                                    <th data-align="right">Entrada</th>
                                    <th data-align="right">Encerramento</th>
                                    <th>Situação</th>
                                    <th data-align="right">Resultado</th>
                                    <th data-align="right">Encerrada em</th>
                                </tr>
                            </thead>
                            <tbody>
                                {closed.map((position) => (
                                    <tr key={position.id} className="animate-fade">
                                        <td className="font-semibold">
                                            <span className="flex items-center gap-2">
                                                <AssetIcon symbol={position.symbol} size={20} />
                                                {position.symbol}
                                            </span>
                                        </td>
                                        <td>
                                            <Direction direction={position.direction} />
                                        </td>
                                        <td data-align="right" className="numeric text-text-2">
                                            {formatPrice(position.entry_price)}
                                        </td>
                                        <td data-align="right" className="numeric text-text-2">
                                            {formatPrice(position.close_price)}
                                        </td>
                                        <td>
                                            <ResultBadge position={position} />
                                        </td>
                                        <td data-align="right" className={`numeric ${(position.result_cents ?? 0) > 0 ? 'text-up' : (position.result_cents ?? 0) < 0 ? 'text-down' : ''}`}>
                                            {formatSignedCents(position.result_cents ?? 0)}
                                        </td>
                                        <td data-align="right" className="numeric text-xs text-text-2">
                                            {formatDateTime(position.settled_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ))}
            </div>
        </div>
    );
}
