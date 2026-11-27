import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { ActionDialog, AdminCard, EmptyRow, FilterChips, Pagination, SearchBox, StatusBadge, useFilters, type PendingAction } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { WITHDRAWAL_STATUS, type AdminPage, type AdminWithdrawal } from '@/lib/admin';
import { formatCents, formatDateTime } from '@/lib/format';

const STATUS_OPTIONS = [{ value: null, label: 'Todos' }, ...Object.entries(WITHDRAWAL_STATUS).map(([value, status]) => ({ value, label: status.label }))];

const KEY_TYPES: Record<string, string> = { cpf: 'CPF', email: 'E-mail', phone: 'Celular', random: 'Aleatória', evp: 'Aleatória' };

export default function Withdrawals({ withdrawals, filters, counts }: { withdrawals: AdminPage<AdminWithdrawal>; filters: { q: string; status: string | null }; counts: { requested: number; in_flight: number } }) {
    const update = useFilters('/admin/saques', filters);
    const [pending, setPending] = useState<PendingAction | null>(null);

    return (
        <AdminLayout
            title="Saques"
            description={`${counts.requested} aguardando sua aprovação · ${counts.in_flight} em envio. Aprovar envia o PIX pela AmploPay; o saque só fica "Pago" quando ela confirma. Recusar devolve o valor ao saldo do cliente.`}
        >
            <AdminCard title={<span className="numeric">{withdrawals.total.toLocaleString('pt-BR')} saque(s)</span>} action={<SearchBox value={filters.q} placeholder="Código, transferência ou cliente" onSearch={(q) => update({ q })} />}>
                <div className="border-b border-ink-800 px-5 py-3">
                    <FilterChips label="Situação" value={filters.status} options={STATUS_OPTIONS} onChange={(status) => update({ status })} />
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table min-w-[980px]">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Situação</th>
                                <th data-align="right">Valor</th>
                                <th>Chave PIX de destino</th>
                                <th>Pedido</th>
                                <th data-align="right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {withdrawals.data.length === 0 && <EmptyRow colSpan={6}>Nenhum saque com esses filtros.</EmptyRow>}
                            {withdrawals.data.map((withdrawal) => {
                                const status = WITHDRAWAL_STATUS[withdrawal.status] ?? { label: withdrawal.status, tone: 'neutral' as const };
                                const url = `/admin/saques/${withdrawal.id}`;
                                const summary = (
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-ink-800 bg-ink-950/60 p-3 text-xs">
                                        <dt className="text-text-3">Cliente</dt>
                                        <dd>{withdrawal.user}</dd>
                                        <dt className="text-text-3">Valor</dt>
                                        <dd className="numeric">{formatCents(withdrawal.amount_cents)}</dd>
                                        <dt className="text-text-3">Chave</dt>
                                        <dd className="break-all">
                                            {KEY_TYPES[withdrawal.pix_key_type] ?? withdrawal.pix_key_type}: {withdrawal.pix_key}
                                        </dd>
                                    </dl>
                                );

                                return (
                                    <tr key={withdrawal.id} className={withdrawal.can_decide ? 'bg-accent/[0.03]' : ''}>
                                        <td>
                                            <Link href={`/admin/clientes/${withdrawal.user_id}`} className="font-semibold hover:text-accent">
                                                {withdrawal.user ?? `Cliente #${withdrawal.user_id}`}
                                            </Link>
                                            <div className="text-[11px] text-text-3">{withdrawal.email}</div>
                                        </td>
                                        <td>
                                            <StatusBadge label={status.label} tone={status.tone} />
                                            {withdrawal.failure_reason && <div className="mt-1 max-w-56 truncate text-[11px] text-down">{withdrawal.failure_reason}</div>}
                                            {withdrawal.reviewer && <div className="mt-1 text-[11px] text-text-3">por {withdrawal.reviewer}</div>}
                                        </td>
                                        <td data-align="right" className="numeric font-medium">
                                            {formatCents(withdrawal.amount_cents)}
                                            {withdrawal.fee_cents !== null && <div className="text-[11px] text-text-3">tarifa {formatCents(withdrawal.fee_cents)}</div>}
                                        </td>
                                        <td className="max-w-64 text-xs">
                                            <span className="text-text-3">{KEY_TYPES[withdrawal.pix_key_type] ?? withdrawal.pix_key_type}:</span> <span className="break-all">{withdrawal.pix_key}</span>
                                        </td>
                                        <td className="text-xs text-text-2">
                                            {formatDateTime(withdrawal.created_at)}
                                            {withdrawal.completed_at && <div className="text-up">pago {formatDateTime(withdrawal.completed_at)}</div>}
                                        </td>
                                        <td data-align="right">
                                            <div className="flex justify-end gap-1.5">
                                                {withdrawal.can_decide && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() =>
                                                                setPending({
                                                                    url: `${url}/aprovar`,
                                                                    title: 'Aprovar e enviar saque',
                                                                    description: (
                                                                        <div className="flex flex-col gap-2">
                                                                            {summary}
                                                                            <span>Confira se a chave é do próprio cliente. O PIX é enviado na hora pela AmploPay.</span>
                                                                        </div>
                                                                    ),
                                                                    confirmLabel: 'Aprovar e enviar',
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
                                                                    title: 'Recusar saque',
                                                                    description: (
                                                                        <div className="flex flex-col gap-2">
                                                                            {summary}
                                                                            <span>O valor volta ao saldo disponível do cliente.</span>
                                                                        </div>
                                                                    ),
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
                                                {withdrawal.can_retry && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() =>
                                                            setPending({
                                                                url: `${url}/reenviar`,
                                                                title: 'Repetir envio',
                                                                description: 'A AmploPay não respondeu ao primeiro envio. O sistema consulta antes de enviar de novo, então o saque nunca é pago duas vezes.',
                                                                confirmLabel: 'Repetir envio',
                                                                noteField: 'note',
                                                            })
                                                        }
                                                    >
                                                        Reenviar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination page={withdrawals} />
            </AdminCard>
            <ActionDialog action={pending} onClose={() => setPending(null)} />
        </AdminLayout>
    );
}
