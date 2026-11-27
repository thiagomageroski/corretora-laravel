import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { AdminCard, EmptyRow, FilterChips, Pagination, SearchBox, StatusBadge, useFilters } from '@/components/admin/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { auditLabel, type AdminAudit, type AdminPage } from '@/lib/admin';
import { formatDateTime } from '@/lib/format';

type Webhook = { id: number; event: string | null; entity_id: string | null; status: string; token_valid: boolean | null; error: string | null; ip_address: string | null; payload: Record<string, unknown>; received_at: string | null };

const GROUPS = [
    { value: null, label: 'Tudo' },
    { value: 'admin', label: 'Administradores' },
    { value: 'payments', label: 'Pagamentos' },
    { value: 'account', label: 'Contas' },
    { value: 'platform', label: 'Configurações' },
    { value: 'trading', label: 'Operações' },
    { value: 'user', label: 'Cadastros' },
    { value: 'wallet', label: 'Carteira demo' },
];

const WEBHOOK_STATUS: Record<string, 'up' | 'down' | 'neutral' | 'demo'> = { processed: 'up', rejected: 'down', failed: 'down', deferred: 'demo', ignored: 'neutral', received: 'neutral' };

/** The details worth showing from a log context, as short "key: value" pairs. */
function contextSummary(context: Record<string, unknown>): string[] {
    return Object.entries(context)
        .filter(([key]) => !['changes'].includes(key))
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .slice(0, 4);
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <tr>
                <td className="text-xs text-text-2">{formatDateTime(webhook.received_at)}</td>
                <td className="font-mono text-xs">{webhook.event ?? '—'}</td>
                <td>
                    <StatusBadge label={webhook.status} tone={WEBHOOK_STATUS[webhook.status] ?? 'neutral'} />
                    {webhook.error && <div className="mt-1 max-w-64 truncate text-[11px] text-down">{webhook.error}</div>}
                </td>
                <td className="text-xs">{webhook.token_valid === null ? <span className="text-text-3">—</span> : webhook.token_valid ? <span className="text-up">válido</span> : <span className="text-down">inválido</span>}</td>
                <td className="font-mono text-[11px] text-text-3">{webhook.entity_id ?? '—'}</td>
                <td data-align="right">
                    <button type="button" className="text-xs font-semibold text-accent" onClick={() => setOpen((current) => !current)}>
                        {open ? 'Ocultar' : 'Ver dados'}
                    </button>
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={6} className="!pt-0">
                        <pre className="thin-scroll max-h-72 overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-3 text-[11px] leading-relaxed text-text-2">{JSON.stringify(webhook.payload, null, 2)}</pre>
                    </td>
                </tr>
            )}
        </>
    );
}

export default function Audit({ tab, entries, filters }: { tab: 'registros' | 'webhooks'; entries: AdminPage<AdminAudit | Webhook>; filters: { q: string; grupo: string | null } }) {
    const update = useFilters('/admin/auditoria', { ...filters, aba: tab === 'webhooks' ? 'webhooks' : null });

    return (
        <AdminLayout title="Auditoria" description="Registro permanente do que aconteceu na plataforma: ações dos clientes, decisões dos administradores e cada aviso enviado pela AmploPay. Nada aqui pode ser editado ou apagado.">
            <FilterChips
                label="Tipo de registro"
                value={tab}
                options={[
                    { value: 'registros', label: 'Ações' },
                    { value: 'webhooks', label: 'Avisos da AmploPay' },
                ]}
                onChange={(value) => update({ aba: value === 'webhooks' ? 'webhooks' : null, grupo: null, q: '' })}
            />
            <AdminCard
                title={<span className="numeric">{entries.total.toLocaleString('pt-BR')} registro(s)</span>}
                action={<SearchBox value={filters.q} placeholder={tab === 'webhooks' ? 'Evento, transação ou situação' : 'Ação ou pessoa'} onSearch={(q) => update({ q })} />}
            >
                {tab === 'registros' && (
                    <div className="border-b border-ink-800 px-5 py-3">
                        <FilterChips label="Área" value={filters.grupo} options={GROUPS} onChange={(grupo) => update({ grupo })} />
                    </div>
                )}
                <div className="overflow-x-auto">
                    {tab === 'registros' ? (
                        <table className="data-table min-w-[880px]">
                            <thead>
                                <tr>
                                    <th>Quando</th>
                                    <th>O que aconteceu</th>
                                    <th>Quem</th>
                                    <th>Detalhes</th>
                                    <th>IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.data.length === 0 && <EmptyRow colSpan={5}>Nada registrado com esses filtros.</EmptyRow>}
                                {(entries.data as AdminAudit[]).map((log) => (
                                    <tr key={log.id}>
                                        <td className="text-xs whitespace-nowrap text-text-2">{formatDateTime(log.created_at)}</td>
                                        <td>
                                            <div className={log.action.startsWith('admin.') || log.action.startsWith('platform.') ? 'font-semibold text-accent' : ''}>{auditLabel(log.action)}</div>
                                            {log.subject && <div className="font-mono text-[11px] text-text-3">{log.subject}</div>}
                                        </td>
                                        <td className="text-xs">
                                            {log.actor_id ? (
                                                <Link href={`/admin/clientes/${log.actor_id}`} className="hover:text-accent">
                                                    {log.actor ?? `#${log.actor_id}`}
                                                </Link>
                                            ) : (
                                                <span className="text-text-3">automático</span>
                                            )}
                                        </td>
                                        <td className="max-w-80 text-[11px] text-text-3">
                                            {contextSummary(log.context).map((line) => (
                                                <div key={line} className="truncate">
                                                    {line}
                                                </div>
                                            ))}
                                        </td>
                                        <td className="numeric text-[11px] text-text-3">{log.ip_address ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="data-table min-w-[880px]">
                            <thead>
                                <tr>
                                    <th>Recebido</th>
                                    <th>Evento</th>
                                    <th>Processamento</th>
                                    <th>Token</th>
                                    <th>Transação</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {entries.data.length === 0 && <EmptyRow colSpan={6}>Nenhum aviso recebido ainda.</EmptyRow>}
                                {(entries.data as Webhook[]).map((webhook) => (
                                    <WebhookRow key={webhook.id} webhook={webhook} />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <Pagination page={entries} />
            </AdminCard>
        </AdminLayout>
    );
}
