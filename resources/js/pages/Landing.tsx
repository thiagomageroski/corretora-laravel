import { Deferred, Head, Link } from '@inertiajs/react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeDollarSign, ChartCandlestick, ChevronDown, Clock, FlaskConical, History, Lock, PenLine, Radio, ShieldCheck, Sigma, Sparkles, Zap } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { CountUp, Reveal } from '@/components/landing/motion';
import { AssetIcon, Change, LiveDot, LivePrice } from '@/components/ui';
import PublicLayout from '@/layouts/PublicLayout';
import { changePercent, formatCents, formatDuration, formatPrice, providerName } from '@/lib/format';
import type { Candle, CandleResponse, Category } from '@/lib/types';
import { startMarketFeed, useMarket } from '@/stores/market';

type SnapshotItem = { id: number; symbol: string; name: string; price: string; open_24h: string | null; source: string; source_at: string };

type Figures = {
    payout_percent: number;
    min_stake_cents: number;
    durations_seconds: number[];
    demo_balance_cents: number;
    min_deposit_cents: number;
    min_withdrawal_cents: number;
    daily_withdrawal_limit_cents: number;
};

type Props = { categories: Category[]; canRegister: boolean; snapshot: SnapshotItem[]; featuredAssets: string[]; figures: Figures; heroChart?: CandleResponse | null };

const priceFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function HeroChart({ candles }: { candles: Candle[] }) {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!container.current || candles.length === 0) return;

        const chart = createChart(container.current, {
            autoSize: true,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7f8a9a', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, attributionLogo: true },
            localization: { priceFormatter: (price: number) => priceFormat.format(price) },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(120,135,160,0.07)' } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
            timeScale: { borderVisible: false, visible: false },
            handleScroll: false,
            handleScale: false,
            crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
        });
        chart
            .addSeries(AreaSeries, { lineColor: '#c6f24e', lineWidth: 2, topColor: 'rgba(198,242,78,0.26)', bottomColor: 'rgba(198,242,78,0)', priceLineVisible: false, lastValueVisible: false })
            .setData(candles.map((candle) => ({ time: candle.time as UTCTimestamp, value: Number(candle.close) })));
        chart.timeScale().fitContent();

        return () => chart.remove();
    }, [candles]);

    return <div ref={container} className="absolute inset-0" role="img" aria-label="Gráfico de BTC nos últimos 4 dias" />;
}

/**
 * Floating card with a live price and the payout of a contract on that asset.
 */
function QuoteCard({ item, payout, className = '' }: { item: SnapshotItem; payout: number; className?: string }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <div className={`panel w-[196px] p-4 text-left shadow-[var(--shadow-float)] ring-1 ring-white/5 ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold">{item.name}</span>
                <LiveDot />
            </div>
            <div className="mt-3 text-[10px] font-semibold tracking-wider text-text-3 uppercase">Retorno</div>
            <div className="flex items-center gap-1 text-2xl font-bold text-up">
                <ArrowUpRight size={18} aria-hidden="true" />
                {payout}%
            </div>
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-ink-800 pt-3">
                <div>
                    <div className="text-[10px] text-text-3">Preço</div>
                    <div className="numeric text-[13px]">{formatPrice(price)}</div>
                </div>
                <div className="text-right text-xs">
                    <div className="text-[10px] text-text-3">24 h</div>
                    <Change value={changePercent(price, tick?.open_24h ?? item.open_24h)} size={12} />
                </div>
            </div>
        </div>
    );
}

function HeroPreview({ snapshot, heroChart, payout }: { snapshot: SnapshotItem[]; heroChart?: CandleResponse | null; payout: number }) {
    const first = snapshot[0];
    const tick = useMarket((state) => (first ? state.ticks[first.id] : undefined));
    const price = tick?.price ?? first?.price;

    return (
        <div className="relative mx-auto mt-16 max-w-4xl text-left">
            <div className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent)]" aria-hidden="true" />
            <div className="panel relative overflow-hidden shadow-[var(--shadow-float)] ring-1 ring-accent/15">
                <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                        <span className="icon-tile size-9 !rounded-lg">
                            <ChartCandlestick size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <div className="font-bold">{first?.symbol ?? 'BTC/USD'}</div>
                            <div className="text-[11px] text-text-3">Últimos 4 dias · velas de 1 hora</div>
                        </div>
                    </div>
                    <div className="text-right">
                        {price ? <LivePrice price={price} className="px-0.5 text-lg font-medium" /> : <span className="numeric text-text-3">—</span>}
                        <div className="text-xs">
                            <Change value={price ? changePercent(price, tick?.open_24h ?? first?.open_24h) : null} size={12} />
                        </div>
                    </div>
                </div>
                <div className="relative h-[300px] sm:h-[360px]">
                    <Deferred data="heroChart" fallback={<div className="skeleton absolute inset-5" />}>
                        {heroChart && heroChart.candles.length > 0 ? <HeroChart candles={heroChart.candles} /> : <div className="grid h-full place-items-center p-6 text-center text-xs text-text-3">Gráfico indisponível no momento.</div>}
                    </Deferred>
                </div>
                <div className="flex items-center gap-2 border-t border-ink-800 px-5 py-2.5 text-[11px] text-text-3">
                    <LiveDot />
                    {first ? `Cotações em tempo real · ${providerName(first.source)}` : 'Conectando às cotações…'}
                </div>
            </div>
            {snapshot[1] && <QuoteCard item={snapshot[1]} payout={payout} className="absolute top-24 -left-32 z-10 hidden animate-float xl:block" />}
            {snapshot[2] && <QuoteCard item={snapshot[2]} payout={payout} className="absolute -right-32 bottom-10 z-10 hidden animate-float-slow xl:block" />}
        </div>
    );
}

function TickerItem({ item }: { item: SnapshotItem }) {
    const tick = useMarket((state) => state.ticks[item.id]);
    const price = tick?.price ?? item.price;

    return (
        <span className="flex shrink-0 items-center gap-2.5 px-6 text-[13px]">
            <AssetIcon symbol={item.symbol} size={20} />
            <span className="font-semibold">{item.symbol}</span>
            <span className="numeric text-text-2">{formatPrice(price)}</span>
            <span className="text-xs">
                <Change value={changePercent(price, tick?.open_24h ?? item.open_24h)} size={12} />
            </span>
        </span>
    );
}

function SectionHeading({ icon: Icon, eyebrow, title, text }: { icon?: typeof Zap; eyebrow?: string; title: ReactNode; text?: string }) {
    return (
        <Reveal className="mx-auto max-w-2xl text-center">
            {Icon && (
                <span className="icon-tile mx-auto mb-7 size-14 !rounded-2xl shadow-[var(--shadow-glow)]">
                    <Icon size={24} aria-hidden="true" />
                </span>
            )}
            {eyebrow && <p className="mb-3 text-[13px] font-semibold tracking-wide text-accent">{eyebrow}</p>}
            <h2 className="text-4xl leading-[1.08] font-bold tracking-[-0.02em] sm:text-5xl">{title}</h2>
            {text && <p className="mx-auto mt-5 max-w-xl leading-relaxed text-text-2">{text}</p>}
        </Reveal>
    );
}

/**
 * Illustration of the deposit and withdrawal screens. Decorative: the amounts
 * are examples, not account data.
 */
function PaymentsIllustration({ figures }: { figures: Figures }) {
    return (
        <div className="relative mx-auto mt-16 flex max-w-3xl flex-col items-center gap-5 sm:block sm:h-[420px]" aria-hidden="true">
            <div className="absolute inset-x-16 top-10 bottom-10 hidden rounded-[40px] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_srgb,var(--color-accent)_12%,transparent),transparent)] sm:block" />
            <Reveal className="w-full max-w-[360px] sm:absolute sm:top-0 sm:left-4">
                <div className="panel animate-float-slow p-6 shadow-[var(--shadow-float)]">
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-text-2">
                        <Lock size={14} className="text-up" />
                        Método seguro · PIX
                    </div>
                    <div className="mt-5 text-[11px] font-semibold tracking-wider text-text-3 uppercase">Informe o valor</div>
                    <div className="field numeric mt-2 flex items-center text-2xl">R$ 100</div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {[figures.min_deposit_cents, 5_000, 10_000, 25_000, 50_000, 100_000].map((cents, index) => (
                            <span key={cents} className={`chip numeric justify-center border border-ink-800 text-[12px] ${index === 2 ? 'bg-ink-700 text-text-1' : ''}`}>
                                {formatCents(cents).replace(',00', '')}
                            </span>
                        ))}
                    </div>
                    <div className="btn btn-primary mt-5 w-full">Gerar PIX</div>
                </div>
            </Reveal>
            <Reveal delay={180} className="w-full max-w-[320px] sm:absolute sm:right-4 sm:bottom-0">
                <div className="panel animate-float p-6 shadow-[var(--shadow-float)] ring-1 ring-accent/20">
                    <div className="text-center text-xs text-text-2">
                        Saldo disponível: <span className="numeric font-semibold text-text-1">R$ 1.250,00</span>
                    </div>
                    <div className="mt-3 text-center text-[13px] text-text-2">Quanto você vai sacar?</div>
                    <div className="numeric mt-1 text-center text-3xl font-medium">R$ 500,00</div>
                    <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-950 p-3">
                        <div>
                            <div className="text-[10px] text-text-3">Saldo final</div>
                            <div className="numeric text-[13px] font-semibold">R$ 750,00</div>
                        </div>
                        <span className="btn btn-primary btn-sm">Sacar</span>
                    </div>
                </div>
            </Reveal>
        </div>
    );
}

function EntryCard({ tone, amount, duration }: { tone: 'up' | 'down'; amount: string; duration: string }) {
    const isUp = tone === 'up';

    return (
        <div className="panel w-[272px] p-5 shadow-[var(--shadow-float)] ring-1 ring-white/5">
            <div className={`flex items-center justify-center gap-1.5 border-b border-ink-800 pb-3 text-[13px] font-bold ${isUp ? 'text-up' : 'text-down'}`}>
                {isUp ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {isUp ? 'Operação de alta' : 'Operação de baixa'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                    <div className="text-[11px] text-text-3">Valor</div>
                    <div className="numeric mt-1 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[15px]">{amount}</div>
                </div>
                <div>
                    <div className="text-[11px] text-text-3">Prazo</div>
                    <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[15px]">
                        <Clock size={14} className="text-text-3" />
                        {duration}
                    </div>
                </div>
            </div>
            <div className={`btn mt-4 w-full ${isUp ? 'bg-up text-[#04130e]' : 'bg-down text-[#1d070b]'}`}>
                {isUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {isUp ? 'CALL' : 'PUT'}
            </div>
        </div>
    );
}

/**
 * Two order tickets over an accent panel. Decorative, with example values.
 */
function StrategyIllustration({ figures }: { figures: Figures }) {
    return (
        <div className="relative h-[400px] w-full max-w-[460px]" aria-hidden="true">
            <div className="absolute inset-x-10 inset-y-8 overflow-hidden rounded-[36px] bg-gradient-to-br from-accent-strong via-accent to-[#7fbf1f] shadow-[0_40px_90px_-40px_var(--color-accent)]">
                <div className="grid-backdrop absolute inset-0 opacity-40 [mask-image:none]" />
            </div>
            <div className="absolute top-0 left-0 -rotate-3 animate-float">
                <EntryCard tone="up" amount="R$ 100" duration={formatDuration(figures.durations_seconds[1] ?? 300)} />
            </div>
            <div className="absolute right-0 bottom-0 rotate-2 animate-float-slow">
                <EntryCard tone="down" amount="R$ 250" duration={formatDuration(figures.durations_seconds[2] ?? 900)} />
            </div>
            <div className="glass absolute top-6 right-0 flex items-center gap-2 rounded-full border border-up/30 px-3.5 py-2 text-[13px] font-semibold text-up shadow-[var(--shadow-float)]">
                <Sparkles size={14} />+{figures.payout_percent}% no acerto
            </div>
        </div>
    );
}

export default function Landing({ categories, canRegister, snapshot, featuredAssets, figures, heroChart }: Props) {
    const total = categories.reduce((sum, category) => sum + (category.assets_count ?? 0), 0);
    const primaryHref = canRegister ? '/register' : '/negociar';
    const primaryLabel = canRegister ? 'Começar agora' : 'Negociar';
    const breakEven = (100 / (100 + figures.payout_percent)) * 100;
    const half = Math.ceil(featuredAssets.length / 2);

    useEffect(() => startMarketFeed({ polling: false }), []);

    const tools = [
        { icon: ChartCandlestick, title: 'Gráfico profissional', text: 'Velas, barras, linha e área, com períodos de 1 segundo a 1 dia e escala automática, logarítmica ou percentual.' },
        { icon: Sigma, title: 'Indicadores técnicos', text: 'Médias móveis, Bandas de Bollinger, RSI, MACD, Estocástico e volume, direto no gráfico.' },
        { icon: PenLine, title: 'Ferramentas de desenho', text: 'Trace linhas de tendência e níveis horizontais para marcar suportes e resistências.' },
        { icon: Radio, title: 'Cotações em tempo real', text: 'Preços atualizados a cada negócio, com a fonte e o horário de cada cotação à vista.' },
        { icon: History, title: 'Histórico transparente', text: 'Cada operação mostra preço de entrada, preço de encerramento, fonte e horários. Nada pode ser alterado depois.' },
        { icon: FlaskConical, title: 'Conta demo', text: `${formatCents(figures.demo_balance_cents)} virtuais para treinar estratégias sem arriscar o seu dinheiro.` },
    ];

    const steps = [
        { label: 'Primeiro passo', title: 'Crie sua conta grátis.', text: 'Clique em "Criar conta" no topo da página, informe seus dados e pronto: sua conta já fica ativa. Leva poucos minutos.' },
        { label: 'Segundo passo', title: 'Pratique sem riscos.', text: `Você recebe ${formatCents(figures.demo_balance_cents)} na conta demo para treinar até se sentir confiante, sem arriscar nada.` },
        { label: 'Terceiro passo', title: 'Deposite e negocie.', text: 'Abra sua conta real, faça seu primeiro depósito por PIX e comece a negociar de forma simples.' },
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
            answer: 'As criptomoedas podem ser negociadas com cotação em tempo real. Ações, forex e outros ativos do catálogo aparecem para acompanhamento e são liberados para negociação conforme a cobertura de cotações.',
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

            <section id="inicio" className="relative -mt-16 scroll-mt-16 overflow-hidden pt-16">
                <div className="aurora -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 bg-accent/25" aria-hidden="true" />
                <div className="aurora top-40 -left-40 h-[420px] w-[520px] bg-info/20 [animation-delay:-6s]" aria-hidden="true" />
                <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
                <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 text-center sm:px-6 sm:pt-24">
                    <span className="inline-flex animate-rise items-center gap-2 rounded-full border border-ink-700 bg-ink-900/70 px-3.5 py-1.5 text-xs font-semibold text-text-2 backdrop-blur">
                        <LiveDot />
                        Cotações em tempo real e depósito por PIX
                    </span>
                    <h1 className="mt-7 animate-rise text-[44px] leading-[1.03] font-bold tracking-[-0.035em] [animation-delay:60ms] sm:text-[76px]">
                        Uma corretora,
                        <br />
                        incontáveis <span className="text-gradient">oportunidades.</span>
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl animate-rise text-base leading-relaxed text-text-2 [animation-delay:120ms] sm:text-lg">
                        Negocie criptomoedas em tempo real e acompanhe mais de {total} ativos entre ações internacionais, forex e índices, tudo em uma plataforma simples.
                    </p>
                    <div className="mt-10 flex animate-rise flex-wrap items-center justify-center gap-4 [animation-delay:180ms]">
                        <Link href={primaryHref} className="btn btn-primary !h-[54px] !px-10 text-[15px]">
                            {primaryLabel}
                            <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                        <a href="#ativos" className="group flex items-center gap-1.5 px-3 text-[15px] font-medium text-text-2 hover:text-text-1">
                            Saiba mais
                            <ChevronDown size={18} className="text-accent transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                        </a>
                    </div>
                    <ul className="mt-8 flex animate-rise flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-text-3 [animation-delay:220ms]">
                        <li className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-up" aria-hidden="true" />
                            Conta demo grátis
                        </li>
                        <li className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-up" aria-hidden="true" />
                            Depósito mínimo de {formatCents(figures.min_deposit_cents)}
                        </li>
                        <li className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-up" aria-hidden="true" />
                            Retorno de até {figures.payout_percent}%
                        </li>
                    </ul>
                    <div className="animate-rise [animation-delay:280ms]">
                        <HeroPreview snapshot={snapshot} heroChart={heroChart} payout={figures.payout_percent} />
                    </div>
                </div>
            </section>

            {snapshot.length > 0 && (
                <section aria-label="Cotações" className="overflow-hidden border-y border-ink-800 bg-ink-900/70 py-3.5 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
                    <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
                        {[...snapshot, ...snapshot].map((item, index) => (
                            <TickerItem key={`${item.id}-${index}`} item={item} />
                        ))}
                    </div>
                </section>
            )}

            <section id="ativos" className="scroll-mt-20 py-24 sm:py-32">
                <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-center sm:gap-10 sm:px-6">
                    <div className="numeric flex items-center text-[88px] leading-none font-bold tracking-tight sm:text-[136px]">
                        <span className="text-gradient">+</span>
                        <CountUp value={total} />
                    </div>
                    <h2 className="max-w-md text-center text-3xl leading-tight font-bold tracking-tight sm:text-left sm:text-4xl">
                        <span className="text-accent">Ativos na plataforma,</span> de um jeito descomplicado.
                    </h2>
                </Reveal>
                <Reveal delay={120}>
                    <p className="mt-8 px-4 text-center text-text-2">Escolha um ativo e comece a negociar em poucos cliques.</p>
                </Reveal>
                {featuredAssets.length > 0 && (
                    <div className="mt-12 flex flex-col gap-4 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
                        {[featuredAssets.slice(0, half), featuredAssets.slice(half)].map((row, rowIndex) => (
                            <div key={rowIndex} className={`flex w-max animate-marquee gap-4 [animation-duration:70s] hover:[animation-play-state:paused] ${rowIndex === 1 ? '[animation-direction:reverse]' : ''}`}>
                                {[...row, ...row, ...row].map((name, index) => (
                                    <span key={`${name}-${index}`} className="panel shrink-0 px-6 py-3.5 text-lg font-bold text-text-2 transition-colors hover:border-ink-600 hover:text-text-1">
                                        {name}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section id="agilidade" className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-ink-900/60 via-ink-900/30 to-transparent py-24 sm:py-32">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <SectionHeading
                        icon={BadgeDollarSign}
                        title={
                            <>
                                Depósito rápido,
                                <br />
                                saque sem complicação!
                            </>
                        }
                        text="Deposite por PIX e o saldo entra na sua conta assim que o pagamento é confirmado. Para sacar, basta informar uma chave PIX no seu CPF."
                    />
                    <PaymentsIllustration figures={figures} />
                </div>
            </section>

            <section className="py-24 sm:py-32">
                <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
                    <Reveal className="flex justify-center">
                        <StrategyIllustration figures={figures} />
                    </Reveal>
                    <Reveal delay={120}>
                        <p className="mb-3 text-[13px] font-semibold tracking-wide text-accent">Como funciona</p>
                        <h2 className="text-4xl leading-[1.08] font-bold tracking-[-0.02em] sm:text-5xl">Simplifique sua estratégia de negociação.</h2>
                        <p className="mt-5 max-w-lg leading-relaxed text-text-2">
                            Abra uma operação de alta ou de baixa e escolha o prazo. Se, no vencimento, o ativo tiver se movido a seu favor, você recebe até {figures.payout_percent}% de retorno na hora, direto no saldo.
                        </p>
                        <ul className="mt-6 flex flex-col gap-2.5 text-[14px] text-text-2">
                            {[
                                'Escolha o ativo e o valor',
                                `Defina o prazo, de ${formatDuration(figures.durations_seconds[0] ?? 60)} a ${formatDuration(figures.durations_seconds[figures.durations_seconds.length - 1] ?? 3600)}`,
                                'Acompanhe o resultado ao vivo no gráfico',
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-2.5">
                                    <span className="grid size-5 place-items-center rounded-full bg-up/15 text-up">
                                        <ArrowRight size={12} aria-hidden="true" />
                                    </span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <Link href={primaryHref} className="btn btn-primary mt-9 !h-[52px] !px-9 text-[15px]">
                            {primaryLabel}
                            <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    </Reveal>
                </div>
            </section>

            <section id="ferramentas" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
                <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
                    <SectionHeading icon={Zap} title="As ferramentas favoritas dos especialistas." text="Recursos de análise completos para você tomar as melhores decisões, tudo na mesma tela onde você negocia." />
                    <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tools.map((tool, index) => (
                            <Reveal key={tool.title} delay={(index % 3) * 90}>
                                <div className="panel panel-hover group h-full p-6 hover:shadow-[var(--shadow-glow)]">
                                    <span className="icon-tile size-11 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                                        <tool.icon size={20} aria-hidden="true" />
                                    </span>
                                    <h3 className="mt-5 text-[17px] font-bold">{tool.title}</h3>
                                    <p className="mt-2 leading-relaxed text-text-2">{tool.text}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className="bg-gradient-to-b from-transparent via-ink-900/40 to-transparent py-24 sm:py-32">
                <div className="mx-auto max-w-4xl px-4 sm:px-6">
                    <SectionHeading
                        title={
                            <>
                                Comece em apenas
                                <br />
                                <span className="text-gradient">3 passos simples</span>
                            </>
                        }
                        text="Simplificamos tudo para você começar a negociar o quanto antes."
                    />
                    <ol className="mt-16 flex flex-col">
                        {steps.map((step, index) => (
                            <Reveal as="li" key={step.title} delay={index * 140} className="relative flex gap-5 pb-12 last:pb-0">
                                {index < steps.length - 1 && <span className="absolute top-12 bottom-0 left-[21px] w-px bg-gradient-to-b from-accent via-accent/40 to-ink-700" aria-hidden="true" />}
                                <span className="icon-tile numeric size-11 shrink-0 text-[15px] font-bold !text-text-1 shadow-[var(--shadow-glow)]">{index + 1}</span>
                                <div className="panel panel-hover flex-1 p-5">
                                    <div className="text-[13px] font-semibold text-accent">{step.label}</div>
                                    <h3 className="mt-0.5 text-2xl font-bold">{step.title}</h3>
                                    <p className="mt-2 leading-relaxed text-text-2">{step.text}</p>
                                </div>
                            </Reveal>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="py-24 sm:py-32">
                <div className="mx-auto max-w-4xl px-4 sm:px-6">
                    <SectionHeading title="Perguntas frequentes" text="Reunimos as dúvidas mais comuns para facilitar o seu começo." />
                    <div className="mt-12 flex flex-col gap-2.5">
                        {faq.map((item, index) => (
                            <Reveal key={item.question} delay={index * 60}>
                                <details className="panel group p-5 transition-colors open:border-ink-600 hover:border-ink-600">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                                        {item.question}
                                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-800 text-accent transition-transform duration-300 group-open:rotate-90">
                                            <ArrowRight size={14} aria-hidden="true" />
                                        </span>
                                    </summary>
                                    <p className="mt-3 max-w-3xl animate-rise leading-relaxed text-text-2">{item.answer}</p>
                                </details>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-4 pb-24 sm:px-6">
                <Reveal className="panel relative mx-auto max-w-6xl overflow-hidden p-10 text-center shadow-[var(--shadow-glow)] sm:p-16">
                    <div className="aurora -top-32 left-1/2 h-[360px] w-[640px] -translate-x-1/2 bg-accent/25" aria-hidden="true" />
                    <div className="grid-backdrop absolute inset-0 opacity-60" aria-hidden="true" />
                    <div className="relative">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Pronto para começar?</h2>
                        <p className="mx-auto mt-4 max-w-lg text-text-2">Crie sua conta grátis e treine na conta demo antes de negociar com dinheiro real.</p>
                        <Link href={primaryHref} className="btn btn-primary mt-8 !h-[54px] !px-10 text-[15px]">
                            {canRegister ? 'Criar conta grátis' : 'Negociar'}
                            <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    </div>
                </Reveal>
            </section>
        </PublicLayout>
    );
}
