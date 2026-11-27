import { Head } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui';

type Status = 403 | 404 | 500 | 503;

const MESSAGES: Record<Status, { title: string; description: string }> = {
    404: { title: 'Página não encontrada', description: 'O endereço que você tentou acessar não existe ou mudou de lugar. Confira o link ou volte para a corretora.' },
    403: { title: 'Acesso não permitido', description: 'Você não tem permissão para ver esta página. Se acha que é um engano, fale com o suporte.' },
    500: { title: 'Algo deu errado do nosso lado', description: 'Tivemos um problema ao abrir esta página. Seu saldo e suas operações estão seguros; tente de novo em instantes.' },
    503: { title: 'Estamos em manutenção', description: 'A plataforma volta em poucos minutos. Seu saldo e suas operações estão seguros.' },
};

/** Candles that climb and then fall off the chart: the "lost" page, in a broker's terms. */
const CANDLES: { open: number; close: number; high: number; low: number }[] = [
    { open: 58, close: 50, high: 47, low: 61 },
    { open: 50, close: 44, high: 41, low: 53 },
    { open: 44, close: 47, high: 42, low: 50 },
    { open: 47, close: 38, high: 35, low: 49 },
    { open: 38, close: 33, high: 30, low: 41 },
    { open: 33, close: 36, high: 31, low: 39 },
    { open: 36, close: 30, high: 27, low: 38 },
    { open: 30, close: 42, high: 29, low: 45 },
    { open: 42, close: 55, high: 40, low: 58 },
    { open: 55, close: 68, high: 53, low: 72 },
    { open: 68, close: 82, high: 66, low: 86 },
    { open: 82, close: 97, high: 80, low: 100 },
];

function FallingChart() {
    return (
        <svg viewBox="0 0 120 100" preserveAspectRatio="xMidYMax meet" className="h-full w-full" aria-hidden="true">
            {CANDLES.map((candle, index) => {
                const x = 6 + index * 9.5;
                const rising = candle.close < candle.open;
                const color = rising ? 'var(--color-up)' : 'var(--color-down)';

                return (
                    <g key={index} className="animate-rise" style={{ animationDelay: `${200 + index * 70}ms` }}>
                        <line x1={x} x2={x} y1={candle.high} y2={candle.low} stroke={color} strokeWidth="0.6" />
                        <rect x={x - 2.4} y={Math.min(candle.open, candle.close)} width="4.8" height={Math.max(1, Math.abs(candle.close - candle.open))} rx="0.6" fill={color} />
                    </g>
                );
            })}
        </svg>
    );
}

export default function ErrorPage({ status }: { status: Status }) {
    const message = MESSAGES[status] ?? MESSAGES[404];
    const [path, setPath] = useState<string | null>(null);

    // Read in the browser only: the server renders this page for any address.
    useEffect(() => setPath(window.location.pathname), []);

    return (
        <>
            <Head title={message.title} />
            <main className="relative flex min-h-dvh flex-col overflow-hidden bg-ink-950">
                <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
                <div className="aurora -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-accent/25" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] opacity-[0.22] [mask-image:linear-gradient(to_top,black,transparent)]" aria-hidden="true">
                    <FallingChart />
                </div>

                <header className="relative mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
                    <a href="/" aria-label="Nivora, página inicial">
                        <Logo />
                    </a>
                </header>

                <section className="stagger relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
                    <p className="text-gradient numeric text-[96px] leading-none font-bold tracking-tighter sm:text-[136px]">{status}</p>
                    <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{message.title}</h1>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-text-2">{message.description}</p>
                    {status === 404 && path && path !== '/' && <p className="mt-4 max-w-full truncate rounded-lg border border-ink-800 bg-ink-900/80 px-3 py-1.5 font-mono text-xs text-text-3">{path}</p>}
                    <a href="/" className="btn btn-primary mt-8 h-12 px-6 text-[15px]">
                        <ArrowLeft size={18} aria-hidden="true" />
                        Voltar para a corretora
                    </a>
                </section>
            </main>
        </>
    );
}
