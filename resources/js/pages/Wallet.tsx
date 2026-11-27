import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ChevronLeft, ChevronRight, Landmark, Lock, ReceiptText, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState, Money, Page, PageHeader, PanelHeader, Stat } from '@/components/ui';
import { DepositPanel, depositBlockedReason } from '@/components/wallet/DepositPanel';
import { OpenRealAccount } from '@/components/wallet/OpenRealAccount';
import { PaymentHistory } from '@/components/wallet/PaymentHistory';
import { WithdrawPanel } from '@/components/wallet/WithdrawPanel';
import AppLayout from '@/layouts/AppLayout';
import { ENTRY_LABELS, formatCents, formatDateTime, formatSignedCents } from '@/lib/format';
import type { Deposit, Environment, SharedProps, WalletSummary, Withdrawal } from '@/lib/types';
import { useAccountPanel } from '@/stores/accountPanel';
import { useWallet } from '@/stores/wallet';

type Entry = { id: number; seq: number; type: string; available_delta_cents: number; reserved_delta_cents: number; available_after_cents: number; reserved_after_cents: number; reason: string | null; created_at: string | null };
type PaginatedEntries = { data: Entry[]; prev_page_url: string | null; next_page_url: string | null; current_page: number; last_page: number };
type Limits = { min_deposit_cents: number; max_deposit_cents: number; min_withdrawal_cents: number; max_withdrawal_cents: number; daily_withdrawal_limit_cents: number; withdrawal_fee_paid_by_user: boolean };
type Collection<T> = { data: T[] } | T[];

type Props = {
    environment: Environment;
    wallet: WalletSummary;
    entries: PaginatedEntries;
    deposits: Collection<Deposit>;
    withdrawals: Collection<Withdrawal>;
    limits: Limits;
};

const ENTRY_ICONS: Record<string, ReactNode> = {
    demo_grant: <Sparkles size={15} className="text-accent" aria-hidden="true" />,
    demo_reset: <RotateCcw size={15} className="text-info" aria-hidden="true" />,
    position_reserve: <Lock size={15} className="text-text-2" aria-hidden="true" />,
    deposit_credit: <ArrowDownToLine size={15} className="text-up" aria-hidden="true" />,
    deposit_reversal: <Undo2 size={15} className="text-down" aria-hidden="true" />,
    withdrawal_reserve: <Lock size={15} className="text-text-2" aria-hidden="true" />,
    withdrawal_payout: <ArrowUpFromLine size={15} className="text-text-2" aria-hidden="true" />,
    withdrawal_release: <Undo2 size={15} className="text-info" aria-hidden="true" />,
};

function entryIcon(entry: Entry): ReactNode {
    return ENTRY_ICONS[entry.type] ?? (entry.available_delta_cents > entry.reserved_delta_cents * -1 ? <ArrowUpRight size={15} className="text-up" aria-hidden="true" /> : <ArrowDownLeft size={15} className="text-down" aria-hidden="true" />);
}

function list<T>(collection: Collection<T>): T[] {
    return Array.isArray(collection) ? collection : collection.data;
}

function Ledger({ entries }: { entries: PaginatedEntries }) {
    return (
        <section className="panel overflow-hidden">
            <PanelHeader title="Extrato" />
            {entries.data.length === 0 ? (
                <EmptyState icon={<ReceiptText size={18} aria-hidden="true" />} title="Sem movimentações" />
            ) : (
                <div className="thin-scroll overflow-x-auto">
                    <table className="data-table min-w-[640px]">
                        <thead>
                            <tr>
                                <th>Movimentação</th>
                                <th>Data</th>
                                <th data-align="right">Disponível</th>
                                <th data-align="right">Reservado</th>
                                <th data-align="right">Saldo após</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.data.map((entry) => (
                                <tr key={entry.id}>
                                    <td>
                                        <span className="flex items-center gap-2.5 font-medium">
                                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink-800">{entryIcon(entry)}</span>
                                            {ENTRY_LABELS[entry.type] ?? entry.type}
                                        </span>
                                    </td>
                                    <td className="numeric text-xs text-text-2">{formatDateTime(entry.created_at)}</td>
                                    <td data-align="right" className={`numeric ${entry.available_delta_cents > 0 ? 'text-up' : ''}`}>
                                        {entry.available_delta_cents === 0 ? '—' : formatSignedCents(entry.available_delta_cents)}
                                    </td>
                                    <td data-align="right" className="numeric text-text-2">
                                        {entry.reserved_delta_cents === 0 ? '—' : formatSignedCents(entry.reserved_delta_cents)}
                                    </td>
                                    <td data-align="right" className="numeric">
                                        {formatCents(entry.available_after_cents)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {entries.last_page > 1 && (
                <nav className="flex items-center justify-between gap-3 border-t border-ink-800 p-3 text-xs text-text-2" aria-label="Paginação">
                    {entries.prev_page_url ? (
                        <Link href={entries.prev_page_url} className="btn btn-ghost btn-sm">
                            <ChevronLeft size={15} aria-hidden="true" />
                            Anterior
                        </Link>
                    ) : (
                        <span />
                    )}
                    <span>
                        Página {entries.current_page} de {entries.last_page}
                    </span>
                    {entries.next_page_url ? (
                        <Link href={entries.next_page_url} className="btn btn-ghost btn-sm">
                            Próxima
                            <ChevronRight size={15} aria-hidden="true" />
                        </Link>
                    ) : (
                        <span />
                    )}
                </nav>
            )}
        </section>
    );
}

function RealAccountCard() {
    const { props } = usePage<SharedProps>();
    const realAccount = props.realAccount;
    const select = useWallet((state) => state.select);

    if (realAccount?.opened) {
        return (
            <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-real-soft text-real">
                        <Landmark size={19} aria-hidden="true" />
                    </span>
                    <div>
                        <div className="font-semibold">Conta real</div>
                        <div className="text-xs text-text-3">
                            Disponível: <Money cents={realAccount.wallet?.available_cents ?? 0} />
                        </div>
                    </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void select('real')}>
                    Ir para a conta real
                </button>
            </section>
        );
    }

    if (!realAccount?.enabled) {
        return null;
    }

    return <OpenRealAccount />;
}

export default function Wallet({ environment, wallet: initialWallet, entries, deposits, withdrawals, limits }: Props) {
    const { props } = usePage<SharedProps>();
    const wallet = useWallet((state) => state.summary) ?? initialWallet;
    const showAccount = useAccountPanel((state) => state.show);
    const realAccount = props.realAccount;

    if (environment === 'demo') {
        return (
            <AppLayout>
                <Head title="Carteira" />
                <Page width="max-w-5xl">
                    <PageHeader
                        title="Carteira demo"
                        description="Saldo virtual para treinar, separado da conta real e sem saque. Cada movimentação fica registrada e não pode ser alterada."
                        actions={
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => showAccount('demo')}>
                                <RotateCcw size={15} aria-hidden="true" />
                                Reiniciar saldo
                            </button>
                        }
                    />

                    <div className="grid gap-3 sm:grid-cols-3">
                        <Stat label="Disponível" value={<Money cents={wallet.available_cents} />} hint="Pode ser usado em operações" />
                        <Stat label="Em operações" value={<Money cents={wallet.reserved_cents} />} hint="Reservado até o vencimento" />
                        <Stat label="Total" value={<Money cents={wallet.available_cents + wallet.reserved_cents} />} hint="Disponível + em operações" />
                    </div>

                    <RealAccountCard />
                    <Ledger entries={entries} />
                </Page>
            </AppLayout>
        );
    }

    const depositList = list(deposits);
    const pendingDeposit = depositList.find((deposit) => deposit.status === 'pending' && deposit.pix_code !== null) ?? null;
    const frozen = realAccount?.status === 'frozen';
    const depositBlocked = depositBlockedReason(realAccount);

    return (
        <AppLayout>
            <Head title="Carteira real" />
            <Page width="max-w-5xl">
                <PageHeader title="Carteira real" description="Dinheiro de verdade, separado da conta demo. Depósitos e saques por PIX; cada movimentação fica registrada e não pode ser alterada." />

                <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Disponível" value={<Money cents={wallet.available_cents} />} hint="Para operar ou sacar" />
                    <Stat label="Reservado" value={<Money cents={wallet.reserved_cents} />} hint="Em operações e saques em andamento" />
                    <Stat label="Total" value={<Money cents={wallet.available_cents + wallet.reserved_cents} />} hint="Disponível + reservado" />
                </div>

                {frozen && <p className="rounded-xl border border-down/40 bg-down-soft p-3.5 text-[13px] text-text-1">Sua conta real está bloqueada para operações e saques. Fale com o suporte.</p>}

                <div className="grid gap-4 lg:grid-cols-2">
                    <DepositPanel key={pendingDeposit?.id ?? 'new'} limits={{ min: limits.min_deposit_cents, max: limits.max_deposit_cents }} initial={pendingDeposit} disabledReason={depositBlocked} />
                    <WithdrawPanel availableCents={frozen ? 0 : wallet.available_cents} limits={{ min: limits.min_withdrawal_cents, max: limits.max_withdrawal_cents, daily: limits.daily_withdrawal_limit_cents, feePaidByUser: limits.withdrawal_fee_paid_by_user }} />
                </div>

                <PaymentHistory deposits={depositList} withdrawals={list(withdrawals)} />
                <Ledger entries={entries} />
            </Page>
        </AppLayout>
    );
}
