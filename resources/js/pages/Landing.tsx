import { Deferred, Head, Link } from '@inertiajs/react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import {
    ArrowDownRight,
    ArrowLeftRight,
    ArrowRight,
    ArrowUpRight,
    Bitcoin,
    Building2,
    ChartCandlestick,
    ChartLine,
    Check,
    CircleCheckBig,
    Clock,
    Copy,
    FileCheck2,
    FlaskConical,
    Gem,
    KeyRound,
    Layers,
    Lock,
    Plus,
    Radio,
    ShieldCheck,
    Sigma,
    Smartphone,
    Wallet,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CountUp, Reveal } from '@/components/landing/motion';
import { AssetIcon, Change, LiveDot, LivePrice } from '@/components/ui';
import PublicLayout from '@/layouts/PublicLayout';
import { changePercent, formatCents, formatDuration, formatPrice, potentialProfitCents, providerName } from '@/lib/format';
import type { Candle, CandleResponse, Category } from '@/lib/types';
import { startMarketFeed, useMarket } from '@/stores/market';

type SnapshotItem = { id: number; symbol: string; name: string; price: string; open_24h: string | null; source: string; source_at: string };

type Figures = {
    payout_percent: number;
    payout_bps: number;
    min_stake_cents: number;
    max_stake_cents: number;
    durations_seconds: number[];
    demo_balance_cents: number;
    min_deposit_cents: number;
    min_withdrawal_cents: number;
    daily_withdrawal_limit_cents: number;
};

type LandingCategory = Category & { tradable_count?: number };

type Props = { categories: LandingCategory[]; canRegister: boolean; snapshot: SnapshotItem[]; figures: Figures; heroChart?: CandleResponse | null };

const priceFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "R$ 20,00" becomes "R$ 20": whole amounts read better in headlines. */
function wholeMoney(cents: number): string {
    return formatCents(cents).replace(/,00$/, '');
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    crypto: Bitcoin,
    forex: ArrowLeftRight,
    stocks: Building2,
    indices: ChartLine,
    commodities: Gem,
    etfs: Layers,
};

/* ------------------------------------------------------------------ */
/* Hero                                                                 */
/* ------------------------------------------------------------------ */

function HeroChart({ candles }: { candles: Candle[] }) {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!container.current || candles.length === 0) return;

        const chart = createChart(container.current, {
            autoSize: true,
            // The credit for Lightweight Charts is in the footer of every public page.
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7f8a9a', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, attributionLogo: false },
            localization: { priceFormatter: (price: number) => priceFormat.format(price) },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(120,135,160,0.07)' } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.06 } },
            timeScale: { borderVisible: false, visible: false },
            handleScroll: false,
            handleScale: false,
            crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
        });
        chart
            .addSeries(AreaSeries, { lineColor: '#c6f24e', lineWidth: 2, topColor: 'rgba(198,242,78,0.24)', bottomColor: 'rgba(198,242,78,0)', priceLineVisible: false, lastValueVisible: false })
            .setData(candles.map((candle) => ({ time: candle.time as UTCTimestamp, value: Number(candle.close) })));
        chart.timeScale().fitContent();

        return () => chart.remove();
    }, [candles]);

    return <div ref={container} className="absolute inset-0" role="img" aria-label="Gráfico do Bitcoin nos últimos 4 dias" />;
}

function TicketField({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
    return (
        <div className="rounded-xl border border-ink-800 bg-ink-950/70 px-3 py-2">
            <div className="text-[10px] font-semibold tracking-wider text-text-3 uppercase">{label}</div>
            <div className="numeric mt-0.5 flex items-center gap-1.5 text-[15px] font-medium">
                {Icon && <Icon size={13} className="text-text-3" aria-hidden="true" />}
                {value}
            </div>
        </div>
    );
}

/** A live price card floating beside the product shot. */
function QuoteCard({ item, payout, className = '' }: { item: SnapshotItem; payout: number; className?: string }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <div className={`w-[200px] rounded-2xl border border-ink-700 bg-ink-850 p-4 shadow-[var(--shadow-float)] ${className}`} aria-hidden="true">
            <div className="flex items-center gap-2.5">
                <AssetIcon symbol={item.symbol} category="crypto" size={26} />
                <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold">{item.name}</div>
                    <div className="text-[11px] text-text-3">{item.symbol}</div>
                </div>
            </div>
            <div className="mt-3.5 flex items-end justify-between gap-2">
                <LivePrice price={price} className="text-[14px] font-medium" />
                <span className="text-[11px]">
                    <Change value={changePercent(price, tick?.open_24h ?? item.open_24h)} size={11} />
                </span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-up/10 px-2.5 py-1.5 text-[11px]">
                <span className="text-text-2">Retorno</span>
                <span className="numeric font-semibold text-up">{payout}%</span>
            </div>
        </div>
    );
}

/**
 * The trading screen in miniature: a real chart and live price, with an order
 * ticket whose figures come from the platform's own settings.
 */
function HeroTerminal({ snapshot, heroChart, figures }: { snapshot: SnapshotItem[]; heroChart?: CandleResponse | null; figures: Figures }) {
    const first = snapshot[0];
    const tick = useMarket((state) => (first ? state.ticks[first.id] : undefined));
    const price = tick?.price ?? first?.price;
    const stake = Math.min(figures.max_stake_cents, Math.max(figures.min_stake_cents, 5_000));
    const profit = potentialProfitCents(stake, figures.payout_bps);
    const duration = figures.durations_seconds[1] ?? figures.durations_seconds[0] ?? 60;

    return (
        <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(55%_55%_at_60%_45%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent)]" aria-hidden="true" />

            <div className="panel gradient-border relative overflow-hidden !rounded-[22px] shadow-[var(--shadow-float)]">
                <div className="relative flex items-center justify-between gap-3 border-b border-ink-800/80 px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <AssetIcon symbol={first?.symbol ?? 'BTC/USD'} category="crypto" size={32} />
                        <div className="min-w-0">
                            <div className="text-[15px] font-bold">{first?.symbol ?? 'BTC/USD'}</div>
                            <div className="truncate text-[11px] text-text-3">
                                {first?.name ?? 'Bitcoin'} · Retorno <span className="text-up">{figures.payout_percent}%</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        {price ? <LivePrice price={price} className="px-0.5 text-lg font-medium" /> : <span className="numeric text-text-3">—</span>}
                        <div className="text-xs">
                            <Change value={price ? changePercent(price, tick?.open_24h ?? first?.open_24h) : null} size={12} />
                        </div>
                    </div>
                </div>

                <div className="relative h-[220px] sm:h-[280px]">
                    <span className="numeric absolute top-3 left-4 z-10 rounded-md border border-ink-800 bg-ink-950/70 px-2 py-0.5 text-[10px] text-text-3 sm:left-5">Velas de 1 h · 4 dias</span>
                    <Deferred data="heroChart" fallback={<div className="skeleton absolute inset-5" />}>
                        {heroChart && heroChart.candles.length > 0 ? <HeroChart candles={heroChart.candles} /> : <div className="grid h-full place-items-center p-6 text-center text-xs text-text-3">Gráfico indisponível no momento.</div>}
                    </Deferred>
                </div>

                <div className="relative grid grid-cols-2 gap-2 border-t border-ink-800/80 bg-ink-950/40 p-3 sm:grid-cols-[1fr_1fr_1.15fr_1.15fr] sm:p-4" aria-hidden="true">
                    <TicketField label="Valor" value={formatCents(stake)} />
                    <TicketField label="Prazo" value={formatDuration(duration)} icon={Clock} />
                    <span className="btn h-auto min-h-12 bg-up text-[15px] font-bold text-[#04130e] shadow-[0_10px_24px_-14px_var(--color-up)]">
                        <ArrowUpRight size={17} />
                        CALL
                    </span>
                    <span className="btn h-auto min-h-12 bg-down text-[15px] font-bold text-[#1d070b] shadow-[0_10px_24px_-14px_var(--color-down)]">
                        <ArrowDownRight size={17} />
                        PUT
                    </span>
                </div>

                <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ink-800/80 px-4 py-2.5 text-[11px] text-text-3 sm:px-5">
                    <span className="flex items-center gap-2">
                        <LiveDot />
                        {first ? `Cotação em tempo real · ${providerName(first.source)}` : 'Conectando às cotações…'}
                    </span>
                    <span>
                        Se acertar, recebe <span className="numeric font-semibold text-up">{formatCents(stake + profit)}</span>
                    </span>
                </div>
            </div>

            {snapshot[1] && <QuoteCard item={snapshot[1]} payout={figures.payout_percent} className="absolute top-[38%] -left-10 z-10 hidden animate-float-slow xl:block" />}

            <div className="absolute -right-6 -bottom-16 z-10 hidden items-center gap-3 rounded-2xl border border-up/25 bg-ink-850 py-3 pr-5 pl-3 shadow-[var(--shadow-float)] xl:flex" aria-hidden="true">
                <span className="grid size-9 place-items-center rounded-xl bg-up/15 text-up">
                    <CircleCheckBig size={18} />
                </span>
                <span>
                    <span className="block text-[13px] font-bold">PIX confirmado</span>
                    <span className="block text-[11px] text-text-3">Saldo disponível para operar</span>
                </span>
            </div>
        </div>
    );
}

function HeroStat({ value, label }: { value: string; label: string }) {
    return (
        // The label comes first for screen readers; the value is shown on top.
        <div className="flex flex-col-reverse px-4 py-3.5 text-center sm:px-5 lg:text-left">
            <dt className="mt-0.5 text-[11px] leading-snug text-text-3 sm:text-xs">{label}</dt>
            <dd className="numeric text-[19px] font-semibold tracking-tight sm:text-[22px]">{value}</dd>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Markets                                                              */
/* ------------------------------------------------------------------ */

function TickerItem({ item }: { item: SnapshotItem }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <span className="flex shrink-0 items-center gap-2.5 px-6 text-[13px]">
            <AssetIcon symbol={item.symbol} category="crypto" size={20} />
            <span className="font-semibold">{item.symbol}</span>
            <span className="numeric text-text-2">{formatPrice(price)}</span>
            <span className="text-xs">
                <Change value={changePercent(price, tick?.open_24h ?? item.open_24h)} size={12} />
            </span>
        </span>
    );
}

function MarketRow({ item, payout, href }: { item: SnapshotItem; payout: number; href: string }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <li>
            <Link
                href={href}
                className="group grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-800/50 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_28px]"
            >
                <span className="flex min-w-0 items-center gap-3">
                    <AssetIcon symbol={item.symbol} category="crypto" size={30} />
                    <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold">{item.name}</span>
                        <span className="block text-[11px] text-text-3">{item.symbol}</span>
                    </span>
                </span>
                <span className="text-right text-[14px]">
                    <LivePrice price={price} className="px-0.5" />
                </span>
                <span className="text-right text-[13px]">
                    <Change value={changePercent(price, tick?.open_24h ?? item.open_24h)} size={13} />
                </span>
                <span className="numeric hidden text-right text-[13px] font-semibold text-up sm:block">{payout}%</span>
                <span className="hidden size-7 place-items-center rounded-full text-text-3 transition-all group-hover:bg-accent group-hover:text-on-accent sm:grid">
                    <ArrowUpRight size={15} aria-hidden="true" />
                </span>
            </Link>
        </li>
    );
}

function MarketTable({ snapshot, payout, href, tradable }: { snapshot: SnapshotItem[]; payout: number; href: string; tradable: number }) {
    const rows = snapshot.slice(0, 8);

    return (
        <div className="panel h-full overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-5 py-4">
                <div className="flex items-center gap-2.5">
                    <LiveDot />
                    <span className="text-[14px] font-bold">Cotações agora</span>
                </div>
                <span className="text-[12px] text-text-3">Atualizado a cada negócio</span>
            </div>
            <div
                className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3 border-b border-ink-800/70 bg-ink-950/30 px-5 py-2.5 text-[10px] font-semibold tracking-wider text-text-3 uppercase sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_28px]"
                aria-hidden="true"
            >
                <span>Ativo</span>
                <span className="text-right">Preço</span>
                <span className="text-right">24 h</span>
                <span className="hidden text-right sm:block">Retorno</span>
                <span className="hidden sm:block" />
            </div>
            {rows.length > 0 ? (
                <ul className="divide-y divide-ink-800/70">
                    {rows.map((item) => (
                        <MarketRow key={item.id} item={item} payout={payout} href={href} />
                    ))}
                </ul>
            ) : (
                <p className="px-5 py-12 text-center text-[13px] text-text-3">As cotações aparecem aqui assim que a conexão com o mercado é estabelecida.</p>
            )}
            {tradable > rows.length && (
                <div className="border-t border-ink-800 px-5 py-3.5 text-[12px] text-text-3">
                    Mostrando {rows.length} de {tradable} criptomoedas negociáveis.{' '}
                    <Link href={href} className="font-semibold text-accent hover:text-accent-strong">
                        Ver todas
                    </Link>
                </div>
            )}
        </div>
    );
}

function CatalogPanel({ categories, total, tradable }: { categories: LandingCategory[]; total: number; tradable: number }) {
    return (
        <div className="panel flex h-full flex-col p-6">
            <div className="label">Catálogo da plataforma</div>
            <div className="mt-3 flex items-baseline gap-2">
                <span className="numeric text-5xl font-bold tracking-tight">
                    <CountUp value={total} />
                </span>
                <span className="text-text-2">ativos</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-2">
                <span className="font-semibold text-up">{tradable} negociáveis agora</span>, 24 horas por dia. Os demais ficam disponíveis para acompanhamento.
            </p>

            <ul className="mt-6 flex flex-1 flex-col gap-1">
                {/* Markets open for trading first, then the rest in catalog order. */}
                {[...categories]
                    .sort((a, b) => Number((b.tradable_count ?? 0) > 0) - Number((a.tradable_count ?? 0) > 0))
                    .map((category) => {
                        const Icon = CATEGORY_ICONS[category.code] ?? Layers;
                        const tradableHere = category.tradable_count ?? 0;

                        return (
                            <li key={category.code} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-800/40">
                                <span className="icon-tile size-9 shrink-0 !rounded-[10px]">
                                    <Icon size={16} aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[14px] font-semibold">{category.name}</span>
                                    <span className="numeric block text-[11px] text-text-3">{category.assets_count ?? 0} ativos</span>
                                </span>
                                {tradableHere > 0 ? (
                                    <span className="rounded-full bg-up/12 px-2.5 py-1 text-[11px] font-semibold text-up">Negociável</span>
                                ) : (
                                    <span className="rounded-full bg-ink-800 px-2.5 py-1 text-[11px] font-medium text-text-3">Acompanhamento</span>
                                )}
                            </li>
                        );
                    })}
            </ul>

            <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-ink-800 bg-ink-950/50 px-3.5 py-3 text-[12px] text-text-2">
                <LiveDot />
                Criptomoedas abertas para negociar inclusive à noite e no fim de semana.
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* How it works                                                         */
/* ------------------------------------------------------------------ */

/**
 * What an amount turns into, with the same rounding the platform settles
 * with. Purely a calculation: it opens nothing.
 */
function ReturnCalculator({ figures }: { figures: Figures }) {
    const min = figures.min_stake_cents;
    const max = Math.max(min + 100, Math.min(figures.max_stake_cents, 100_000));
    const presets = [1_000, 5_000, 10_000, 50_000].filter((cents) => cents >= min && cents <= max);
    const [stake, setStake] = useState(() => Math.min(max, Math.max(min, 10_000)));
    const profit = potentialProfitCents(stake, figures.payout_bps);
    const fill = ((stake - min) / (max - min)) * 100;

    return (
        <div className="panel gradient-border relative overflow-hidden !rounded-[24px] p-6 shadow-[var(--shadow-float)] sm:p-8">
            <div className="aurora -top-24 -right-24 h-56 w-56 bg-accent/15" aria-hidden="true" />
            <div className="relative">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[15px] font-bold">Simulador de retorno</div>
                        <div className="text-[12px] text-text-3">Veja quanto uma operação pode render</div>
                    </div>
                    <span className="numeric rounded-full border border-up/30 bg-up/10 px-3 py-1 text-[12px] font-semibold text-up">{figures.payout_percent}%</span>
                </div>

                <div className="mt-7">
                    <label htmlFor="simulated-stake" className="label">
                        Valor da operação
                    </label>
                    <output htmlFor="simulated-stake" className="numeric mt-1 block text-[40px] leading-tight font-semibold tracking-tight">
                        {formatCents(stake)}
                    </output>
                    <input id="simulated-stake" type="range" className="range mt-4" min={min} max={max} step={100} value={stake} onChange={(event) => setStake(Number(event.target.value))} style={{ '--fill': `${fill}%` } as CSSProperties} />
                    <div className="numeric mt-2 flex justify-between text-[11px] text-text-3">
                        <span>{wholeMoney(min)}</span>
                        <span>{wholeMoney(max)}</span>
                    </div>
                    {presets.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Valores rápidos">
                            {presets.map((cents) => (
                                <button key={cents} type="button" className="chip numeric border border-ink-800" aria-pressed={stake === cents} onClick={() => setStake(cents)}>
                                    {wholeMoney(cents)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-2" aria-live="polite">
                    <div className="rounded-2xl border border-up/25 bg-up/[0.07] p-4">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-up">
                            <ArrowUpRight size={14} aria-hidden="true" />
                            Se acertar, você recebe
                        </div>
                        <div className="numeric mt-1.5 text-2xl font-semibold">{formatCents(stake + profit)}</div>
                        <div className="numeric mt-0.5 text-[12px] text-up">+{formatCents(profit)} de lucro</div>
                    </div>
                    <div className="rounded-2xl border border-down/25 bg-down/[0.06] p-4">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-down">
                            <ArrowDownRight size={14} aria-hidden="true" />
                            Se errar, você perde
                        </div>
                        <div className="numeric mt-1.5 text-2xl font-semibold">{formatCents(stake)}</div>
                        <div className="mt-0.5 text-[12px] text-text-3">o valor da operação</div>
                    </div>
                </div>

                <p className="mt-5 text-[12px] leading-relaxed text-text-3">Preço igual no vencimento devolve o valor investido. O retorno de cada ativo aparece na tela antes de você confirmar a operação.</p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Platform                                                             */
/* ------------------------------------------------------------------ */

/** Decorative candlesticks with a moving average, drawn from a fixed series. */
function CandleArt() {
    const { candles, average, width, height } = useMemo(() => {
        const count = 34;
        const series: { open: number; close: number; high: number; low: number }[] = [];
        let previous = 50;

        for (let index = 0; index < count; index++) {
            const trend = index * 0.42 + Math.sin(index / 3.1) * 3.4 + Math.sin(index / 1.4) * 1.3;
            const close = 50 + trend;
            const open = previous;
            series.push({ open, close, high: Math.max(open, close) + 0.9 + (index % 4) * 0.45, low: Math.min(open, close) - 0.8 - (index % 5) * 0.35 });
            previous = close;
        }

        const values = series.flatMap((candle) => [candle.high, candle.low]);
        const top = Math.max(...values);
        const bottom = Math.min(...values);
        const chartWidth = 640;
        const chartHeight = 170;
        const step = chartWidth / count;
        const y = (value: number) => 12 + ((top - value) / (top - bottom)) * (chartHeight - 24);
        const points = series.map((candle, index) => {
            const window = series.slice(Math.max(0, index - 4), index + 1);
            const mean = window.reduce((sum, item) => sum + item.close, 0) / window.length;

            return `${(index * step + step / 2).toFixed(1)},${y(mean).toFixed(1)}`;
        });

        return {
            width: chartWidth,
            height: chartHeight,
            average: points.join(' '),
            candles: series.map((candle, index) => ({
                x: index * step + step / 2,
                bodyTop: y(Math.max(candle.open, candle.close)),
                bodyBottom: y(Math.min(candle.open, candle.close)),
                high: y(candle.high),
                low: y(candle.low),
                up: candle.close >= candle.open,
                bodyWidth: step * 0.56,
            })),
        };
    }, []);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="candle-art-fade" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
                    <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
                </linearGradient>
                <mask id="candle-art-mask">
                    <rect width={width} height={height} fill="url(#candle-art-fade)" />
                </mask>
            </defs>
            <g mask="url(#candle-art-mask)">
                {candles.map((candle, index) => (
                    <g key={index} stroke={candle.up ? '#26b98a' : '#ef5a6f'} fill={candle.up ? '#26b98a' : '#ef5a6f'}>
                        <line x1={candle.x} x2={candle.x} y1={candle.high} y2={candle.low} strokeWidth="1.4" />
                        <rect x={candle.x - candle.bodyWidth / 2} y={candle.bodyTop} width={candle.bodyWidth} height={Math.max(1.5, candle.bodyBottom - candle.bodyTop)} rx="1.5" />
                    </g>
                ))}
                <polyline points={average} fill="none" stroke="#c6f24e" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
            </g>
        </svg>
    );
}

function LiveMiniRow({ item }: { item: SnapshotItem }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <li className="flex items-center gap-3 rounded-xl border border-ink-800/80 bg-ink-950/50 px-3 py-2.5">
            <AssetIcon symbol={item.symbol} category="crypto" size={24} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.symbol}</span>
            <LivePrice price={price} className="text-[13px]" />
        </li>
    );
}

function BentoCard({ icon: Icon, title, text, className = '', children }: { icon: LucideIcon; title: string; text: string; className?: string; children?: ReactNode }) {
    return (
        <div className={`panel panel-hover group flex h-full flex-col overflow-hidden ${className}`}>
            <div className="p-6 sm:p-7">
                <span className="icon-tile size-11 transition-transform duration-300 group-hover:-rotate-6">
                    <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[18px] font-bold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-md leading-relaxed text-text-2">{text}</p>
            </div>
            {children && <div className="mt-auto">{children}</div>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* PIX                                                                  */
/* ------------------------------------------------------------------ */

/** A QR-like pattern for the illustration. Decorative: it encodes nothing. */
function QrPattern() {
    const size = 25;
    const cells = useMemo(() => {
        const finder = (row: number, column: number) => {
            const inCorner = (r: number, c: number) => r >= 0 && r < 7 && c >= 0 && c < 7;
            const corners: [number, number][] = [
                [0, 0],
                [0, size - 7],
                [size - 7, 0],
            ];

            for (const [top, left] of corners) {
                const r = row - top;
                const c = column - left;

                if (inCorner(r, c)) {
                    return r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 'on' : 'off';
                }

                if (r >= -1 && r <= 7 && c >= -1 && c <= 7) return 'off';
            }

            return null;
        };

        const result: { row: number; column: number }[] = [];

        for (let row = 0; row < size; row++) {
            for (let column = 0; column < size; column++) {
                const fixed = finder(row, column);
                const centre = row >= 10 && row <= 14 && column >= 10 && column <= 14;
                const filled = fixed === 'on' || (fixed === null && !centre && ((row * 7 + column * 13 + row * column) % 5 < 2 || (row + column * 3) % 7 === 0));

                if (filled) result.push({ row, column });
            }
        }

        return result;
    }, []);

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="size-full" shapeRendering="crispEdges" aria-hidden="true">
            {cells.map((cell) => (
                <rect key={`${cell.row}-${cell.column}`} x={cell.column} y={cell.row} width="1" height="1" fill="#0b0f14" />
            ))}
        </svg>
    );
}

function PixVisual({ figures }: { figures: Figures }) {
    const amount = Math.max(figures.min_deposit_cents, 10_000);

    return (
        <div className="relative mx-auto w-full max-w-[420px]" aria-hidden="true">
            <div className="absolute -inset-10 -z-10 rounded-[56px] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_srgb,var(--color-accent)_13%,transparent),transparent)]" />
            <div className="panel gradient-border relative !rounded-[26px] p-6 shadow-[var(--shadow-float)] sm:p-7">
                <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex items-center gap-2 text-[13px] font-bold">
                        <Lock size={14} className="text-up" />
                        Depósito via PIX
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-demo/12 px-2.5 py-1 text-[11px] font-semibold text-demo">
                        <span className="size-1.5 rounded-full bg-demo" />
                        Aguardando pagamento
                    </span>
                </div>
                <div className="relative mt-5 text-center">
                    <div className="text-[11px] tracking-wider text-text-3 uppercase">Valor</div>
                    <div className="numeric mt-1 text-[32px] font-semibold tracking-tight">{formatCents(amount)}</div>
                </div>
                <div className="relative mx-auto mt-5 size-[188px] rounded-2xl bg-[#f4f6f8] p-3.5 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)]">
                    <QrPattern />
                    <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg bg-accent text-[15px] font-black text-on-accent shadow-md">N</span>
                </div>
                <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-950 py-1.5 pr-1.5 pl-3">
                    <span className="numeric min-w-0 flex-1 truncate text-[12px] text-text-3">00020126580014BR.GOV.BCB.PIX0136…</span>
                    <span className="btn btn-sm h-8 border border-ink-700 bg-ink-800 text-[12px] text-text-1">
                        <Copy size={13} />
                        Copiar
                    </span>
                </div>
                <p className="relative mt-4 text-center text-[11px] text-text-3">Pague pelo aplicativo do seu banco</p>
            </div>

            <div className="absolute right-3 -bottom-12 flex items-center gap-3 rounded-2xl border border-up/25 bg-ink-850 py-3 pr-5 pl-3 shadow-[var(--shadow-float)] sm:-right-10">
                <span className="grid size-9 place-items-center rounded-xl bg-up/15 text-up">
                    <Check size={18} strokeWidth={3} />
                </span>
                <span>
                    <span className="block text-[13px] font-bold">Pagamento confirmado</span>
                    <span className="block text-[11px] text-text-3">Saldo creditado na sua conta</span>
                </span>
            </div>
        </div>
    );
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
    return (
        <li className="flex gap-4">
            <span className="icon-tile size-10 shrink-0 !rounded-xl">
                <Icon size={18} aria-hidden="true" />
            </span>
            <div>
                <div className="font-semibold text-text-1">{title}</div>
                <p className="mt-0.5 text-[14px] leading-relaxed text-text-2">{text}</p>
            </div>
        </li>
    );
}

/* ------------------------------------------------------------------ */
/* Shared                                                               */
/* ------------------------------------------------------------------ */

function SectionTitle({ eyebrow, title, text, align = 'left' }: { eyebrow: string; title: ReactNode; text?: ReactNode; align?: 'left' | 'center' }) {
    const centred = align === 'center';

    return (
        <Reveal className={centred ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
            <p className={`eyebrow ${centred ? 'justify-center' : ''}`}>{eyebrow}</p>
            <h2 className="mt-4 text-[34px] leading-[1.06] font-bold tracking-[-0.028em] sm:text-[46px]">{title}</h2>
            {text && <p className={`mt-5 text-[16px] leading-relaxed text-text-2 ${centred ? 'mx-auto max-w-xl' : 'max-w-xl'}`}>{text}</p>}
        </Reveal>
    );
}

export default function Landing({ categories, canRegister, snapshot, figures, heroChart }: Props) {
    const total = categories.reduce((sum, category) => sum + (category.assets_count ?? 0), 0);
    const tradable = categories.reduce((sum, category) => sum + (category.tradable_count ?? 0), 0);
    const primaryHref = canRegister ? '/register' : '/negociar';
    const primaryLabel = canRegister ? 'Criar conta grátis' : 'Negociar agora';
    const breakEven = (100 / (100 + figures.payout_percent)) * 100;
    const shortestDuration = formatDuration(figures.durations_seconds[0] ?? 60);
    const longestDuration = formatDuration(figures.durations_seconds[figures.durations_seconds.length - 1] ?? 3600);

    useEffect(() => startMarketFeed({ polling: false }), []);

    const steps = [
        { title: 'Crie sua conta grátis', text: `O cadastro leva poucos minutos, e você já começa com ${formatCents(figures.demo_balance_cents)} na conta demo para treinar sem arriscar nada.` },
        { title: 'Escolha o ativo, o valor e o prazo', text: `Opere a partir de ${formatCents(figures.min_stake_cents)}, com prazos de ${shortestDuration} a ${longestDuration}. O retorno aparece antes de você confirmar.` },
        { title: 'CALL ou PUT, e pronto', text: 'Acha que o preço vai subir? CALL. Que vai cair? PUT. No vencimento, o resultado entra direto no seu saldo.' },
    ];

    const security = [
        { icon: KeyRound, title: 'Verificação em duas etapas', text: 'Proteja o acesso com um código do seu aplicativo autenticador.' },
        { icon: Lock, title: 'Dados criptografados', text: 'CPF e chaves PIX guardados com criptografia, em conexão sempre segura.' },
        { icon: FileCheck2, title: 'Resultados auditáveis', text: 'Entrada e encerramento registrados no servidor, com a fonte e o horário de cada preço.' },
        { icon: Smartphone, title: 'Em qualquer tela', text: 'Opere pelo navegador do computador, do tablet ou do celular, sem instalar nada.' },
    ];

    const faq = [
        {
            question: 'Quais são os valores mínimos de depósito e de saque?',
            answer: `O depósito mínimo é de ${formatCents(figures.min_deposit_cents)} e o saque mínimo é de ${formatCents(figures.min_withdrawal_cents)}, ambos por PIX. Cada operação pode começar em ${formatCents(figures.min_stake_cents)}.`,
        },
        {
            question: 'Posso sacar meu dinheiro quando quiser?',
            answer: `Sim. O saque é feito por PIX para uma chave registrada no seu CPF, com limite de ${formatCents(figures.daily_withdrawal_limit_cents)} por dia. Para sua segurança, cada pedido passa por uma verificação antes do envio, e o saque só aparece como concluído quando a transferência é confirmada.`,
        },
        { question: 'Posso operar pelo celular?', answer: 'Sim. A plataforma funciona no navegador do celular, do tablet e do computador, com telas adaptadas a cada tamanho. Não é preciso instalar nada.' },
        {
            question: 'Quais ativos posso negociar?',
            answer: 'As criptomoedas podem ser negociadas 24 horas por dia, com cotação em tempo real. Ações, forex e outros ativos do catálogo aparecem para acompanhamento e são liberados para negociação conforme a cobertura de cotações.',
        },
        {
            question: 'Como o resultado de uma operação é definido?',
            answer: 'Na abertura, o servidor registra o preço de entrada. No vencimento, usa o preço de fechamento do último segundo antes do prazo. Em CALL você ganha se o preço fechar acima da entrada; em PUT, se fechar abaixo. Preço igual devolve o valor investido.',
        },
        {
            question: 'Quais são os riscos?',
            answer: `Com retorno de ${figures.payout_percent}%, cada acerto rende menos do que cada erro custa: é preciso acertar mais de ${breakEven.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% das operações só para empatar. Você pode perder todo o valor de cada operação. Opere apenas com dinheiro que pode perder.`,
        },
    ];

    return (
        <PublicLayout>
            <Head title="Uma corretora, incontáveis oportunidades" />

            {/* Hero */}
            <section id="inicio" className="relative -mt-16 scroll-mt-16 overflow-hidden pt-16">
                <div className="aurora -top-48 right-[-10%] h-[560px] w-[760px] bg-accent/20" aria-hidden="true" />
                <div className="aurora top-56 -left-48 h-[420px] w-[560px] bg-info/15 [animation-delay:-6s]" aria-hidden="true" />
                <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" aria-hidden="true" />

                <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pt-12 pb-24 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pt-24 lg:pb-32">
                    <div className="text-center lg:text-left">
                        <span className="inline-flex animate-rise items-center gap-2.5 rounded-full border border-ink-700/80 bg-ink-900/70 py-1 pr-3.5 pl-1 text-xs font-medium text-text-2 backdrop-blur">
                            <span className="flex items-center gap-1.5 rounded-full bg-up/12 px-2 py-0.5 text-[11px] font-bold text-up">
                                <LiveDot />
                                Ao vivo
                            </span>
                            Mercado cripto aberto 24 horas, todos os dias
                        </span>

                        <h1 className="mt-7 animate-rise text-[44px] leading-[1.02] font-bold tracking-[-0.04em] [animation-delay:60ms] sm:text-[60px] lg:text-[66px]">
                            Uma corretora,
                            <br />
                            incontáveis <span className="text-gradient">oportunidades.</span>
                        </h1>

                        <p className="mx-auto mt-6 max-w-xl animate-rise text-[17px] leading-relaxed text-text-2 [animation-delay:120ms] lg:mx-0">
                            Opere criptomoedas com cotação em tempo real, treine com {wholeMoney(figures.demo_balance_cents)} na conta demo e movimente seu saldo por PIX. Tudo em uma plataforma rápida e transparente.
                        </p>

                        <div className="mt-9 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:180ms] lg:justify-start">
                            <Link href={primaryHref} className="btn btn-primary !h-[54px] !px-8 text-[15px]">
                                {primaryLabel}
                                <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                            <a href="#como-funciona" className="btn btn-ghost !h-[54px] !px-7 text-[15px]">
                                Como funciona
                            </a>
                        </div>

                        <dl className="mx-auto mt-11 grid max-w-lg animate-rise grid-cols-3 divide-x divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/55 backdrop-blur [animation-delay:240ms] lg:mx-0">
                            <HeroStat value={`${figures.payout_percent}%`} label="de retorno no acerto" />
                            <HeroStat value={wholeMoney(figures.min_deposit_cents)} label="depósito mínimo" />
                            <HeroStat value={shortestDuration} label="prazo a partir de" />
                        </dl>
                    </div>

                    <div className="animate-rise [animation-delay:200ms]">
                        <HeroTerminal snapshot={snapshot} heroChart={heroChart} figures={figures} />
                    </div>
                </div>
            </section>

            {/* Live ticker */}
            {snapshot.length > 0 && (
                <section aria-label="Cotações" className="overflow-hidden border-y border-ink-800/80 bg-ink-900/50 py-3.5 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
                    <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
                        {[...snapshot, ...snapshot].map((item, index) => (
                            <TickerItem key={`${item.id}-${index}`} item={item} />
                        ))}
                    </div>
                </section>
            )}

            {/* Markets */}
            <section id="mercados" className="scroll-mt-20 py-24 sm:py-28">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <SectionTitle
                            eyebrow="Mercados"
                            title={
                                <>
                                    Criptomoedas ao vivo, <span className="text-text-3">a qualquer hora do dia.</span>
                                </>
                            }
                        />
                        <Reveal delay={100} className="max-w-sm leading-relaxed text-text-2 lg:pb-2">
                            Preços atualizados a cada negócio e operações abertas em poucos cliques, inclusive à noite e no fim de semana.
                        </Reveal>
                    </div>

                    <div className="mt-12 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                        <Reveal>
                            <MarketTable snapshot={snapshot} payout={figures.payout_percent} href={primaryHref} tradable={tradable} />
                        </Reveal>
                        <Reveal delay={120}>
                            <CatalogPanel categories={categories} total={total} tradable={tradable} />
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section id="como-funciona" className="relative scroll-mt-20 overflow-hidden border-y border-ink-800/70 bg-ink-900/35 py-24 sm:py-28">
                <div className="grid-backdrop absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_60%_70%_at_80%_50%,black,transparent)]" aria-hidden="true" />
                <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.02fr] lg:gap-16">
                    <div>
                        <SectionTitle eyebrow="Como funciona" title="Da conta criada à primeira operação em minutos." text="Sem jargão e sem etapas escondidas. Você sabe quanto pode ganhar e quanto pode perder antes de cada operação." />
                        <ol className="mt-10 flex flex-col">
                            {steps.map((step, index) => (
                                <Reveal as="li" key={step.title} delay={index * 120} className="relative flex gap-5 pb-8 last:pb-0">
                                    {index < steps.length - 1 && <span className="absolute top-11 bottom-1 left-[19px] w-px bg-gradient-to-b from-accent/60 to-ink-700" aria-hidden="true" />}
                                    <span className="numeric grid size-10 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-[14px] font-bold text-accent shadow-[var(--shadow-glow)]">{index + 1}</span>
                                    <div className="pt-1.5">
                                        <h3 className="text-[17px] font-bold">{step.title}</h3>
                                        <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-text-2">{step.text}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </ol>
                    </div>
                    <Reveal delay={150}>
                        <ReturnCalculator figures={figures} />
                    </Reveal>
                </div>
            </section>

            {/* Platform */}
            <section id="plataforma" className="scroll-mt-20 py-24 sm:py-28">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <SectionTitle
                        align="center"
                        eyebrow="Plataforma"
                        title="Tudo o que você precisa para operar, na mesma tela."
                        text="Ferramentas de análise completas, cotações ao vivo e um histórico que mostra cada detalhe das suas operações."
                    />

                    <div className="mt-14 grid gap-4 lg:grid-cols-3">
                        <Reveal className="lg:col-span-2">
                            <BentoCard icon={ChartCandlestick} title="Gráfico profissional" text="Velas, barras, linha e área, com períodos de 1 segundo a 1 dia, zoom e arraste fluidos e histórico que carrega conforme você volta no tempo.">
                                <div className="relative h-[170px] border-t border-ink-800/70 bg-gradient-to-b from-ink-950/0 to-ink-950/60 px-4 pt-4">
                                    <CandleArt />
                                </div>
                            </BentoCard>
                        </Reveal>
                        <Reveal delay={100}>
                            <BentoCard icon={Radio} title="Cotações em tempo real" text="Preços atualizados a cada negócio, com a fonte e o horário de cada cotação à vista.">
                                {snapshot.length > 0 && (
                                    <ul className="flex flex-col gap-2 px-6 pb-6 sm:px-7 sm:pb-7">
                                        {snapshot.slice(0, 3).map((item) => (
                                            <LiveMiniRow key={item.id} item={item} />
                                        ))}
                                    </ul>
                                )}
                            </BentoCard>
                        </Reveal>
                        <Reveal>
                            <BentoCard icon={Sigma} title="Indicadores técnicos" text="Os indicadores que os especialistas usam, direto no gráfico, com um clique.">
                                <div className="flex flex-wrap gap-1.5 px-6 pb-6 sm:px-7 sm:pb-7">
                                    {['Médias móveis', 'Bollinger', 'RSI', 'MACD', 'Estocástico', 'Volume', 'Linhas de tendência'].map((name) => (
                                        <span key={name} className="rounded-full border border-ink-700 bg-ink-950/60 px-3 py-1 text-[12px] font-medium text-text-2">
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </BentoCard>
                        </Reveal>
                        <Reveal delay={100}>
                            <BentoCard icon={FlaskConical} title="Conta demo grátis" text="Treine estratégias com saldo virtual antes de usar o seu dinheiro. Reinicie quando quiser.">
                                <div className="px-6 pb-6 sm:px-7 sm:pb-7">
                                    <div className="rounded-2xl border border-demo/25 bg-demo/[0.07] p-4">
                                        <div className="text-[11px] font-semibold tracking-wider text-demo uppercase">Saldo demo</div>
                                        <div className="numeric mt-1 text-[26px] font-semibold tracking-tight">{formatCents(figures.demo_balance_cents)}</div>
                                    </div>
                                </div>
                            </BentoCard>
                        </Reveal>
                        <Reveal delay={200}>
                            <BentoCard icon={FileCheck2} title="Histórico transparente" text="Cada operação guarda tudo o que definiu o resultado, sem possibilidade de alteração.">
                                <ul className="flex flex-col gap-2 px-6 pb-6 text-[13px] text-text-2 sm:px-7 sm:pb-7">
                                    {['Preço de entrada', 'Preço de encerramento', 'Fonte da cotação', 'Horário ao segundo'].map((item) => (
                                        <li key={item} className="flex items-center gap-2.5">
                                            <span className="grid size-5 place-items-center rounded-full bg-up/15 text-up">
                                                <Check size={12} strokeWidth={3} aria-hidden="true" />
                                            </span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </BentoCard>
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* PIX */}
            <section id="pix" className="relative scroll-mt-20 overflow-hidden border-t border-ink-800/70 bg-gradient-to-b from-ink-900/40 to-transparent py-24 sm:py-28">
                <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12">
                    <Reveal className="order-2 min-w-0 pb-12 lg:order-1">
                        <PixVisual figures={figures} />
                    </Reveal>
                    <div className="order-1 min-w-0 lg:order-2">
                        <SectionTitle eyebrow="Depósitos e saques" title="Seu dinheiro entra e sai por PIX." text="Sem boleto, sem espera de dias úteis. O saldo é creditado assim que o pagamento é confirmado pelo banco." />
                        <Reveal delay={120}>
                            <ul className="mt-9 flex flex-col gap-6">
                                <Feature icon={Zap} title={`Depósito a partir de ${formatCents(figures.min_deposit_cents)}`} text="Gere o QR Code, pague pelo app do seu banco e o valor aparece no seu saldo." />
                                <Feature
                                    icon={Wallet}
                                    title={`Saque a partir de ${formatCents(figures.min_withdrawal_cents)}`}
                                    text={`Direto para uma chave PIX no seu CPF, até ${formatCents(figures.daily_withdrawal_limit_cents)} por dia.`}
                                />
                                <Feature icon={ShieldCheck} title="Sempre no seu nome" text="Depósitos e saques ficam vinculados ao seu CPF, para proteger a sua conta contra fraudes." />
                            </ul>
                            <Link href={primaryHref} className="btn btn-primary mt-10 !h-[52px] !px-8 text-[15px]">
                                {canRegister ? 'Abrir minha conta' : 'Ir para a plataforma'}
                                <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* Security */}
            <section aria-labelledby="seguranca-titulo" className="border-y border-ink-800/70 bg-ink-900/40">
                <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
                    <Reveal className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <p className="eyebrow">Segurança</p>
                            <h2 id="seguranca-titulo" className="mt-3 text-2xl font-bold tracking-tight sm:text-[28px]">
                                Proteção em cada etapa.
                            </h2>
                        </div>
                    </Reveal>
                    <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                        {security.map((item, index) => (
                            <Reveal key={item.title} delay={index * 80}>
                                <item.icon size={22} className="text-accent" aria-hidden="true" />
                                <h3 className="mt-4 font-bold">{item.title}</h3>
                                <p className="mt-1.5 text-[14px] leading-relaxed text-text-2">{item.text}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-24 sm:py-28">
                <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
                    <div className="lg:sticky lg:top-28 lg:self-start">
                        <SectionTitle eyebrow="Dúvidas" title="Perguntas frequentes" text="O essencial para começar com segurança. As regras completas estão nos documentos abaixo." />
                        <Reveal delay={100} className="mt-7 flex flex-col gap-2 text-[14px]">
                            {[
                                { href: '/riscos', label: 'Divulgação de riscos' },
                                { href: '/termos', label: 'Termos de uso' },
                            ].map((link) => (
                                <Link key={link.href} href={link.href} className="group inline-flex w-fit items-center gap-2 font-semibold text-text-1 hover:text-accent">
                                    {link.label}
                                    <ArrowRight size={15} className="text-accent transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                                </Link>
                            ))}
                        </Reveal>
                    </div>

                    <Reveal delay={80} className="divide-y divide-ink-800 border-y border-ink-800">
                        {faq.map((item) => (
                            <details key={item.question} className="group py-1">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-semibold transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                                    {item.question}
                                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-ink-700 text-text-2 transition-all duration-300 group-open:rotate-45 group-open:border-accent/50 group-open:bg-accent group-open:text-on-accent">
                                        <Plus size={16} aria-hidden="true" />
                                    </span>
                                </summary>
                                <p className="max-w-2xl animate-rise pr-14 pb-6 leading-relaxed text-text-2">{item.answer}</p>
                            </details>
                        ))}
                    </Reveal>
                </div>
            </section>

            {/* Final call to action */}
            <section className="px-4 pb-24 sm:px-6">
                <Reveal className="gradient-border relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-ink-900 shadow-[var(--shadow-float)]">
                    <div className="aurora -top-40 -right-20 h-[420px] w-[620px] bg-accent/22" aria-hidden="true" />
                    <div className="aurora -bottom-48 -left-32 h-[360px] w-[520px] bg-info/12 [animation-delay:-8s]" aria-hidden="true" />
                    <div className="grid-backdrop absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_70%_90%_at_100%_0%,black,transparent)]" aria-hidden="true" />
                    <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-[1.35fr_1fr] lg:p-16">
                        <div>
                            <h2 className="text-[32px] leading-[1.06] font-bold tracking-[-0.03em] sm:text-5xl">
                                Treine grátis. <span className="text-gradient">Opere quando estiver pronto.</span>
                            </h2>
                            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-text-2">Crie sua conta em minutos e receba {formatCents(figures.demo_balance_cents)} virtuais na conta demo para conhecer a plataforma.</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                            <Link href={primaryHref} className="btn btn-primary !h-[56px] !px-9 text-[15px] lg:w-[260px]">
                                {canRegister ? 'Criar conta grátis' : 'Negociar agora'}
                                <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                            <Link href="/riscos" className="btn btn-ghost !h-[56px] !px-9 text-[15px] lg:w-[260px]">
                                Regras e riscos
                            </Link>
                        </div>
                    </div>
                </Reveal>
            </section>
        </PublicLayout>
    );
}
