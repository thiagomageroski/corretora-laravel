import { Link, usePage } from '@inertiajs/react';
import { ChartCandlestick, Eye, EyeOff, FlaskConical, History, LayoutDashboard, Wallet, WalletMinimal } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import AccountSettings from '@/components/account/AccountSettings';
import { AccountSwitch } from '@/components/account/AccountSwitch';
import { UserMenu } from '@/components/account/UserMenu';
import { DepositDialog } from '@/components/wallet/DepositDialog';
import { Drawer, FeedIndicator, Logo, Money, ToastHost } from '@/components/ui';
import type { SharedProps } from '@/lib/types';
import { useAccountPanel } from '@/stores/accountPanel';
import { startMarketFeed } from '@/stores/market';
import { usePreferences } from '@/stores/preferences';
import { useWallet } from '@/stores/wallet';

const NAVIGATION = [
    { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
    { href: '/negociar', label: 'Negociar', icon: ChartCandlestick },
    { href: '/ativos', label: 'Ativos', icon: FlaskConical },
    { href: '/operacoes', label: 'Operações', icon: History },
    { href: '/carteira', label: 'Carteira', icon: Wallet },
];

export default function AppLayout({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
    const { url, props } = usePage<SharedProps>();
    const panel = useAccountPanel();
    const hideBalance = usePreferences((state) => state.preferences.hide_balance);
    const savePreferences = usePreferences((state) => state.save);
    const wallet = useWallet((state) => state.summary);
    const setWallet = useWallet((state) => state.set);
    const environment = props.environment ?? 'demo';
    const isReal = environment === 'real';
    const [depositOpen, setDepositOpen] = useState(false);
    const closeDeposit = useCallback(() => setDepositOpen(false), []);

    useEffect(() => startMarketFeed(), []);

    useEffect(() => {
        const open = () => setDepositOpen(true);
        window.addEventListener('open-deposit', open);

        return () => window.removeEventListener('open-deposit', open);
    }, []);

    useEffect(() => {
        setWallet(props.activeWallet);
    }, [props.activeWallet, setWallet]);

    return (
        <div className="flex h-dvh flex-col lg:flex-row">
            {/* A narrow, fixed rail: each entry is its icon over its name, so the chart keeps the width. */}
            <nav aria-label="Principal" className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r border-ink-800/80 bg-gradient-to-b from-ink-900 to-ink-950/95 px-1.5 py-3 lg:flex">
                <Link href="/" className="mb-4 flex h-9 items-center" aria-label="Nivora, página inicial">
                    <Logo compact />
                </Link>

                {NAVIGATION.map((item) => {
                    const active = url.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={`group relative flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-[10.5px] leading-none font-semibold transition-colors duration-200 ${active ? 'bg-ink-800 text-text-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'text-text-3 hover:bg-ink-850 hover:text-text-1'}`}
                        >
                            {active && <span className="absolute top-3 bottom-3 -left-1.5 w-[3px] rounded-r-full bg-accent shadow-[0_0_14px_2px_var(--color-accent)]" aria-hidden="true" />}
                            <item.icon size={20} className={`transition-transform duration-200 group-hover:scale-110 ${active ? 'text-accent' : ''}`} aria-hidden="true" />
                            <span className="max-w-full truncate">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-ink-800/80 px-3 sm:gap-3 sm:px-4">
                    <Link href="/" className="hidden sm:block lg:hidden" aria-label="Nivora, página inicial">
                        <Logo compact />
                    </Link>
                    <span className="hidden sm:inline-flex">
                        <AccountSwitch environment={environment} realAccount={props.realAccount} />
                    </span>
                    <span className="sm:hidden">
                        <AccountSwitch environment={environment} realAccount={props.realAccount} compact />
                    </span>
                    <span className="hidden xl:inline-flex">
                        <FeedIndicator />
                    </span>

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
                        <button type="button" className="btn btn-primary h-10 shrink-0 !px-2.5 sm:!px-4" aria-label="Depositar" onClick={() => setDepositOpen(true)}>
                            <WalletMinimal size={17} aria-hidden="true" />
                            <span className="hidden sm:inline">Depositar</span>
                        </button>
                        <div className={`flex h-10 items-center gap-1 rounded-xl border bg-ink-950 px-2.5 sm:pr-1 sm:pl-3 ${isReal ? 'border-real/40' : 'border-ink-800'}`}>
                            <div className="text-right leading-tight">
                                <div className={`text-[9px] font-semibold tracking-wider uppercase ${isReal ? 'text-real' : 'text-text-3'}`}>{isReal ? 'Saldo real' : 'Saldo demo'}</div>
                                <Money cents={wallet?.available_cents ?? 0} className="block text-[13px] font-medium" />
                            </div>
                            <button
                                type="button"
                                aria-label={hideBalance ? 'Mostrar saldo' : 'Ocultar saldo'}
                                title={hideBalance ? 'Mostrar saldo' : 'Ocultar saldo'}
                                className="hidden size-8 place-items-center rounded-lg text-text-3 hover:bg-ink-800 hover:text-text-1 sm:grid"
                                onClick={() =>
                                    void savePreferences({
                                        hide_balance: !hideBalance,
                                    })
                                }
                            >
                                {hideBalance ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                            </button>
                        </div>

                        <UserMenu onDeposit={() => setDepositOpen(true)} />
                    </div>
                </header>

                <main className={`min-h-0 flex-1 ${fullHeight ? 'overflow-hidden' : 'thin-scroll overflow-y-auto'}`}>{children}</main>

                <nav aria-label="Principal" className="glass grid shrink-0 grid-cols-5 border-t border-ink-800/80 pb-[env(safe-area-inset-bottom)] lg:hidden">
                    {NAVIGATION.map((item) => {
                        const active = url.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${active ? 'text-accent' : 'text-text-3'}`}
                            >
                                {active && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-accent shadow-[0_0_12px_2px_var(--color-accent)]" aria-hidden="true" />}
                                <item.icon size={19} aria-hidden="true" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <Drawer open={panel.open} title="Minha conta" onClose={panel.close}>
                <AccountSettings />
            </Drawer>
            <DepositDialog open={depositOpen} onClose={closeDeposit} />
            <ToastHost />
        </div>
    );
}
