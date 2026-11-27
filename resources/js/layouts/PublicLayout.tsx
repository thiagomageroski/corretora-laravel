import { Link, usePage } from '@inertiajs/react';
import { useEffect, useState, type ReactNode } from 'react';
import { CookieNotice } from '@/components/legal/CookieNotice';
import { Logo } from '@/components/ui';
import { LEGAL_DOCUMENTS } from '@/lib/legal';
import { samePageSection, scrollToSection } from '@/lib/smoothScroll';
import type { SharedProps } from '@/lib/types';

const SECTIONS = [
    { href: '/#inicio', label: 'Início' },
    { href: '/#ativos', label: 'Ativos' },
    { href: '/#agilidade', label: 'Agilidade' },
    { href: '/#ferramentas', label: 'Ferramentas' },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
    const { auth, appName } = usePage<SharedProps>().props;
    const [scrolled, setScrolled] = useState(false);

    // Solid header once the page moves, so content never shows through it.
    useEffect(() => {
        const update = () => setScrolled(window.scrollY > 8);
        update();
        window.addEventListener('scroll', update, { passive: true });

        return () => window.removeEventListener('scroll', update);
    }, []);

    // Links to a section of this page ("Saiba mais", the header and footer menus) glide instead of jumping.
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const anchor = (event.target as Element | null)?.closest?.('a[href]');
            const section = anchor ? samePageSection(anchor.getAttribute('href') ?? '', window.location.pathname) : null;

            if (section && scrollToSection(section)) {
                event.preventDefault();
            }
        };

        document.addEventListener('click', onClick);

        return () => document.removeEventListener('click', onClick);
    }, []);

    return (
        <div className="min-h-dvh bg-ink-950">
            <header
                className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${scrolled ? 'border-ink-800 bg-ink-950/95 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl' : 'border-transparent bg-transparent'}`}
            >
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                    <div className="flex items-center gap-10">
                        <Link href="/" aria-label={`${appName}, página inicial`}>
                            <Logo />
                        </Link>
                        <nav className="hidden items-center gap-7 text-[14px] text-text-2 md:flex" aria-label="Seções">
                            {SECTIONS.map((section) => (
                                <a
                                    key={section.href}
                                    href={section.href}
                                    className="relative transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-accent after:transition-all after:duration-300 hover:text-text-1 hover:after:w-full"
                                >
                                    {section.label}
                                </a>
                            ))}
                        </nav>
                    </div>
                    <nav className="flex items-center gap-2 sm:gap-4" aria-label="Conta">
                        {auth.user ? (
                            <Link href="/negociar" className="btn btn-primary btn-sm">
                                Negociar
                            </Link>
                        ) : (
                            <>
                                <Link href="/login" className="px-2 text-[14px] font-semibold text-accent transition-colors hover:text-accent-strong">
                                    Acessar
                                </Link>
                                <Link href="/register" className="btn btn-primary btn-sm">
                                    Criar conta
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            {children}

            <footer className="border-t border-ink-800 bg-gradient-to-b from-ink-900 to-ink-950">
                <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                    <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                        <div>
                            <Logo />
                            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-text-2">
                                Uma corretora, <span className="text-accent">incontáveis oportunidades de negociação.</span>
                            </p>
                        </div>
                        <nav aria-label="Plataforma" className="flex flex-col gap-3 text-[13px] text-text-2">
                            <span className="font-bold text-text-1">Plataforma</span>
                            {SECTIONS.map((section) => (
                                <a key={section.href} href={section.href} className="hover:text-text-1">
                                    {section.label}
                                </a>
                            ))}
                        </nav>
                        <nav aria-label="Políticas" className="flex flex-col gap-3 text-[13px] text-text-2">
                            <span className="font-bold text-text-1">Políticas</span>
                            {LEGAL_DOCUMENTS.map((document) => (
                                <Link key={document.href} href={document.href} className="hover:text-text-1">
                                    {document.label}
                                </Link>
                            ))}
                        </nav>
                        <nav aria-label="Sua conta" className="flex flex-col gap-3 text-[13px] text-text-2">
                            <span className="font-bold text-text-1">Sua conta</span>
                            <Link href="/login" className="hover:text-text-1">
                                Acessar
                            </Link>
                            <Link href="/register" className="text-accent hover:text-accent-strong">
                                Criar conta
                            </Link>
                        </nav>
                    </div>

                    <div className="mt-12 border-t border-ink-800 pt-8 text-[12px] leading-relaxed text-text-3">
                        <p className="font-semibold text-text-2">AVISO DE RISCO</p>
                        <p className="mt-2">
                            Operações com opções binárias envolvem alto risco e podem resultar na perda total do valor investido em cada operação. Antes de operar, avalie seus objetivos e sua tolerância a risco. Resultados passados não
                            garantem resultados futuros. Leia a{' '}
                            <Link href="/riscos" className="underline hover:text-text-1">
                                divulgação de riscos
                            </Link>{' '}
                            e os{' '}
                            <Link href="/termos" className="underline hover:text-text-1">
                                termos de uso
                            </Link>
                            . Seus dados são tratados conforme a{' '}
                            <Link href="/privacidade" className="underline hover:text-text-1">
                                política de privacidade
                            </Link>
                            .
                        </p>
                        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                © {new Date().getFullYear()} {appName}. Todos os direitos reservados.
                            </span>
                            <span>
                                Gráficos por{' '}
                                <a href="https://www.tradingview.com/" className="underline hover:text-text-1" rel="noreferrer" target="_blank">
                                    TradingView Lightweight Charts
                                </a>
                            </span>
                        </div>
                    </div>
                </div>
            </footer>

            <CookieNotice />
        </div>
    );
}
