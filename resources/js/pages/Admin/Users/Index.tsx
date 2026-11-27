import { Link } from '@inertiajs/react';
import { ShieldCheck } from 'lucide-react';
import { AdminCard, EmptyRow, FilterChips, Pagination, SearchBox, StatusBadge, useFilters } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { REAL_ACCOUNT_STATUS, USER_STATUS, type AdminPage, type AdminUserRow } from '@/lib/admin';
import { formatCents, formatDateTime } from '@/lib/format';

type Filter = 'real' | 'no_real' | 'frozen' | 'suspended' | 'closed' | 'admin' | 'deletion';

const FILTERS: { value: Filter | null; label: string }[] = [
    { value: null, label: 'Todos' },
    { value: 'real', label: 'Com conta real' },
    { value: 'no_real', label: 'Só demo' },
    { value: 'frozen', label: 'Conta real bloqueada' },
    { value: 'suspended', label: 'Suspensos' },
    { value: 'closed', label: 'Encerrados' },
    { value: 'deletion', label: 'Pediram exclusão' },
    { value: 'admin', label: 'Administradores' },
];

export default function UsersIndex({ users, filters }: { users: AdminPage<AdminUserRow>; filters: { q: string; filtro: Filter | null } }) {
    const update = useFilters('/admin/clientes', filters);

    return (
        <AdminLayout title="Clientes" description="Busque por nome, e-mail, telefone ou ID de perfil. Clique em um cliente para ver tudo sobre ele e tomar ações.">
            <AdminCard title={<span className="numeric">{users.total.toLocaleString('pt-BR')} cliente(s)</span>} action={<SearchBox value={filters.q} placeholder="Nome, e-mail, telefone ou ID" onSearch={(q) => update({ q })} />}>
                <div className="border-b border-ink-800 px-5 py-3">
                    <FilterChips label="Filtrar clientes" value={filters.filtro} options={FILTERS} onChange={(filtro) => update({ filtro })} />
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table min-w-[860px]">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Situação</th>
                                <th data-align="right">Saldo real</th>
                                <th data-align="right">Saldo demo</th>
                                <th>Telefone</th>
                                <th data-align="right">Cadastro</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.data.length === 0 && <EmptyRow colSpan={6}>Nenhum cliente encontrado com esses filtros.</EmptyRow>}
                            {users.data.map((user) => {
                                const status = USER_STATUS[user.status] ?? { label: user.status, tone: 'neutral' as const };

                                return (
                                    <tr key={user.id} className="transition-colors hover:bg-ink-850/60">
                                        <td>
                                            <Link href={`/admin/clientes/${user.id}`} className="flex items-center gap-1.5 font-semibold hover:text-accent">
                                                {user.name}
                                                {user.is_admin && <ShieldCheck size={14} className="text-accent" aria-label="Administrador" />}
                                            </Link>
                                            <div className="text-[11px] text-text-3">
                                                {user.email} · <span className="numeric">ID {user.profile_id}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap gap-1">
                                                <StatusBadge label={status.label} tone={status.tone} />
                                                {user.real ? <StatusBadge {...(REAL_ACCOUNT_STATUS[user.real.status] ?? { label: user.real.status, tone: 'neutral' })} /> : <StatusBadge label="Só demo" />}
                                            </div>
                                        </td>
                                        <td data-align="right" className="numeric">
                                            {user.real ? formatCents(user.real.available_cents + user.real.reserved_cents) : <span className="text-text-3">—</span>}
                                        </td>
                                        <td data-align="right" className="numeric text-text-2">
                                            {user.demo ? formatCents(user.demo.available_cents + user.demo.reserved_cents) : '—'}
                                        </td>
                                        <td className="numeric text-text-2">{user.phone ?? '—'}</td>
                                        <td data-align="right" className="text-xs text-text-3">
                                            {formatDateTime(user.created_at)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination page={users} />
            </AdminCard>
        </AdminLayout>
    );
}
