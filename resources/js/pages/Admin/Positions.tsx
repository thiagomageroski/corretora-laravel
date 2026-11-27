import { Link } from '@inertiajs/react';
import { AdminCard, EmptyRow, FilterChips, Kpi, Pagination, SearchBox, StatusBadge, useFilters } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { bpsPercent, type AdminPage, type AdminPosition } from '@/lib/admin';
import { formatCents, formatDateTime, formatPrice, formatSignedCents, RESULT_LABELS } from '@/lib/format';
import { AssetIcon } from '@/components/ui';

type Filters = { q: string; conta: 'real' | 'demo'; situacao: string | null };

const STATES = [
    { value: null, label: 'Todas' },
    { value: 'open', label: 'Abertas' },
    { value: 'won', label: 'Positivas' },
    { value: 'lost', label: 'Negativas' },
    { value: 'neutral', label: 'Neutras' },
    { value: 'voided', label: 'Anuladas' },
];

export default function Positions({ positions, filters, summary }: { positions: AdminPage<AdminPosition>; filters: Filters; summary: { count: number; volume_cents: number; house_result_cents: number } }) {
    const update = useFilters('/admin/operacoes', filters);

    return (
        <AdminLayout title="Operações" description="Todas as operações dos clientes. Os termos (preço de entrada, valor, prazo) e os resultados não podem ser alterados, nem pelo banco de dados.">
            <div className="flex flex-wrap items-center gap-3">
                <FilterChips
                    label="Conta"
                    value={filters.conta}
                    options={[
                        { value: 'real', label: 'Conta real' },
                        { value: 'demo', label: 'Conta demo' },
                    ]}
                    onChange={(conta) => update({ conta: conta ?? 'real' })}
                />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi label="Operações" value={summary.count.toLocaleString('pt-BR')} hint="Com os filtros atuais" />
                <Kpi label="Volume" value={formatCents(summary.volume_cents)} />
                <Kpi label="Resultado da casa" value={formatSignedCents(summary.house_result_cents)} tone={summary.house_result_cents >= 0 ? 'up' : 'down'} hint="Valor apostado menos o devolvido, nas encerradas" />
            </div>
            <AdminCard title="Lista" action={<SearchBox value={filters.q} placeholder="Cliente ou ativo" onSearch={(q) => update({ q })} />}>
                <div className="border-b border-ink-800 px-5 py-3">
                    <FilterChips label="Situação" value={filters.situacao} options={STATES} onChange={(situacao) => update({ situacao })} />
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table min-w-[980px]">
                        <thead>
                            <tr>
                                <th>Aberta</th>
                                <th>Cliente</th>
                                <th>Ativo</th>
                                <th>Direção</th>
                                <th data-align="right">Valor</th>
                                <th data-align="right">Retorno</th>
                                <th data-align="right">Entrada → encerramento</th>
                                <th data-align="right">Resultado do cliente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.data.length === 0 && <EmptyRow colSpan={8}>Nenhuma operação com esses filtros.</EmptyRow>}
                            {positions.data.map((position) => (
                                <tr key={position.id}>
                                    <td className="text-xs text-text-2">{formatDateTime(position.opened_at)}</td>
                                    <td>
                                        <Link href={`/admin/clientes/${position.user_id}`} className="font-semibold hover:text-accent">
                                            {position.user ?? `Cliente #${position.user_id}`}
                                        </Link>
                                    </td>
                                    <td className="font-semibold">
                                        <span className="flex items-center gap-2">
                                            <AssetIcon symbol={position.symbol} size={20} />
                                            {position.symbol}
                                        </span>
                                    </td>
                                    <td className={position.direction === 'call' ? 'font-bold text-up' : 'font-bold text-down'}>{position.direction.toUpperCase()}</td>
                                    <td data-align="right" className="numeric">
                                        {formatCents(position.stake_cents)}
                                    </td>
                                    <td data-align="right" className="numeric text-text-2">
                                        {bpsPercent(position.payout_rate_bps)}
                                    </td>
                                    <td data-align="right" className="numeric text-xs text-text-2">
                                        {formatPrice(position.entry_price)} → {position.close_price ? formatPrice(position.close_price) : '…'}
                                    </td>
                                    <td data-align="right">
                                        {position.result ? (
                                            <span className={`numeric ${position.result === 'won' ? 'text-up' : position.result === 'lost' ? 'text-down' : 'text-text-2'}`}>
                                                {RESULT_LABELS[position.result]} {position.returned_cents !== null ? formatSignedCents(position.returned_cents - position.stake_cents) : ''}
                                            </span>
                                        ) : (
                                            <StatusBadge label={`Vence ${formatDateTime(position.expires_at).split(' ').pop()}`} tone="accent" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination page={positions} />
            </AdminCard>
        </AdminLayout>
    );
}
