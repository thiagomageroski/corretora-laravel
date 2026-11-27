import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { ActionDialog, AdminCard, EmptyRow, FilterChips, Pagination, SearchBox, StatusBadge, useFilters, type PendingAction } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { DEPOSIT_STATUS, REVIEW_REASONS, type AdminDeposit, type AdminPage } from '@/lib/admin';
import { formatCents, formatDateTime } from '@/lib/format';

const STATUS_OPTIONS = [{ value: null, label: 'Todos' }, ...Object.entries(DEPOSIT_STATUS).map(([value, status]) => ({ value, label: status.label }))];

export default function Deposits({ deposits, filters, counts }: { deposits: AdminPage<AdminDeposit>; filters: { q: string; status: string | null }; counts: { review: number; pending: number } }) {
    const update = useFilters('/admin/depositos', filters);
    const [pending, setPending] = useState<PendingAction | null>(null);

    return (
        <AdminLayout
            title="Depósitos"
            description={`Cobranças PIX geradas pelos clientes. ${counts.pending} aguardando pagamento · ${counts.review} em análise. Um depósito só vira saldo quando a AmploPay confirma, ou quando você confirma aqui depois de ver o pagamento no painel dela.`}
        >
            <AdminCard title={<span className="numeric">{deposits.total.toLocaleString('pt-BR')} depósito(s)</span>} action={<SearchBox value={filters.q} placeholder="Código, transação ou cliente" onSearch={(q) => update({ q })} />}>
                <div className="border-b border-ink-800 px-5 py-3">
                    <FilterChips label="Situação" value={filters.status} options={STATUS_OPTIONS} onChange={(status) => update({ status })} />
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table min-w-[900px]">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Situação</th>
                                <th data-align="right">Valor</th>
                                <th>Criado / creditado</th>
                                <th>Transação AmploPay</th>
                                <th data-align="right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deposits.data.length === 0 && <EmptyRow colSpan={6}>Nenhum depósito com esses filtros.</EmptyRow>}
                            {deposits.data.map((deposit) => {
                                const status = DEPOSIT_STATUS[deposit.status] ?? { label: deposit.status, tone: 'neutral' as const };
                                const url = `/admin/depositos/${deposit.id}`;

                                return (
                                    <tr key={deposit.id}>
                                        <td>
                                            <Link href={`/admin/clientes/${deposit.user_id}`} className="font-semibold hover:text-accent">
                                                {deposit.user ?? `Cliente #${deposit.user_id}`}
                                            </Link>
                                            <div className="text-[11px] text-text-3">{deposit.email}</div>
                                        </td>
                                        <td>
                                            <StatusBadge label={status.label} tone={status.tone} />
                                            {deposit.review_reason && <div className="mt-1 text-[11px] text-accent">{REVIEW_REASONS[deposit.review_reason] ?? deposit.review_reason}</div>}
                                            {deposit.failure_reason && <div className="mt-1 max-w-56 truncate text-[11px] text-text-3">{deposit.failure_reason}</div>}
                                        </td>
                                        <td data-align="right" className="numeric font-medium">
                                            {formatCents(deposit.amount_cents)}
                                        </td>
                                        <td className="text-xs text-text-2">
                                            {formatDateTime(deposit.created_at)}
                                            {deposit.credited_at && <div className="text-up">creditado {formatDateTime(deposit.credited_at)}</div>}
                                        </td>
                                        <td className="font-mono text-[11px] text-text-3">{deposit.provider_transaction_id ?? '—'}</td>
                                        <td data-align="right">
                                            <div className="flex justify-end gap-1.5">
                                                {deposit.can_confirm && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() =>
                                                            setPending({
                                                                url: `${url}/confirmar`,
                                                                title: `Confirmar ${formatCents(deposit.amount_cents)} manualmente`,
                                                                description: 'Use só se o pagamento aparece como PAGO no painel da AmploPay e o aviso automático não chegou. O valor é creditado na hora na conta real do cliente.',
                                                                confirmLabel: 'Confirmar e creditar',
                                                                noteField: 'note',
                                                            })
                                                        }
                                                    >
                                                        Confirmar
                                                    </button>
                                                )}
                                                {deposit.can_review && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() =>
                                                                setPending({
                                                                    url: `${url}/aprovar`,
                                                                    title: `Aprovar ${formatCents(deposit.amount_cents)}`,
                                                                    description: 'O depósito foi retido por segurança. Aprovar credita o valor na conta real do cliente.',
                                                                    confirmLabel: 'Aprovar e creditar',
                                                                    noteField: 'note',
                                                                })
                                                            }
                                                        >
                                                            Aprovar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() =>
                                                                setPending({
                                                                    url: `${url}/recusar`,
                                                                    title: 'Recusar depósito',
                                                                    description: 'Nada é creditado. Devolva o valor ao pagador pelo painel da AmploPay.',
                                                                    confirmLabel: 'Recusar',
                                                                    tone: 'danger',
                                                                    noteField: 'note',
                                                                })
                                                            }
                                                        >
                                                            Recusar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination page={deposits} />
            </AdminCard>
            <ActionDialog action={pending} onClose={() => setPending(null)} />
        </AdminLayout>
    );
}
