import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, CandlestickChart, Coins, LayoutDashboard, ScrollText, Settings2, Users } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Logo, ToastHost } from '@/components/ui';
import type { SharedProps } from '@/lib/types';
import { useToasts } from '@/stores/toasts';

type AdminProps = SharedProps & { adminBadges?: { deposits_review: number; withdrawals_waiting: number } };

const SECTIONS = [
    { href: '/admin', label: 'Visão geral', icon: LayoutDashboard, exact: true },
    { href: '/admin/clientes', label: 'Clientes', icon: Users },
    { href: '/admin/depositos', label: 'Depósitos', icon: ArrowDownToLine, badge: 'deposits_review' as const },
    { href: '/admin/saques', label: 'Saques', icon: ArrowUpFromLine, badge: 'withdrawals_waiting' as const },
    { href: '/admin/operacoes', label: 'Operações', icon: CandlestickChart },
    { href: '/admin/ativos', label: 'Ativos', icon: Coins },
    { href: '/admin/configuracoes', label: 'Configurações', icon: Settings2 },
    { href: '/admin/auditoria', label: 'Auditoria', icon: ScrollText },
];

function isActive(url: string, href: string, exact = false): boolean {
    const path = url.split('?')[0];

    return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

/**
 * The admin area: its own sidebar and header, separate from the trading app,
 * with success and error messages from the server shown as toasts.
 */
export default function AdminLayout({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
    const { url, props } = usePage<AdminProps>();
    const push = useToasts((state) => state.push);
    const badges = props.adminBadges;

    // One toast per server answer: the flash object is new on every visit.
    useEffect(() => {
        if (props.flash?.status) push({ tone: 'up', title: props.flash.status });
        if (props.flash?.error) push({ tone: 'down', title: props.flash.error });
    }, [props.flash, push]);

    return (
        <div className="flex min-h-dvh bg-ink-950">
            <Head title={`${title} · Admin`} />

            <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-ink-800 bg-gradient-to-b from-ink-900 to-ink-950 p-4 lg:flex" aria-label="Painel administrativo">
                <Link href="/admin" className="mb-1 flex items-center gap-2 px-2 py-1">
                    <Logo />
                </Link>
                <span className="mb-6 ml-2 inline-flex w-fit items-center rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent uppercase">Administração</span>

                <nav className="flex flex-col gap-0.5">
                    {SECTIONS.map((section) => {
                        const active = isActive(url, section.href, section.exact);
                        const count = section.badge && badges ? badges[section.badge] : 0;

                        return (
                            <Link
                                key={section.href}
                                href={section.href}
                                aria-current={active ? 'page' : undefined}
                                className={`relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors ${active ? 'bg-ink-800 text-text-1' : 'text-text-3 hover:bg-ink-850 hover:text-text-1'}`}
                            >
                                {active && <span className="absolute inset-y-2 -left-4 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />}
                                <section.icon size={17} className={active ? 'text-accent' : ''} aria-hidden="true" />
                                {section.label}
                                {count > 0 && <span className="numeric ml-auto rounded-md bg-accent px-1.5 text-[10px] font-bold text-on-accent">{count}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <a href="/dashboard" className="mt-auto flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-text-3 hover:bg-ink-850 hover:text-text-1">
                    <ArrowLeft size={16} aria-hidden="true" />
                    Voltar para a corretora
                </a>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="glass sticky top-0 z-30 border-b border-ink-800 lg:hidden">
                    <div className="flex h-14 items-center justify-between px-4">
                        <Link href="/admin" className="flex items-center gap-2">
                            <Logo compact />
                            <span className="text-[13px] font-bold">Admin</span>
                        </Link>
                        <a href="/dashboard" className="text-xs font-semibold text-text-2">
                            Voltar ao site
                        </a>
                    </div>
                    <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2.5" aria-label="Seções do painel">
                        {SECTIONS.map((section) => {
                            const active = isActive(url, section.href, section.exact);

                            return (
                                <Link
                                    key={section.href}
                                    href={section.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap ${active ? 'border-accent bg-accent text-on-accent' : 'border-ink-700 bg-ink-850 text-text-2'}`}
                                >
                                    <section.icon size={14} aria-hidden="true" />
                                    {section.label}
                                </Link>
                            );
                        })}
                    </nav>
                </header>

                <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-[24px] leading-tight font-bold tracking-tight">{title}</h1>
                            {description && <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-text-2">{description}</p>}
                        </div>
                        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                    </div>
                    {children}
                </main>
            </div>
            <ToastHost />
        </div>
    );
}
