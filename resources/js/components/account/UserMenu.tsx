import { Link, router, usePage } from '@inertiajs/react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Copy, History, LayoutDashboard, LogOut, ReceiptText, Settings, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { AccountAvatar } from '@/components/account/AccountSections';
import { Popover } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { SharedProps } from '@/lib/types';
import { useAccountPanel, type AccountTab } from '@/stores/accountPanel';
import { useToasts } from '@/stores/toasts';

function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
        <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-ink-700)" strokeWidth="3" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - value / 100)}
                    className="transition-[stroke-dashoffset] duration-700"
                />
            </svg>
            <span className="numeric absolute text-[11px] font-semibold">{value}%</span>
        </span>
    );
}

/**
 * Account menu in the header: who is signed in, first-steps progress and the
 * shortcuts a broker account usually offers.
 */
export function UserMenu({ onDeposit }: { onDeposit: () => void }) {
    const { props } = usePage<SharedProps>();
    const user = props.auth.user;
    const onboarding = props.onboarding;
    const panel = useAccountPanel();
    const push = useToasts((state) => state.push);

    if (!user) return null;

    const openTab = (close: () => void, tab: AccountTab) => {
        close();
        panel.show(tab);
    };

    const goToWithdraw = async (close: () => void) => {
        close();

        if (props.realAccount?.opened && props.environment !== 'real') {
            await api('/wallet/environment', {
                method: 'PUT',
                body: { environment: 'real' },
            }).catch(() => undefined);
        }

        router.visit(props.realAccount?.opened ? '/carteira' : '/carteira?abrir=real', { preserveState: false });
    };

    const copyId = () => {
        navigator.clipboard
            ?.writeText(user.profile_id)
            .then(() => push({ tone: 'info', title: 'ID copiado' }))
            .catch(() => undefined);
    };

    const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-1 transition-colors hover:bg-ink-800';

    return (
        <Popover
            align="right"
            label="Conta"
            trigger={({ open, toggle }) => (
                <button type="button" aria-label="Abrir menu da conta" aria-expanded={open} className="flex h-10 items-center gap-2 rounded-xl px-1.5 transition-colors hover:bg-ink-800" onClick={toggle}>
                    <AccountAvatar name={user.name} url={user.avatar_url} size={32} />
                    <span className="hidden max-w-32 truncate text-[13px] font-semibold md:inline">{user.first_name}</span>
                    <ChevronDown size={14} className={`hidden text-text-3 transition-transform md:inline ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
            )}
        >
            {(close) => (
                <div className="flex w-[min(92vw,340px)] flex-col sm:w-[580px] sm:flex-row">
                    <div className="flex flex-col gap-3 border-b border-ink-700 p-3 sm:w-[260px] sm:border-r sm:border-b-0">
                        <div className="flex items-center gap-3">
                            <AccountAvatar name={user.name} url={user.avatar_url} size={44} />
                            <div className="min-w-0">
                                <div className="truncate text-[15px] font-bold">{user.name}</div>
                                <div className="truncate text-xs text-text-3">{user.email}</div>
                            </div>
                        </div>

                        {onboarding && onboarding.progress < 100 && (
                            <Link href="/dashboard#primeiros-passos" onClick={close} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-2.5 transition-colors hover:border-ink-600">
                                <ProgressRing value={onboarding.progress} />
                                <span className="text-[12px] leading-snug text-text-2">Conclua os primeiros passos e comece a negociar.</span>
                            </Link>
                        )}

                        <dl className="grid grid-cols-2 gap-2 border-t border-ink-700 pt-3 text-[11px]">
                            <div>
                                <dt className="text-text-3">Data de cadastro</dt>
                                <dd className="mt-0.5 text-[13px] text-text-1">{user.member_since ? formatDateTime(user.member_since).split(',')[0] : '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-text-3">ID do usuário</dt>
                                <dd className="mt-0.5">
                                    <button type="button" className="numeric inline-flex items-center gap-1 text-[13px] text-text-1 hover:text-accent" onClick={copyId} title="Copiar ID">
                                        {user.profile_id}
                                        <Copy size={12} aria-hidden="true" />
                                    </button>
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <div className="flex flex-1 flex-col p-1.5">
                        <button type="button" role="menuitem" className={item} onClick={() => openTab(close, 'profile')}>
                            <UserRound size={15} className="text-text-3" aria-hidden="true" />
                            Dados pessoais
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={item}
                            onClick={() => {
                                close();
                                onDeposit();
                            }}
                        >
                            <ArrowDownToLine size={15} className="text-accent" aria-hidden="true" />
                            Depositar fundos
                        </button>
                        <button type="button" role="menuitem" className={item} onClick={() => void goToWithdraw(close)}>
                            <ArrowUpFromLine size={15} className="text-text-3" aria-hidden="true" />
                            Sacar fundos
                        </button>
                        <Link href="/carteira" role="menuitem" className={item} onClick={close}>
                            <ReceiptText size={15} className="text-text-3" aria-hidden="true" />
                            Histórico do saldo
                        </Link>
                        <Link href="/operacoes" role="menuitem" className={item} onClick={close}>
                            <History size={15} className="text-text-3" aria-hidden="true" />
                            Histórico de operações
                        </Link>
                        <button type="button" role="menuitem" className={item} onClick={() => openTab(close, 'preferences')}>
                            <SlidersHorizontal size={15} className="text-text-3" aria-hidden="true" />
                            Preferências de negociação
                        </button>
                        <button type="button" role="menuitem" className={item} onClick={() => openTab(close, 'security')}>
                            <ShieldCheck size={15} className="text-text-3" aria-hidden="true" />
                            Proteção e segurança
                        </button>
                        <Link href="/conta" role="menuitem" className={item} onClick={close}>
                            <Settings size={15} className="text-text-3" aria-hidden="true" />
                            Todas as definições
                        </Link>
                        {props.auth.user?.is_admin && (
                            <a href="/admin" role="menuitem" className={`${item} text-accent`}>
                                <LayoutDashboard size={15} aria-hidden="true" />
                                Painel administrativo
                            </a>
                        )}
                        <div className="my-1 hairline" />
                        <button type="button" role="menuitem" className={`${item} text-text-2`} onClick={() => router.post('/logout')}>
                            <LogOut size={15} aria-hidden="true" />
                            Sair
                        </button>
                    </div>
                </div>
            )}
        </Popover>
    );
}
