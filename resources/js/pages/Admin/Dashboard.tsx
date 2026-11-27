import { Link } from '@inertiajs/react';
import { ArrowRight } from 'lucide-react';
import { DailyBars } from '@/components/admin/DailyBars';
import { AdminCard, EmptyRow, Kpi, StatusBadge } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { formatCents, formatDateTime, formatSignedCents } from '@/lib/format';

type Metrics = {
    users_total: number;
    users_today: number;
    users_week: number;
    real_accounts: number;
    real_balance_cents: number;
    deposits_total_cents: number;
    deposits_today_cents: number;
    deposits_pending: number;
    deposits_review: number;
    withdrawals_total_cents: number;
    withdrawals_waiting: number;
    withdrawals_in_flight: number;
    positions_open: number;
    positions_open_demo: number;
    volume_today_cents: number;
    house_result_cents: number;
    house_result_today_cents: number;
};

type Day = { date: string; deposits_cents: number; withdrawals_cents: number; users: number };

const MONEY_SERIES = [
    { key: 'deposits_cents', label: 'Depósitos', color: '#7ba11d' },
    { key: 'withdrawals_cents', label: 'Saques pagos', color: '#4a8ae0' },
];

export default function Dashboard({
    metrics,
    chart,
    recentUsers,
    waitingWithdrawals,
}: {
    metrics: Metrics;
    chart: Day[];
    recentUsers: { id: number; name: string; email: string; created_at: string | null; real: boolean }[];
    waitingWithdrawals: { id: string; user: string | null; user_id: number; amount_cents: number; created_at: string | null }[];
}) {
    const result = (cents: number) => (cents >= 0 ? 'up' : 'down') as 'up' | 'down';

    return (
        <AdminLayout title="Visão geral" description="Os números da plataforma em dinheiro real. Resultado da casa = valores apostados menos o que foi pago aos clientes nas operações encerradas.">
            {(metrics.withdrawals_waiting > 0 || metrics.deposits_review > 0) && (
                <div className="flex flex-wrap gap-3">
                    {metrics.withdrawals_waiting > 0 && (
                        <Link href="/admin/saques?status=requested" className="panel panel-hover flex flex-1 items-center justify-between gap-3 border-accent/40 px-4 py-3 text-[13px]">
                            <span>
                                <strong className="numeric text-accent">{metrics.withdrawals_waiting}</strong> saque(s) aguardando sua aprovação
                            </span>
                            <ArrowRight size={16} className="text-accent" aria-hidden="true" />
                        </Link>
                    )}
                    {metrics.deposits_review > 0 && (
                        <Link href="/admin/depositos?status=review" className="panel panel-hover flex flex-1 items-center justify-between gap-3 border-accent/40 px-4 py-3 text-[13px]">
                            <span>
                                <strong className="numeric text-accent">{metrics.deposits_review}</strong> depósito(s) em análise
                            </span>
                            <ArrowRight size={16} className="text-accent" aria-hidden="true" />
                        </Link>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Clientes" value={metrics.users_total.toLocaleString('pt-BR')} hint={`+${metrics.users_today} hoje · +${metrics.users_week} em 7 dias`} />
                <Kpi label="Contas reais" value={metrics.real_accounts.toLocaleString('pt-BR')} hint={`Saldo dos clientes: ${formatCents(metrics.real_balance_cents)}`} />
                <Kpi label="Depósitos creditados" value={formatCents(metrics.deposits_total_cents)} hint={`${formatCents(metrics.deposits_today_cents)} hoje · ${metrics.deposits_pending} PIX em aberto`} />
                <Kpi label="Saques pagos" value={formatCents(metrics.withdrawals_total_cents)} hint={`${metrics.withdrawals_waiting} aguardando · ${metrics.withdrawals_in_flight} em envio`} />
                <Kpi label="Resultado da casa" value={formatSignedCents(metrics.house_result_cents)} tone={result(metrics.house_result_cents)} hint={`Hoje: ${formatSignedCents(metrics.house_result_today_cents)}`} />
                <Kpi label="Volume operado hoje" value={formatCents(metrics.volume_today_cents)} hint="Somente conta real" />
                <Kpi label="Operações abertas" value={metrics.positions_open.toLocaleString('pt-BR')} hint={`Conta real · ${metrics.positions_open_demo} na demo`} />
                <Kpi label="Fluxo líquido" value={formatSignedCents(metrics.deposits_total_cents - metrics.withdrawals_total_cents)} hint="Depósitos menos saques pagos" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <AdminCard title="Depósitos e saques nos últimos 14 dias">
                    <div className="p-5">
                        <DailyBars days={chart} series={MONEY_SERIES} format={formatCents} />
                    </div>
                </AdminCard>
                <AdminCard title="Novos clientes por dia">
                    <div className="p-5">
                        <DailyBars days={chart} series={[{ key: 'users', label: 'Novos clientes', color: '#7d8a9e' }]} format={(value) => value.toLocaleString('pt-BR')} />
                    </div>
                </AdminCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <AdminCard
                    title="Saques aguardando aprovação"
                    action={
                        <Link href="/admin/saques" className="text-xs font-semibold text-accent">
                            Ver todos
                        </Link>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <tbody>
                                {waitingWithdrawals.length === 0 && <EmptyRow colSpan={3}>Nenhum saque esperando. Tudo em dia.</EmptyRow>}
                                {waitingWithdrawals.map((withdrawal) => (
                                    <tr key={withdrawal.id}>
                                        <td>
                                            <Link href={`/admin/clientes/${withdrawal.user_id}`} className="font-semibold hover:text-accent">
                                                {withdrawal.user ?? `Cliente #${withdrawal.user_id}`}
                                            </Link>
                                            <div className="text-[11px] text-text-3">{formatDateTime(withdrawal.created_at)}</div>
                                        </td>
                                        <td data-align="right" className="numeric font-medium">
                                            {formatCents(withdrawal.amount_cents)}
                                        </td>
                                        <td data-align="right">
                                            <Link href="/admin/saques?status=requested" className="btn btn-primary btn-sm">
                                                Revisar
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AdminCard>

                <AdminCard
                    title="Últimos cadastros"
                    action={
                        <Link href="/admin/clientes" className="text-xs font-semibold text-accent">
                            Ver clientes
                        </Link>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <tbody>
                                {recentUsers.length === 0 && <EmptyRow colSpan={3}>Nenhum cliente ainda.</EmptyRow>}
                                {recentUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <Link href={`/admin/clientes/${user.id}`} className="font-semibold hover:text-accent">
                                                {user.name}
                                            </Link>
                                            <div className="text-[11px] text-text-3">{user.email}</div>
                                        </td>
                                        <td>{user.real ? <StatusBadge label="Conta real" tone="real" /> : <StatusBadge label="Só demo" />}</td>
                                        <td data-align="right" className="text-xs text-text-3">
                                            {formatDateTime(user.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AdminCard>
            </div>
        </AdminLayout>
    );
}
