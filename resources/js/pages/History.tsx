import { Head, Link, router } from '@inertiajs/react';
import { ChartCandlestick, ChevronLeft, ChevronRight, History as HistoryIcon } from 'lucide-react';
import { ResultBadge } from '@/components/terminal/PositionsPanel';
import { AssetIcon, EmptyState, Page, PageHeader, Segmented, Stat } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import { formatCents, formatDateTime, formatPrice, formatSignedCents, providerName } from '@/lib/format';
import type { Paginated, Performance, Position } from '@/lib/types';

const FILTERS = [
    { value: 'all', label: 'Todas' },
    { value: 'open', label: 'Abertas' },
    { value: 'won', label: 'Positivas' },
    { value: 'lost', label: 'Negativas' },
    { value: 'neutral', label: 'Neutras' },
    { value: 'voided', label: 'Anuladas' },
];

export default function History({ positions, performance, filter }: { positions: Paginated<Position>; performance: Performance; filter: string | null }) {
    const decided = performance.won + performance.lost;
    const net = performance.net_result_cents;

    const applyFilter = (value: string) => {
        router.get('/operacoes', value === 'all' ? {} : { result: value }, { preserveState: true, preserveScroll: true });
    };

    return (
        <AppLayout>
            <Head title="Operações" />
            <Page>
                <PageHeader title="Histórico de operações" description="Preços e horários usados em cada operação da conta selecionada. Depois de encerrada, uma operação não pode ser alterada." />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Operações" value={performance.total} hint={`${performance.open} abertas`} />
                    <Stat label="Resultado" value={<span className={net > 0 ? 'text-up' : net < 0 ? 'text-down' : ''}>{formatSignedCents(net)}</span>} hint="Nas operações encerradas" />
                    <Stat label="Positivas / negativas" value={`${performance.won} / ${performance.lost}`} hint={`${performance.neutral + performance.voided} neutras ou anuladas`} />
                    <Stat
                        label="Taxa de acerto"
                        value={decided > 0 ? `${((performance.won / decided) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
                        hint={decided > 0 ? `Em ${decided} decididas` : 'Sem operações decididas'}
                    />
                </div>

                <div className="no-scrollbar overflow-x-auto">
                    <Segmented label="Filtrar por situação" value={filter ?? 'all'} options={FILTERS} onChange={applyFilter} />
                </div>

                <div className="panel thin-scroll overflow-x-auto">
                    {positions.data.length === 0 ? (
                        <EmptyState icon={<HistoryIcon size={18} aria-hidden="true" />} title={filter ? 'Nenhuma operação com este filtro' : 'Nenhuma operação ainda'}>
                            {!filter && (
                                <Link href="/negociar" className="inline-flex items-center gap-1 underline">
                                    <ChartCandlestick size={13} aria-hidden="true" />
                                    Vá em Negociar para começar
                                </Link>
                            )}
                        </EmptyState>
                    ) : (
                        <table className="data-table min-w-[1020px]">
                            <thead>
                                <tr>
                                    <th>Ativo</th>
                                    <th>Direção</th>
                                    <th data-align="right">Valor</th>
                                    <th data-align="right">Entrada</th>
                                    <th data-align="right">Encerramento</th>
                                    <th>Fonte</th>
                                    <th data-align="right">Abertura</th>
                                    <th data-align="right">Vencimento</th>
                                    <th>Situação</th>
                                    <th data-align="right">Resultado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.data.map((position) => (
                                    <tr key={position.id}>
                                        <td className="font-semibold">
                                            <span className="flex items-center gap-2">
                                                <AssetIcon symbol={position.symbol} size={20} />
                                                {position.symbol}
                                            </span>
                                        </td>
                                        <td className={position.direction === 'call' ? 'font-semibold text-up' : 'font-semibold text-down'}>{position.direction === 'call' ? 'CALL' : 'PUT'}</td>
                                        <td data-align="right" className="numeric">
                                            {formatCents(position.stake_cents)}
                                        </td>
                                        <td data-align="right" className="numeric text-text-2">
                                            {formatPrice(position.entry_price)}
                                        </td>
                                        <td data-align="right" className="numeric text-text-2">
                                            {formatPrice(position.close_price)}
                                        </td>
                                        <td className="text-xs text-text-2">{providerName(position.entry_source)}</td>
                                        <td data-align="right" className="numeric text-xs text-text-2">
                                            {formatDateTime(position.opened_at)}
                                        </td>
                                        <td data-align="right" className="numeric text-xs text-text-2">
                                            {formatDateTime(position.expires_at)}
                                        </td>
                                        <td title={position.void_reason === 'no_reference_price' ? 'Sem preço de referência no vencimento; valor devolvido.' : undefined}>
                                            <ResultBadge position={position} />
                                        </td>
                                        <td data-align="right" className={`numeric ${(position.result_cents ?? 0) > 0 ? 'text-up' : (position.result_cents ?? 0) < 0 ? 'text-down' : ''}`}>
                                            {position.result_cents === null ? '—' : formatSignedCents(position.result_cents)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {positions.meta && positions.meta.last_page > 1 && (
                    <nav className="flex items-center justify-between gap-3 text-xs text-text-2" aria-label="Paginação">
                        {positions.links?.prev ? (
                            <Link href={positions.links.prev} className="btn btn-ghost btn-sm">
                                <ChevronLeft size={15} aria-hidden="true" />
                                Anterior
                            </Link>
                        ) : (
                            <span />
                        )}
                        <span>
                            Página {positions.meta.current_page} de {positions.meta.last_page}
                        </span>
                        {positions.links?.next ? (
                            <Link href={positions.links.next} className="btn btn-ghost btn-sm">
                                Próxima
                                <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                        ) : (
                            <span />
                        )}
                    </nav>
                )}
            </Page>
        </AppLayout>
    );
}
