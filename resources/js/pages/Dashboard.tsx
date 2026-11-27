import { Head, Link, usePage } from '@inertiajs/react';
import { Activity, ArrowRight, ChartCandlestick, ChartLine, History, Landmark, RotateCcw, Star, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { OnboardingCard } from '@/components/account/OnboardingCard';
import EquityChart from '@/components/chart/EquityChart';
import { ResultBadge } from '@/components/terminal/PositionsPanel';
import { AssetIcon, Change, DataStatus, EmptyState, LivePrice, Money, Page, PanelHeader, Stat } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import { changePercent, formatDateTime, formatSignedCents } from '@/lib/format';
import type { Asset, Performance, Position, SharedProps, WalletSummary } from '@/lib/types';
import { useAccountPanel } from '@/stores/accountPanel';
import { useMarket } from '@/stores/market';
import { useWallet } from '@/stores/wallet';

function AssetRow({ asset }: { asset: Asset }) {
    const tick = useMarket((state) => state.ticks[asset.id]);
    const price = tick?.price ?? asset.quote?.price ?? null;
    const change = tick ? changePercent(tick.price, tick.open_24h) : (asset.quote?.change_percent ?? null);

    return (
        <li>
            <Link href={`/negociar?asset=${asset.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-ink-800/60">
                <span className="flex min-w-0 items-center gap-2.5">
                    <AssetIcon symbol={asset.symbol} category={asset.category} size={28} />
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{asset.symbol}</span>
                        <span className="block truncate text-xs text-text-3">{asset.name}</span>
                    </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                    {price === null ? (
                        <DataStatus status="unavailable" />
                    ) : (
                        <>
                            <LivePrice price={price} className="px-0.5 text-[13px]" />
                            <span className="block">
                                <Change value={change} size={12} />
                            </span>
                        </>
                    )}
                </span>
            </Link>
        </li>
    );
}

/**
 * How decided operations split. Labelled counts carry the numbers, so identity
 * never depends on color alone.
 */
function OutcomeBar({ performance }: { performance: Performance }) {
    const neutral = performance.neutral + performance.voided;
    const total = performance.won + performance.lost + neutral;
    const parts = [
        { label: 'Positivas', value: performance.won, color: 'bg-up' },
        { label: 'Negativas', value: performance.lost, color: 'bg-down' },
        { label: 'Neutras ou anuladas', value: neutral, color: 'bg-ink-600' },
    ];

    return (
        <div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-ink-800" role="img" aria-label={parts.map((part) => `${part.label}: ${part.value}`).join(', ')}>
                {total > 0 && parts.map((part) => part.value > 0 && <span key={part.label} className={`${part.color} transition-[flex-grow] duration-500`} style={{ flexGrow: part.value }} />)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
                {parts.map((part) => (
                    <li key={part.label} className="flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${part.color}`} aria-hidden="true" />
                        {part.label}: <span className="numeric text-text-1">{part.value}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Dashboard({
    wallet: initialWallet,
    performance,
    recentPositions,
    favorites,
    movers,
}: {
    wallet: WalletSummary;
    performance: Performance;
    recentPositions: { data: Position[] };
    favorites: { data: Asset[] };
    movers: {
        gainers: { data: Asset[] } | Asset[];
        losers: { data: Asset[] } | Asset[];
    };
}) {
    const { auth } = usePage<SharedProps>().props;
    const showAccount = useAccountPanel((state) => state.show);
    const wallet = useWallet((state) => state.summary) ?? initialWallet;
    const isReal = wallet.environment === 'real';
    const decided = performance.won + performance.lost;
    const winRate = decided > 0 ? (performance.won / decided) * 100 : null;
    const gainers = Array.isArray(movers.gainers) ? movers.gainers : movers.gainers.data;
    const losers = Array.isArray(movers.losers) ? movers.losers : movers.losers.data;
    const net = performance.net_result_cents;

    return (
        <AppLayout>
            <Head title="Painel" />
            <Page>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Olá, {auth.user?.first_name}</h1>
                        <p className="mt-0.5 text-[13px] text-text-2">{isReal ? 'Resumo da sua conta real.' : 'Resumo da sua conta demo.'}</p>
                    </div>
                    <Link href="/negociar" className="btn btn-primary">
                        <ChartCandlestick size={17} aria-hidden="true" />
                        Negociar
                    </Link>
                </div>

                <OnboardingCard />

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
                    <section className={`panel relative flex flex-col justify-between gap-6 overflow-hidden p-6 shadow-[var(--shadow-float)] ring-1 ${isReal ? 'ring-real/25' : 'ring-accent/10'}`}>
                        <div className="glow-backdrop absolute inset-0 opacity-70" aria-hidden="true" />
                        <div className="relative">
                            <div className={`label ${isReal ? '!text-real' : ''}`}>{isReal ? 'Saldo real disponível' : 'Saldo demo disponível'}</div>
                            <Money cents={wallet.available_cents} className="mt-2 block text-4xl font-medium tracking-tight" />
                            <p className="mt-2 text-xs text-text-2">
                                <Money cents={wallet.reserved_cents} /> em operações abertas
                            </p>
                        </div>
                        <div className="relative grid grid-cols-2 gap-2">
                            <Link href="/carteira" className="btn btn-ghost btn-sm">
                                <Wallet size={15} aria-hidden="true" />
                                Extrato
                            </Link>
                            {isReal ? (
                                <Link href="/carteira" className="btn btn-primary btn-sm">
                                    <Landmark size={15} aria-hidden="true" />
                                    Depositar
                                </Link>
                            ) : (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => showAccount('demo')}>
                                    <RotateCcw size={15} aria-hidden="true" />
                                    Reiniciar saldo
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="panel flex min-h-[260px] flex-col overflow-hidden">
                        <PanelHeader title="Resultado acumulado" action={<span className={`numeric text-[15px] font-medium ${net > 0 ? 'text-up' : net < 0 ? 'text-down' : 'text-text-2'}`}>{formatSignedCents(net)}</span>} />
                        <div className="min-h-0 flex-1 p-2">
                            {performance.equity_curve.length < 2 ? (
                                <EmptyState icon={<ChartLine size={18} aria-hidden="true" />} title="Ainda sem histórico suficiente">
                                    O gráfico aparece depois de duas operações encerradas.
                                </EmptyState>
                            ) : (
                                <EquityChart points={performance.equity_curve} />
                            )}
                        </div>
                    </section>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Operações" value={performance.total} hint={`${performance.open} abertas agora`} icon={<Activity size={16} aria-hidden="true" />} />
                    <Stat
                        label="Taxa de acerto"
                        value={winRate === null ? '—' : `${winRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                        hint={decided > 0 ? `Em ${decided} decididas` : 'Sem operações decididas'}
                        icon={<Target size={16} aria-hidden="true" />}
                    />
                    <Stat label="Positivas" value={<span className="text-up">{performance.won}</span>} icon={<TrendingUp size={16} aria-hidden="true" />} hint="Fecharam a seu favor" />
                    <Stat label="Negativas" value={<span className="text-down">{performance.lost}</span>} icon={<TrendingDown size={16} aria-hidden="true" />} hint="Fecharam contra você" />
                </div>

                {performance.total > 0 && (
                    <section className="panel p-5">
                        <h2 className="mb-3 font-bold">Distribuição dos resultados</h2>
                        <OutcomeBar performance={performance} />
                    </section>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                    <section className="panel overflow-hidden">
                        <PanelHeader title="Maiores altas em 24 h" />
                        {gainers.length === 0 ? (
                            <EmptyState icon={<TrendingUp size={18} aria-hidden="true" />} title="Sem cotações recentes">
                                O feed de mercado precisa estar ativo.
                            </EmptyState>
                        ) : (
                            <ul className="py-1">
                                {gainers.map((asset) => (
                                    <AssetRow key={asset.id} asset={asset} />
                                ))}
                            </ul>
                        )}
                    </section>
                    <section className="panel overflow-hidden">
                        <PanelHeader title="Maiores baixas em 24 h" />
                        {losers.length === 0 ? (
                            <EmptyState icon={<TrendingDown size={18} aria-hidden="true" />} title="Sem cotações recentes">
                                O feed de mercado precisa estar ativo.
                            </EmptyState>
                        ) : (
                            <ul className="py-1">
                                {losers.map((asset) => (
                                    <AssetRow key={asset.id} asset={asset} />
                                ))}
                            </ul>
                        )}
                    </section>
                    <section className="panel overflow-hidden">
                        <PanelHeader title="Favoritos" />
                        {favorites.data.length === 0 ? (
                            <EmptyState icon={<Star size={18} aria-hidden="true" />} title="Nenhum favorito">
                                Marque a estrela de um ativo na tela Negociar.
                            </EmptyState>
                        ) : (
                            <ul className="py-1">
                                {favorites.data.map((asset) => (
                                    <AssetRow key={asset.id} asset={asset} />
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                <section className="panel overflow-hidden">
                    <PanelHeader
                        title="Últimas operações"
                        action={
                            <Link href="/operacoes" className="inline-flex items-center gap-1 text-xs font-semibold text-text-2 hover:text-text-1">
                                Ver todas
                                <ArrowRight size={13} aria-hidden="true" />
                            </Link>
                        }
                    />
                    {recentPositions.data.length === 0 ? (
                        <EmptyState icon={<History size={18} aria-hidden="true" />} title="Nenhuma operação ainda">
                            Vá em Negociar e faça sua primeira operação.
                        </EmptyState>
                    ) : (
                        <div className="thin-scroll overflow-x-auto">
                            <table className="data-table min-w-[560px]">
                                <thead>
                                    <tr>
                                        <th>Ativo</th>
                                        <th>Direção</th>
                                        <th>Situação</th>
                                        <th data-align="right">Resultado</th>
                                        <th data-align="right">Abertura</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentPositions.data.map((position) => (
                                        <tr key={position.id}>
                                            <td className="font-semibold">
                                                <span className="flex items-center gap-2">
                                                    <AssetIcon symbol={position.symbol} size={20} />
                                                    {position.symbol}
                                                </span>
                                            </td>
                                            <td className={position.direction === 'call' ? 'font-semibold text-up' : 'font-semibold text-down'}>{position.direction === 'call' ? 'CALL' : 'PUT'}</td>
                                            <td>
                                                <ResultBadge position={position} />
                                            </td>
                                            <td data-align="right" className={`numeric ${(position.result_cents ?? 0) > 0 ? 'text-up' : (position.result_cents ?? 0) < 0 ? 'text-down' : ''}`}>
                                                {position.result_cents === null ? '—' : formatSignedCents(position.result_cents)}
                                            </td>
                                            <td data-align="right" className="numeric text-xs text-text-2">
                                                {formatDateTime(position.opened_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </Page>
        </AppLayout>
    );
}
