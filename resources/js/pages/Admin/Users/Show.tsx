import { Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, Ban, KeyRound, LogOut, RotateCcw, ShieldCheck, ShieldOff, Snowflake, Sun, UserCheck, Wallet } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ActionDialog, AdminCard, EmptyRow, StatusBadge, type PendingAction } from '@/components/admin/ui';
import { AssetIcon, EmailInput, FieldError, Segmented } from '@/components/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { auditLabel, DEPOSIT_STATUS, REAL_ACCOUNT_STATUS, USER_STATUS, WITHDRAWAL_STATUS, type AdminAudit, type AdminBalance, type AdminDeposit, type AdminPosition, type AdminUserRow, type AdminWithdrawal } from '@/lib/admin';
import { newIdempotencyKey } from '@/lib/api';
import { ENTRY_LABELS, formatCents, formatDateTime, formatPrice, formatSignedCents, RESULT_LABELS } from '@/lib/format';
import { formatPhone } from '@/lib/phone';

type User = AdminUserRow & {
    birth_date: string | null;
    cpf: string | null;
    two_factor: boolean;
    closed_at: string | null;
    deletion_requested_at: string | null;
    real_terms_accepted_at: string | null;
};

type Props = {
    user: User;
    wallets: (AdminBalance & { environment: 'real' | 'demo'; status: string })[];
    stats: { positions: number; positions_real: number; won: number; lost: number; real_volume_cents: number; real_result_cents: number; deposited_cents: number; withdrawn_cents: number };
    deposits: AdminDeposit[];
    withdrawals: AdminWithdrawal[];
    positions: AdminPosition[];
    ledger: { id: number; environment: 'real' | 'demo'; type: string; available_delta_cents: number; available_after_cents: number; reason: string | null; created_at: string | null }[];
    logins: { id: number; event: string; ip_address: string | null; device: string; created_at: string | null }[];
    pixKeys: { id: number; type: string; masked: string; label: string | null }[];
    audit: AdminAudit[];
    sessions: number;
};

type Tab = 'ledger' | 'deposits' | 'withdrawals' | 'positions' | 'logins' | 'pix' | 'audit';

const LOGIN_EVENTS: Record<string, string> = { login: 'Entrou', logout: 'Saiu', failed: 'Tentativa falhou' };

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">{label}</dt>
            <dd className="mt-0.5 truncate text-[13px]">{children}</dd>
        </div>
    );
}

function ActionButton({ icon, label, hint, onClick, tone }: { icon: ReactNode; label: string; hint: string; onClick: () => void; tone?: 'danger' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-start gap-3 rounded-xl border border-ink-800 bg-ink-950/60 p-3 text-left transition-colors hover:border-ink-600 ${tone === 'danger' ? 'hover:bg-down-soft/40' : 'hover:bg-ink-850'}`}
        >
            <span className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-down' : 'text-accent'}`}>{icon}</span>
            <span>
                <span className="block text-[13px] font-semibold">{label}</span>
                <span className="block text-xs leading-snug text-text-3">{hint}</span>
            </span>
        </button>
    );
}

function parseCents(value: string): number {
    const cents = Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100);

    return Number.isFinite(cents) ? cents : 0;
}

function BalanceAdjustment({ user, wallets }: { user: User; wallets: Props['wallets'] }) {
    const [environment, setEnvironment] = useState<'real' | 'demo'>(wallets.some((wallet) => wallet.environment === 'real') ? 'real' : 'demo');
    const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const cents = parseCents(amount);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        setSending(true);
        router.post(
            `/admin/clientes/${user.id}/saldo`,
            { environment, direction, amount_cents: cents, reason, idempotency_key: newIdempotencyKey() },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setAmount('');
                    setReason('');
                    setErrors({});
                },
                onError: (received) => setErrors(received),
                onFinish: () => setSending(false),
            },
        );
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
                <Segmented label="Conta" stretch value={environment} onChange={setEnvironment} options={wallets.map((wallet) => ({ value: wallet.environment, label: wallet.environment === 'real' ? 'Real' : 'Demo' }))} />
                <Segmented
                    label="Tipo"
                    stretch
                    value={direction}
                    onChange={setDirection}
                    options={[
                        { value: 'credit', label: 'Crédito' },
                        { value: 'debit', label: 'Débito' },
                    ]}
                />
            </div>
            <div>
                <label className="label" htmlFor="adjust-amount">
                    Valor
                </label>
                <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-text-3">R$</span>
                    <input id="adjust-amount" className="field numeric !pl-9" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </div>
                <FieldError message={errors.amount_cents} />
            </div>
            <div>
                <label className="label" htmlFor="adjust-reason">
                    Motivo (aparece no extrato e na auditoria)
                </label>
                <input id="adjust-reason" className="field mt-1.5" maxLength={200} placeholder="Ex.: bônus de boas-vindas" value={reason} onChange={(event) => setReason(event.target.value)} />
                <FieldError message={errors.reason} />
            </div>
            <button type="submit" className={`btn btn-sm ${direction === 'debit' ? 'btn-danger' : 'btn-primary'}`} disabled={sending || cents <= 0 || reason.trim().length < 5}>
                {sending ? 'Lançando…' : `${direction === 'credit' ? 'Creditar' : 'Debitar'} ${cents > 0 ? formatCents(cents) : ''} na conta ${environment}`}
            </button>
        </form>
    );
}

function ProfileForm({ user }: { user: User }) {
    const form = useForm({ first_name: user.first_name, last_name: user.last_name, email: user.email, phone: formatPhone(user.phone ?? '') });

    return (
        <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
                event.preventDefault();
                form.put(`/admin/clientes/${user.id}`, { preserveScroll: true });
            }}
        >
            <div>
                <label className="label" htmlFor="edit-first">
                    Nome
                </label>
                <input id="edit-first" className="field mt-1.5" value={form.data.first_name} onChange={(event) => form.setData('first_name', event.target.value)} />
                <FieldError message={form.errors.first_name} />
            </div>
            <div>
                <label className="label" htmlFor="edit-last">
                    Sobrenome
                </label>
                <input id="edit-last" className="field mt-1.5" value={form.data.last_name} onChange={(event) => form.setData('last_name', event.target.value)} />
                <FieldError message={form.errors.last_name} />
            </div>
            <div>
                <label className="label" htmlFor="edit-email">
                    E-mail
                </label>
                <EmailInput id="edit-email" className="mt-1.5" value={form.data.email} onChange={(email) => form.setData('email', email)} error={form.errors.email} />
            </div>
            <div>
                <label className="label" htmlFor="edit-phone">
                    Celular
                </label>
                <input id="edit-phone" className="field mt-1.5" type="tel" maxLength={15} value={form.data.phone} onChange={(event) => form.setData('phone', formatPhone(event.target.value))} />
                <FieldError message={form.errors.phone} />
            </div>
            <div className="sm:col-span-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={form.processing || !form.isDirty}>
                    {form.processing ? 'Salvando…' : 'Salvar dados'}
                </button>
            </div>
        </form>
    );
}

export default function UserShow(props: Props) {
    const { user, wallets, stats, sessions } = props;
    const [tab, setTab] = useState<Tab>('ledger');
    const [pending, setPending] = useState<PendingAction | null>(null);
    const real = wallets.find((wallet) => wallet.environment === 'real');
    const status = USER_STATUS[user.status] ?? { label: user.status, tone: 'neutral' as const };
    const base = `/admin/clientes/${user.id}`;
    const decided = stats.won + stats.lost;

    const tabs: { value: Tab; label: string; count: number }[] = [
        { value: 'ledger', label: 'Extrato', count: props.ledger.length },
        { value: 'deposits', label: 'Depósitos', count: props.deposits.length },
        { value: 'withdrawals', label: 'Saques', count: props.withdrawals.length },
        { value: 'positions', label: 'Operações', count: props.positions.length },
        { value: 'logins', label: 'Acessos', count: props.logins.length },
        { value: 'pix', label: 'Chaves PIX', count: props.pixKeys.length },
        { value: 'audit', label: 'Auditoria', count: props.audit.length },
    ];

    return (
        <AdminLayout
            title={user.name}
            description={`${user.email} · ID de perfil ${user.profile_id} · cliente desde ${formatDateTime(user.created_at)}`}
            actions={
                <Link href="/admin/clientes" className="btn btn-ghost btn-sm">
                    <ArrowLeft size={15} aria-hidden="true" />
                    Clientes
                </Link>
            }
        >
            <div className="flex flex-wrap gap-1.5">
                <StatusBadge label={status.label} tone={status.tone} />
                {real ? <StatusBadge {...(REAL_ACCOUNT_STATUS[real.status] ?? { label: real.status, tone: 'neutral' })} /> : <StatusBadge label="Sem conta real" />}
                {user.is_admin && <StatusBadge label="Administrador" tone="accent" />}
                {user.two_factor && <StatusBadge label="2 etapas ativa" tone="up" />}
                {user.deletion_requested_at && <StatusBadge label={`Pediu exclusão em ${formatDateTime(user.deletion_requested_at)}`} tone="down" />}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {wallets.map((wallet) => (
                            <div key={wallet.environment} className={`panel p-4 ${wallet.environment === 'real' ? 'border-real/30' : ''}`}>
                                <div className={`text-[11px] font-semibold tracking-wide uppercase ${wallet.environment === 'real' ? 'text-real' : 'text-demo'}`}>Saldo {wallet.environment}</div>
                                <div className="numeric mt-1.5 text-[22px] leading-tight font-medium">{formatCents(wallet.available_cents)}</div>
                                <div className="mt-1 text-xs text-text-3">{formatCents(wallet.reserved_cents)} em operações abertas</div>
                            </div>
                        ))}
                        <div className="panel p-4">
                            <div className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">Movimentação real</div>
                            <dl className="mt-1.5 flex flex-col gap-0.5 text-[13px]">
                                <div className="flex justify-between gap-2">
                                    <dt className="text-text-3">Depositou</dt>
                                    <dd className="numeric font-medium text-up">{formatCents(stats.deposited_cents)}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-text-3">Sacou</dt>
                                    <dd className="numeric font-medium">{formatCents(stats.withdrawn_cents)}</dd>
                                </div>
                            </dl>
                        </div>
                        <div className="panel p-4">
                            <div className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">Operações</div>
                            <div className="numeric mt-1.5 text-[22px] leading-tight font-medium">{stats.positions}</div>
                            <div className="mt-1 text-xs text-text-3">
                                {decided > 0 ? `${Math.round((stats.won / decided) * 100)}% de acerto` : 'Sem resultado'} · {stats.positions_real} na real
                            </div>
                        </div>
                    </div>

                    {real && (
                        <div className="panel grid gap-3 p-4 sm:grid-cols-2">
                            <Fact label="Volume em conta real">{formatCents(stats.real_volume_cents)}</Fact>
                            <Fact label="Resultado do cliente na real">
                                <span className={`numeric ${stats.real_result_cents >= 0 ? 'text-up' : 'text-down'}`}>{formatSignedCents(stats.real_result_cents)}</span>
                            </Fact>
                        </div>
                    )}

                    <AdminCard title="Dados do cliente">
                        <div className="flex flex-col gap-5 p-5">
                            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <Fact label="CPF">{user.cpf ?? '—'}</Fact>
                                <Fact label="Nascimento">{user.birth_date ? new Date(`${user.birth_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</Fact>
                                <Fact label="Termos da conta real">{user.real_terms_accepted_at ? formatDateTime(user.real_terms_accepted_at) : '—'}</Fact>
                                <Fact label="Sessões abertas">{sessions}</Fact>
                            </dl>
                            <div className="hairline" />
                            <ProfileForm user={user} />
                        </div>
                    </AdminCard>

                    <AdminCard>
                        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-800 px-4 py-2.5" role="tablist" aria-label="Histórico do cliente">
                            {tabs.map((item) => (
                                <button key={item.value} type="button" role="tab" className="chip h-8 shrink-0" aria-selected={tab === item.value} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
                                    {item.label}
                                    <span className="numeric rounded bg-ink-800 px-1 text-[10px] text-text-3">{item.count}</span>
                                </button>
                            ))}
                        </div>
                        <div className="overflow-x-auto">
                            {tab === 'ledger' && (
                                <table className="data-table min-w-[680px]">
                                    <thead>
                                        <tr>
                                            <th>Quando</th>
                                            <th>Conta</th>
                                            <th>Lançamento</th>
                                            <th data-align="right">Valor</th>
                                            <th data-align="right">Saldo após</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {props.ledger.length === 0 && <EmptyRow colSpan={5}>Sem lançamentos.</EmptyRow>}
                                        {props.ledger.map((entry) => (
                                            <tr key={entry.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(entry.created_at)}</td>
                                                <td>
                                                    <StatusBadge label={entry.environment} tone={entry.environment === 'real' ? 'real' : 'demo'} />
                                                </td>
                                                <td>
                                                    {ENTRY_LABELS[entry.type] ?? entry.type}
                                                    {entry.reason && <div className="text-[11px] text-text-3">{entry.reason}</div>}
                                                </td>
                                                <td data-align="right" className={`numeric ${entry.available_delta_cents > 0 ? 'text-up' : entry.available_delta_cents < 0 ? 'text-down' : ''}`}>
                                                    {formatSignedCents(entry.available_delta_cents)}
                                                </td>
                                                <td data-align="right" className="numeric text-text-2">
                                                    {formatCents(entry.available_after_cents)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'deposits' && (
                                <table className="data-table min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th>Criado</th>
                                            <th>Situação</th>
                                            <th data-align="right">Valor</th>
                                            <th>Código</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {props.deposits.length === 0 && <EmptyRow colSpan={4}>Nenhum depósito.</EmptyRow>}
                                        {props.deposits.map((deposit) => (
                                            <tr key={deposit.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(deposit.created_at)}</td>
                                                <td>
                                                    <StatusBadge {...(DEPOSIT_STATUS[deposit.status] ?? { label: deposit.status, tone: 'neutral' })} />
                                                </td>
                                                <td data-align="right" className="numeric">
                                                    {formatCents(deposit.amount_cents)}
                                                </td>
                                                <td className="font-mono text-[11px] text-text-3">{deposit.id}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'withdrawals' && (
                                <table className="data-table min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th>Pedido</th>
                                            <th>Situação</th>
                                            <th data-align="right">Valor</th>
                                            <th>Chave</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {props.withdrawals.length === 0 && <EmptyRow colSpan={4}>Nenhum saque.</EmptyRow>}
                                        {props.withdrawals.map((withdrawal) => (
                                            <tr key={withdrawal.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(withdrawal.created_at)}</td>
                                                <td>
                                                    <StatusBadge {...(WITHDRAWAL_STATUS[withdrawal.status] ?? { label: withdrawal.status, tone: 'neutral' })} />
                                                </td>
                                                <td data-align="right" className="numeric">
                                                    {formatCents(withdrawal.amount_cents)}
                                                </td>
                                                <td className="text-xs text-text-2">
                                                    {withdrawal.pix_key_type}: {withdrawal.pix_key}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'positions' && (
                                <table className="data-table min-w-[760px]">
                                    <thead>
                                        <tr>
                                            <th>Aberta</th>
                                            <th>Ativo</th>
                                            <th>Conta</th>
                                            <th>Direção</th>
                                            <th data-align="right">Valor</th>
                                            <th data-align="right">Entrada → saída</th>
                                            <th data-align="right">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {props.positions.length === 0 && <EmptyRow colSpan={7}>Nenhuma operação.</EmptyRow>}
                                        {props.positions.map((position) => (
                                            <tr key={position.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(position.opened_at)}</td>
                                                <td className="font-semibold">
                                                    <span className="flex items-center gap-2">
                                                        <AssetIcon symbol={position.symbol} size={20} />
                                                        {position.symbol}
                                                    </span>
                                                </td>
                                                <td>
                                                    <StatusBadge label={position.environment} tone={position.environment === 'real' ? 'real' : 'demo'} />
                                                </td>
                                                <td className={position.direction === 'call' ? 'font-bold text-up' : 'font-bold text-down'}>{position.direction.toUpperCase()}</td>
                                                <td data-align="right" className="numeric">
                                                    {formatCents(position.stake_cents)}
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
                                                        <StatusBadge label="Aberta" tone="accent" />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'logins' && (
                                <table className="data-table min-w-[560px]">
                                    <tbody>
                                        {props.logins.length === 0 && <EmptyRow colSpan={4}>Nenhum acesso registrado.</EmptyRow>}
                                        {props.logins.map((event) => (
                                            <tr key={event.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(event.created_at)}</td>
                                                <td className={event.event === 'failed' ? 'text-down' : ''}>{LOGIN_EVENTS[event.event] ?? event.event}</td>
                                                <td className="text-xs text-text-2">{event.device}</td>
                                                <td className="numeric text-xs text-text-3">{event.ip_address}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'pix' && (
                                <table className="data-table">
                                    <tbody>
                                        {props.pixKeys.length === 0 && <EmptyRow colSpan={3}>Nenhuma chave salva.</EmptyRow>}
                                        {props.pixKeys.map((key) => (
                                            <tr key={key.id}>
                                                <td className="uppercase">{key.type}</td>
                                                <td className="numeric">{key.masked}</td>
                                                <td className="text-text-3">{key.label}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {tab === 'audit' && (
                                <table className="data-table min-w-[560px]">
                                    <tbody>
                                        {props.audit.length === 0 && <EmptyRow colSpan={3}>Nada registrado.</EmptyRow>}
                                        {props.audit.map((log) => (
                                            <tr key={log.id}>
                                                <td className="text-xs text-text-2">{formatDateTime(log.created_at)}</td>
                                                <td>
                                                    {auditLabel(log.action)}
                                                    {typeof log.context.reason === 'string' && <div className="text-[11px] text-text-3">{log.context.reason}</div>}
                                                    {typeof log.context.note === 'string' && <div className="text-[11px] text-text-3">{log.context.note}</div>}
                                                </td>
                                                <td className="text-xs text-text-3">{log.actor_id === user.id ? 'pelo cliente' : log.actor ? `por ${log.actor}` : 'automático'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </AdminCard>
                </div>

                <div className="flex flex-col gap-4">
                    <AdminCard
                        title={
                            <span className="flex items-center gap-2">
                                <Wallet size={16} className="text-accent" aria-hidden="true" />
                                Ajustar saldo
                            </span>
                        }
                    >
                        <div className="p-4">
                            <BalanceAdjustment user={user} wallets={wallets} />
                            <p className="mt-3 text-[11px] leading-relaxed text-text-3">O saldo nunca é editado: o ajuste vira um lançamento no extrato, com seu nome e o motivo.</p>
                        </div>
                    </AdminCard>

                    <AdminCard title="Ações">
                        <div className="flex flex-col gap-2 p-4">
                            {real &&
                                (real.status === 'frozen' ? (
                                    <ActionButton
                                        icon={<Sun size={17} />}
                                        label="Desbloquear conta real"
                                        hint="Libera de novo depósitos, saques e operações reais."
                                        onClick={() => setPending({ url: `${base}/conta-real`, title: 'Desbloquear conta real', confirmLabel: 'Desbloquear', noteField: 'reason', data: { status: 'active' } })}
                                    />
                                ) : (
                                    <ActionButton
                                        icon={<Snowflake size={17} />}
                                        label="Bloquear conta real"
                                        hint="Suspende depósitos, saques e operações reais. O saldo fica guardado."
                                        tone="danger"
                                        onClick={() => setPending({ url: `${base}/conta-real`, title: 'Bloquear conta real', confirmLabel: 'Bloquear', tone: 'danger', noteField: 'reason', data: { status: 'frozen' } })}
                                    />
                                ))}
                            {user.status === 'active' ? (
                                <ActionButton
                                    icon={<Ban size={17} />}
                                    label="Suspender acesso"
                                    hint="Desconecta o cliente e impede novas entradas."
                                    tone="danger"
                                    onClick={() =>
                                        setPending({
                                            url: `${base}/acesso`,
                                            title: 'Suspender acesso',
                                            description: 'O cliente é desconectado de todos os aparelhos e não consegue entrar até ser reativado. Saldo e histórico ficam intactos.',
                                            confirmLabel: 'Suspender',
                                            tone: 'danger',
                                            noteField: 'reason',
                                            data: { status: 'suspended' },
                                        })
                                    }
                                />
                            ) : (
                                <ActionButton
                                    icon={<UserCheck size={17} />}
                                    label="Reativar acesso"
                                    hint="Permite que o cliente volte a entrar."
                                    onClick={() => setPending({ url: `${base}/acesso`, title: 'Reativar acesso', confirmLabel: 'Reativar', noteField: 'reason', data: { status: 'active' } })}
                                />
                            )}
                            <ActionButton
                                icon={<RotateCcw size={17} />}
                                label="Reiniciar saldo demo"
                                hint="Volta o saldo virtual ao valor inicial."
                                onClick={() =>
                                    setPending({ url: `${base}/demo/reiniciar`, title: 'Reiniciar saldo demo', description: 'O saldo da conta demo volta ao valor inicial configurado. Não afeta a conta real.', confirmLabel: 'Reiniciar' })
                                }
                            />
                            <ActionButton
                                icon={<LogOut size={17} />}
                                label={`Encerrar sessões (${sessions})`}
                                hint="Desconecta o cliente de todos os aparelhos."
                                onClick={() => setPending({ url: `${base}/sessoes/encerrar`, title: 'Encerrar sessões', description: 'O cliente precisará entrar de novo em todos os aparelhos.', confirmLabel: 'Encerrar sessões' })}
                            />
                            {user.is_admin ? (
                                <ActionButton
                                    icon={<ShieldOff size={17} />}
                                    label="Remover administrador"
                                    hint="Tira o acesso a este painel."
                                    tone="danger"
                                    onClick={() => setPending({ url: `${base}/admin`, title: 'Remover administrador', confirmLabel: 'Remover acesso', tone: 'danger', data: { is_admin: false } })}
                                />
                            ) : (
                                <ActionButton
                                    icon={<ShieldCheck size={17} />}
                                    label="Tornar administrador"
                                    hint="Dá acesso completo a este painel."
                                    onClick={() =>
                                        setPending({
                                            url: `${base}/admin`,
                                            title: 'Tornar administrador',
                                            description: 'Esta pessoa poderá ver todos os clientes, aprovar saques e ajustar saldos. Conceda só a quem é de confiança.',
                                            confirmLabel: 'Conceder acesso',
                                            data: { is_admin: true },
                                        })
                                    }
                                />
                            )}
                        </div>
                    </AdminCard>

                    <div className="flex items-start gap-2 rounded-xl border border-ink-800 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-text-3">
                        <KeyRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" />O CPF e as chaves PIX ficam criptografados no banco. Aqui aparecem mascarados para proteger o cliente.
                    </div>
                </div>
            </div>

            <ActionDialog action={pending} onClose={() => setPending(null)} />
        </AdminLayout>
    );
}
