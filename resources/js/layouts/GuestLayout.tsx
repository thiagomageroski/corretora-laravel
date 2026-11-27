import { Head, Link } from '@inertiajs/react';
import { CandlestickChart, FlaskConical, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { CookieNotice } from '@/components/legal/CookieNotice';
import { Logo } from '@/components/ui';

const POINTS = [
    { icon: CandlestickChart, title: 'Plataforma completa', text: 'Gráficos em tempo real, indicadores e desenhos no mesmo lugar.' },
    { icon: FlaskConical, title: 'Conta demo grátis', text: 'Treine com saldo virtual antes de negociar com dinheiro real.' },
    { icon: ShieldCheck, title: 'Depósito e saque por PIX', text: 'Saldo creditado na confirmação do pagamento e saque para chave no seu CPF.' },
];

export default function GuestLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <div className="grid min-h-dvh bg-ink-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Head title={title} />

            <aside className="relative hidden overflow-hidden border-r border-ink-800 bg-ink-900 p-12 lg:flex lg:flex-col">
                <div className="glow-backdrop absolute inset-0" aria-hidden="true" />
                <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
                <Link href="/" className="relative" aria-label="Nivora, página inicial">
                    <Logo />
                </Link>
                <div className="relative my-auto max-w-md">
                    <h2 className="text-4xl leading-[1.1] font-bold tracking-tight">
                        Uma corretora, incontáveis <span className="text-gradient">oportunidades.</span>
                    </h2>
                    <ul className="stagger mt-10 flex flex-col gap-6">
                        {POINTS.map((point) => (
                            <li key={point.title} className="flex gap-4">
                                <span className="icon-tile size-10 shrink-0">
                                    <point.icon size={18} aria-hidden="true" />
                                </span>
                                <span>
                                    <span className="block font-semibold">{point.title}</span>
                                    <span className="mt-0.5 block text-[13px] text-text-2">{point.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative text-xs text-text-3">Opções binárias envolvem alto risco. Você pode perder todo o valor de cada operação.</p>
            </aside>

            <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
                <Link href="/" className="mb-8 lg:hidden" aria-label="Nivora, página inicial">
                    <Logo />
                </Link>
                <div className="w-full max-w-[420px] animate-rise">
                    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                    {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-text-2">{subtitle}</p>}
                    <div className="mt-7">{children}</div>
                </div>
                <p className="mt-8 max-w-[420px] text-center text-xs text-text-3 lg:hidden">Opções binárias envolvem alto risco. Você pode perder todo o valor de cada operação.</p>
                <nav aria-label="Políticas" className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-3">
                    <Link href="/termos" className="hover:text-text-1">
                        Termos de uso
                    </Link>
                    <Link href="/privacidade" className="hover:text-text-1">
                        Privacidade
                    </Link>
                    <Link href="/cookies" className="hover:text-text-1">
                        Cookies
                    </Link>
                </nav>
            </main>

            <CookieNotice />
        </div>
    );
}
