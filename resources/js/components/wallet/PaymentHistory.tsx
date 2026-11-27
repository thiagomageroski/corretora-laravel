import { router } from '@inertiajs/react';
import { ArrowDownToLine, ArrowUpFromLine, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, PanelHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/format';
import type { Deposit, Withdrawal } from '@/lib/types';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';

const DEPOSIT_STATUS: Record<Deposit['status'], { label: string; tone: string }> = {
    pending: { label: 'Aguardando pagamento', tone: 'text-demo' },
    completed: { label: 'Confirmado', tone: 'text-up' },
    review: { label: 'Em análise', tone: 'text-demo' },
    failed: { label: 'Não concluído', tone: 'text-down' },
    expired: { label: 'Expirado', tone: 'text-text-3' },
    refunded: { label: 'Estornado', tone: 'text-down' },
    charged_back: { label: 'Contestado', tone: 'text-down' },
};

const WITHDRAWAL_STATUS: Record<Withdrawal['status'], { label: string; tone: string }> = {
    requested: { label: 'Em análise', tone: 'text-demo' },
    sending: { label: 'Enviando', tone: 'text-info' },
    processing: { label: 'Em transferência', tone: 'text-info' },
    completed: { label: 'Concluído', tone: 'text-up' },
    failed: { label: 'Falhou, valor devolvido', tone: 'text-down' },
    rejected: { label: 'Recusado, valor devolvido', tone: 'text-down' },
    canceled: { label: 'Cancelado', tone: 'text-text-3' },
};

const REVIEW_REASONS: Record<string, string> = {
    payer_mismatch: 'Pago por um CPF diferente do titular.',
    amount_mismatch: 'Valor pago diferente do cobrado.',
    currency_mismatch: 'Moeda diferente da cobrada.',
};

type Row = { key: string; kind: 'deposit' | 'withdrawal'; created_at: string | null; amount_cents: number; status: { label: string; tone: string }; detail: string | null; cancelable: string | null };

export function PaymentHistory({ deposits, withdrawals }: { deposits: Deposit[]; withdrawals: Withdrawal[] }) {
    const push = useToasts((state) => state.push);
    const refreshWallet = useWallet((state) => state.refresh);
    const [canceling, setCanceling] = useState<string | null>(null);

    const rows: Row[] = [
        ...deposits.map((deposit) => ({
            key: `d-${deposit.id}`,
            kind: 'deposit' as const,
            created_at: deposit.created_at,
            amount_cents: deposit.amount_cents,
            status: DEPOSIT_STATUS[deposit.status],
            detail: deposit.status === 'review' ? (REVIEW_REASONS[deposit.review_reason ?? ''] ?? 'Aguardando verificação.') : deposit.status === 'failed' ? deposit.failure_reason : null,
            cancelable: null,
        })),
        ...withdrawals.map((withdrawal) => ({
            key: `w-${withdrawal.id}`,
            kind: 'withdrawal' as const,
            created_at: withdrawal.created_at,
            amount_cents: withdrawal.amount_cents,
            status: WITHDRAWAL_STATUS[withdrawal.status],
            detail: [`PIX ${withdrawal.pix_key_masked}`, withdrawal.received_cents !== null ? `recebido ${formatCents(withdrawal.received_cents)}` : null, withdrawal.status === 'failed' ? withdrawal.failure_reason : null].filter(Boolean).join(' · '),
            cancelable: withdrawal.status === 'requested' ? withdrawal.id : null,
        })),
    ].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

    const cancel = async (id: string) => {
        setCanceling(id);

        try {
            await api(`/withdrawals/${id}`, { method: 'DELETE' });
            push({ tone: 'neutral', title: 'Saque cancelado', detail: 'O valor voltou para o saldo disponível.' });
            await refreshWallet();
            router.reload({ only: ['entries', 'withdrawals', 'wallet', 'realAccount', 'activeWallet'] });
        } catch (exception) {
            push({ tone: 'down', title: exception instanceof ApiError ? exception.message : 'Não foi possível cancelar.' });
        } finally {
            setCanceling(null);
        }
    };

    return (
        <section className="panel overflow-hidden">
            <PanelHeader title="Depósitos e saques" />
            {rows.length === 0 ? (
                <EmptyState icon={<ReceiptText size={18} aria-hidden="true" />} title="Nenhum depósito ou saque ainda" />
            ) : (
                <div className="thin-scroll overflow-x-auto">
                    <table className="data-table min-w-[640px]">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Data</th>
                                <th>Situação</th>
                                <th data-align="right">Valor</th>
                                <th data-align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.key}>
                                    <td>
                                        <span className="flex items-center gap-2.5 font-medium">
                                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink-800">
                                                {row.kind === 'deposit' ? <ArrowDownToLine size={15} className="text-up" aria-hidden="true" /> : <ArrowUpFromLine size={15} className="text-text-2" aria-hidden="true" />}
                                            </span>
                                            <span>
                                                {row.kind === 'deposit' ? 'Depósito PIX' : 'Saque PIX'}
                                                {row.detail && <span className="block text-[11px] font-normal text-text-3">{row.detail}</span>}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="numeric text-xs text-text-2">{formatDateTime(row.created_at)}</td>
                                    <td className={`text-xs font-semibold ${row.status.tone}`}>{row.status.label}</td>
                                    <td data-align="right" className="numeric">
                                        {formatCents(row.amount_cents)}
                                    </td>
                                    <td data-align="right">
                                        {row.cancelable && (
                                            <button type="button" className="btn btn-ghost btn-sm" disabled={canceling === row.cancelable} onClick={() => void cancel(row.cancelable as string)}>
                                                Cancelar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
