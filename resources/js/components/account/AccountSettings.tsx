import { router, usePage } from '@inertiajs/react';
import { Bell, BellRing, ChevronLeft, ChevronRight, CircleUserRound, CreditCard, FlaskConical, Laptop, LogIn, LogOut, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { EmailInput, EmptyState, Modal, Money, Segmented, SettingsGroup, Switch, TextField } from '@/components/ui';
import { ApiError, api, request } from '@/lib/api';
import { formatCents, formatDateTime, formatDuration } from '@/lib/format';
import type { AccountOverview, SharedProps, WalletSummary } from '@/lib/types';
import { AccountActionsTab, ChartDisplayGroup, IdentityCard, InterfaceGroup, NotificationsTab, PaymentMethodsTab, ShortcutsGroup, StatementCard } from '@/components/account/AccountSections';
import { useAccountPanel, type AccountTab } from '@/stores/accountPanel';
import { usePreferences } from '@/stores/preferences';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';
import { formatPhone } from '@/lib/phone';

export const ACCOUNT_TABS: {
    value: AccountTab;
    label: string;
    icon: ReactNode;
}[] = [
    {
        value: 'profile',
        label: 'Dados pessoais',
        icon: <CircleUserRound size={16} aria-hidden="true" />,
    },
    {
        value: 'notifications',
        label: 'Notificações',
        icon: <BellRing size={16} aria-hidden="true" />,
    },
    {
        value: 'preferences',
        label: 'Negociação e aparência',
        icon: <SlidersHorizontal size={16} aria-hidden="true" />,
    },
    {
        value: 'payments',
        label: 'Métodos de pagamento',
        icon: <CreditCard size={16} aria-hidden="true" />,
    },
    {
        value: 'security',
        label: 'Proteção e segurança',
        icon: <ShieldCheck size={16} aria-hidden="true" />,
    },
    {
        value: 'account',
        label: 'Definições da conta',
        icon: <Settings2 size={16} aria-hidden="true" />,
    },
    {
        value: 'demo',
        label: 'Conta demo',
        icon: <FlaskConical size={16} aria-hidden="true" />,
    },
];

const TYPE_LABELS: Record<string, string> = {
    area: 'Área',
    line: 'Linha',
    candles: 'Velas',
    bars: 'Barras',
};
const INTERVAL_LABELS: Record<string, string> = {
    '1s': '1s',
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1D',
};
const INDICATOR_LABELS: Record<string, string> = {
    sma: 'MM 20',
    ema: 'MME 50',
    bb: 'Bollinger',
    volume: 'Volume',
    rsi: 'RSI',
    macd: 'MACD',
    stoch: 'Estocástico',
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

function ProfileTab({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const [form, setForm] = useState({
        first_name: account.profile.first_name,
        last_name: account.profile.last_name,
        email: account.profile.email,
        phone: formatPhone(account.profile.phone ?? ''),
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});

        try {
            await request('/user/profile-information', {
                method: 'PUT',
                body: form,
            });
            push({ tone: 'up', title: 'Perfil atualizado' });
            onChanged();
            router.reload({ only: ['auth'] });
        } catch (error) {
            if (error instanceof ApiError) setErrors(error.errors);
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível salvar o perfil.'),
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsGroup title="Dados pessoais" description={account.profile.member_since ? `Conta criada em ${formatDateTime(account.profile.member_since)}.` : undefined}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="account-first-name" label="Nome" autoComplete="given-name" value={form.first_name} error={errors.first_name?.[0]} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
                    <TextField id="account-last-name" label="Sobrenome" autoComplete="family-name" value={form.last_name} error={errors.last_name?.[0]} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
                </div>
                <div>
                    <label className="label" htmlFor="account-email">
                        E-mail
                    </label>
                    <EmailInput id="account-email" className="mt-1.5" autoComplete="email" value={form.email} error={errors.email?.[0]} onChange={(email) => setForm({ ...form, email })} />
                </div>
                <TextField
                    id="account-phone"
                    label={account.profile.real_account ? 'Celular' : 'Celular (opcional)'}
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    error={errors.phone?.[0]}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                    onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })}
                />
                <div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                </div>
            </form>
        </SettingsGroup>
    );
}

function PreferencesTab({ account }: { account: AccountOverview }) {
    const preferences = usePreferences((state) => state.preferences);
    const save = usePreferences((state) => state.save);
    const setChart = usePreferences((state) => state.setChart);
    const push = useToasts((state) => state.push);
    const [stake, setStake] = useState((preferences.default_stake_cents / 100).toString());
    const [stakeError, setStakeError] = useState<string>();
    const { options } = account;

    const timezones = useMemo(() => {
        try {
            return Intl.supportedValuesOf('timeZone');
        } catch {
            return ['America/Sao_Paulo', 'UTC'];
        }
    }, []);

    const update = (changes: Parameters<typeof save>[0]) => {
        save(changes).catch((error) =>
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível salvar a preferência.'),
            }),
        );
    };

    const saveStake = () => {
        const cents = Math.round(Number(stake.replace(',', '.')) * 100);

        if (!Number.isFinite(cents) || cents < options.min_stake_cents || cents > options.max_stake_cents) {
            setStakeError(`Informe um valor entre ${formatCents(options.min_stake_cents)} e ${formatCents(options.max_stake_cents)}.`);

            return;
        }

        setStakeError(undefined);

        if (cents !== preferences.default_stake_cents) {
            update({ default_stake_cents: cents });
        }
    };

    const toggleIndicator = (indicator: string) => {
        const current = preferences.chart_indicators;
        const next = current.includes(indicator) ? current.filter((item) => item !== indicator) : [...current, indicator];
        update({ chart_indicators: next });
        setChart({ indicators: next });
    };

    return (
        <div className="flex flex-col gap-4">
            <SettingsGroup title="Gráfico" description="Como o gráfico abre. As mudanças valem na hora e ficam salvas na sua conta.">
                <div className="flex flex-col gap-4">
                    <div>
                        <span className="label">Período padrão</span>
                        <div className="no-scrollbar mt-1.5 overflow-x-auto">
                            <Segmented
                                label="Período padrão"
                                value={preferences.chart_interval}
                                options={options.chart_intervals.map((value) => ({
                                    value,
                                    label: INTERVAL_LABELS[value] ?? value,
                                }))}
                                onChange={(value) => {
                                    update({ chart_interval: value });
                                    setChart({ interval: value });
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="label">Tipo padrão</span>
                        <div className="mt-1.5">
                            <Segmented
                                label="Tipo padrão"
                                value={preferences.chart_type}
                                options={options.chart_types.map((value) => ({
                                    value: value as typeof preferences.chart_type,
                                    label: TYPE_LABELS[value] ?? value,
                                }))}
                                onChange={(value) => {
                                    update({ chart_type: value });
                                    setChart({ type: value });
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="label">Indicadores ao abrir</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Indicadores ao abrir">
                            {options.indicators.map((indicator) => (
                                <button key={indicator} type="button" className="chip border border-ink-700" aria-pressed={preferences.chart_indicators.includes(indicator)} onClick={() => toggleIndicator(indicator)}>
                                    {INDICATOR_LABELS[indicator] ?? indicator}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-2 divide-y divide-ink-800">
                    <Switch
                        label="Animações em tempo real"
                        description="Movimento suave do preço e do eixo do tempo. Desligue em computadores mais lentos. Os preços são os mesmos."
                        checked={preferences.chart_animations}
                        onChange={(chart_animations) => update({ chart_animations })}
                    />
                </div>
            </SettingsGroup>

            <SettingsGroup title="Operações" description="Valores usados ao abrir a tela Negociar. O servidor continua validando cada operação.">
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="default-stake" label="Valor padrão (R$)" inputMode="decimal" className="numeric" value={stake} error={stakeError} onChange={(event) => setStake(event.target.value)} onBlur={saveStake} />
                    <div>
                        <span className="label">Prazo padrão</span>
                        <div className="mt-1.5">
                            <select
                                className="field"
                                aria-label="Prazo padrão"
                                value={preferences.default_duration_seconds}
                                onChange={(event) =>
                                    update({
                                        default_duration_seconds: Number(event.target.value),
                                    })
                                }
                            >
                                {options.durations_seconds.map((seconds) => (
                                    <option key={seconds} value={seconds}>
                                        {formatDuration(seconds)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="mt-2 divide-y divide-ink-800">
                    <Switch
                        label="Confirmar antes de operar"
                        description="Mostra um resumo com valor e prazo antes de enviar a operação."
                        checked={preferences.confirm_before_trade}
                        onChange={(confirm_before_trade) => update({ confirm_before_trade })}
                    />
                </div>
            </SettingsGroup>

            <ChartDisplayGroup />
            <InterfaceGroup scales={options.interface_scales} />
            <ShortcutsGroup />

            <SettingsGroup title="Exibição">
                <div className="divide-y divide-ink-800">
                    <Switch label="Ocultar saldo" description="Esconde os valores da carteira na tela, para usar em público ou em apresentações." checked={preferences.hide_balance} onChange={(hide_balance) => update({ hide_balance })} />
                </div>
                <div className="mt-3">
                    <label className="label" htmlFor="timezone">
                        Fuso horário
                    </label>
                    <select id="timezone" className="field mt-1.5" value={preferences.timezone} onChange={(event) => update({ timezone: event.target.value })}>
                        <option value="auto">Automático (deste dispositivo)</option>
                        {timezones.map((zone) => (
                            <option key={zone} value={zone}>
                                {zone.replaceAll('_', ' ')}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1.5 text-xs text-text-3">Vale para os horários do site e do gráfico. Gráficos já abertos atualizam ao recarregar.</p>
                </div>
            </SettingsGroup>
        </div>
    );
}

function PasswordForm() {
    const push = useToasts((state) => state.push);
    const [form, setForm] = useState({
        current_password: '',
        password: '',
        password_confirmation: '',
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});

        try {
            await request('/user/password', { method: 'PUT', body: form });
            setForm({
                current_password: '',
                password: '',
                password_confirmation: '',
            });
            push({ tone: 'up', title: 'Senha alterada' });
        } catch (error) {
            if (error instanceof ApiError) setErrors(error.errors);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsGroup title="Alterar senha">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <TextField
                    id="current-password"
                    label="Senha atual"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={form.current_password}
                    error={errors.current_password?.[0]}
                    onChange={(event) =>
                        setForm({
                            ...form,
                            current_password: event.target.value,
                        })
                    }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                        id="new-password"
                        label="Nova senha"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={form.password}
                        error={errors.password?.[0]}
                        onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                    <TextField
                        id="new-password-confirmation"
                        label="Confirme a nova senha"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={form.password_confirmation}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                password_confirmation: event.target.value,
                            })
                        }
                    />
                </div>
                <div>
                    <button type="submit" className="btn btn-ghost" disabled={saving}>
                        {saving ? 'Alterando…' : 'Alterar senha'}
                    </button>
                </div>
            </form>
        </SettingsGroup>
    );
}

function TwoFactorPanel({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const { enabled, confirmed } = account.two_factor;
    const [password, setPassword] = useState('');
    const [needsPassword, setNeedsPassword] = useState<'enable' | 'disable' | 'codes' | null>(null);
    const [passwordError, setPasswordError] = useState<string>();
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string>();
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);

    const loadQrCode = useCallback(async () => {
        const response = await request<{ svg: string }>('/user/two-factor-qr-code');
        setQrCode(response.svg);
    }, []);

    useEffect(() => {
        if (enabled && !confirmed && qrCode === null) {
            loadQrCode().catch(() => setNeedsPassword('enable'));
        }
    }, [enabled, confirmed, qrCode, loadQrCode]);

    const run = async (action: 'enable' | 'disable' | 'codes') => {
        setBusy(true);

        try {
            if (action === 'enable') {
                await request('/user/two-factor-authentication', {
                    method: 'POST',
                });
                await loadQrCode();
                onChanged();
            } else if (action === 'disable') {
                await request('/user/two-factor-authentication', {
                    method: 'DELETE',
                });
                setQrCode(null);
                setRecoveryCodes(null);
                push({
                    tone: 'info',
                    title: 'Verificação em duas etapas desativada',
                });
                onChanged();
            } else {
                setRecoveryCodes(await request<string[]>('/user/two-factor-recovery-codes'));
            }
        } catch (error) {
            if (error instanceof ApiError && error.status === 423) {
                setNeedsPassword(action);
            } else {
                push({
                    tone: 'down',
                    title: errorMessage(error, 'Não foi possível concluir.'),
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const confirmPassword = async (event: FormEvent) => {
        event.preventDefault();
        setPasswordError(undefined);

        try {
            await request('/user/confirm-password', {
                method: 'POST',
                body: { password },
            });
            const action = needsPassword;
            setNeedsPassword(null);
            setPassword('');

            if (action) await run(action);
        } catch (error) {
            setPasswordError(error instanceof ApiError ? (error.firstError('password') ?? error.message) : 'Não foi possível confirmar a senha.');
        }
    };

    const confirmCode = async (event: FormEvent) => {
        event.preventDefault();
        setCodeError(undefined);

        try {
            await request('/user/confirmed-two-factor-authentication', {
                method: 'POST',
                body: { code },
            });
            setCode('');
            setQrCode(null);
            push({ tone: 'up', title: 'Verificação em duas etapas ativada' });
            setRecoveryCodes(await request<string[]>('/user/two-factor-recovery-codes'));
            onChanged();
        } catch (error) {
            setCodeError(error instanceof ApiError ? (error.firstError('code') ?? error.message) : 'Código inválido.');
        }
    };

    return (
        <SettingsGroup title="Verificação em duas etapas" description="Pede um código do seu aplicativo autenticador a cada login.">
            <div className="flex items-center gap-2 text-[13px]">
                {confirmed ? <ShieldCheck size={16} className="text-up" aria-hidden="true" /> : <ShieldAlert size={16} className="text-demo" aria-hidden="true" />}
                <span className="font-medium">{confirmed ? 'Ativada' : enabled ? 'Aguardando confirmação' : 'Desativada'}</span>
            </div>

            {enabled && !confirmed && qrCode && (
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                    {/* The SVG comes from our own server, which generates it from the user's secret. */}
                    <div className="w-fit shrink-0 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qrCode }} aria-label="QR Code para o aplicativo autenticador" role="img" />
                    <form onSubmit={confirmCode} className="flex min-w-0 flex-1 flex-col gap-3">
                        <p className="text-xs leading-relaxed text-text-2">Leia o QR Code no aplicativo autenticador e informe o código de 6 dígitos para concluir.</p>
                        <TextField id="two-factor-code" label="Código" inputMode="numeric" autoComplete="one-time-code" className="numeric" value={code} error={codeError} onChange={(event) => setCode(event.target.value)} />
                        <div>
                            <button type="submit" className="btn btn-primary btn-sm">
                                Confirmar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {recoveryCodes && (
                <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
                    <p className="text-xs font-semibold text-demo">Guarde estes códigos em local seguro. Cada um funciona uma vez, se você perder o aplicativo.</p>
                    <ul className="numeric mt-3 grid gap-1 text-xs sm:grid-cols-2">
                        {recoveryCodes.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                {!enabled && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run('enable')}>
                        Ativar
                    </button>
                )}
                {confirmed && !recoveryCodes && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run('codes')}>
                        Ver códigos de recuperação
                    </button>
                )}
                {enabled && (
                    <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void run('disable')}>
                        {confirmed ? 'Desativar' : 'Cancelar'}
                    </button>
                )}
            </div>

            <Modal open={needsPassword !== null} title="Confirme sua senha" onClose={() => setNeedsPassword(null)}>
                <form onSubmit={confirmPassword} className="flex flex-col gap-4">
                    <TextField id="confirm-password" label="Senha" type="password" autoComplete="current-password" autoFocus required value={password} error={passwordError} onChange={(event) => setPassword(event.target.value)} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNeedsPassword(null)}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm">
                            Confirmar
                        </button>
                    </div>
                </form>
            </Modal>
        </SettingsGroup>
    );
}

function SessionsPanel({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const [target, setTarget] = useState<{
        id: string | null;
        label: string;
    } | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();

    const revoke = async (event: FormEvent) => {
        event.preventDefault();
        setError(undefined);

        try {
            const response = await api<{ revoked: number }>('/account/sessions/revoke', {
                method: 'POST',
                body: { password, session_id: target?.id ?? undefined },
            });
            push({
                tone: 'info',
                title: response.revoked === 1 ? '1 sessão encerrada' : `${response.revoked} sessões encerradas`,
            });
            setTarget(null);
            setPassword('');
            onChanged();
        } catch (exception) {
            setError(exception instanceof ApiError ? (exception.firstError('password') ?? exception.message) : 'Não foi possível encerrar.');
        }
    };

    const others = account.sessions.filter((session) => !session.is_current).length;

    return (
        <SettingsGroup title="Dispositivos conectados" description="Sessões ativas na sua conta. A identificação do dispositivo é aproximada.">
            <ul className="flex flex-col gap-2">
                {account.sessions.map((session) => (
                    <li key={session.id} className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950 p-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-800 text-text-2">
                            <Laptop size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                                {session.device}
                                {session.is_current && <span className="rounded-md bg-up-soft px-1.5 py-0.5 text-[10px] font-bold text-up uppercase">Este dispositivo</span>}
                            </div>
                            <div className="numeric truncate text-xs text-text-3">
                                {session.ip_address ?? 'IP desconhecido'} · {formatDateTime(session.last_active_at)}
                            </div>
                        </div>
                        {!session.is_current && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm shrink-0"
                                onClick={() =>
                                    setTarget({
                                        id: session.id,
                                        label: session.device,
                                    })
                                }
                            >
                                Encerrar
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {others > 1 && (
                <button
                    type="button"
                    className="btn btn-danger btn-sm mt-3"
                    onClick={() =>
                        setTarget({
                            id: null,
                            label: 'todas as outras sessões',
                        })
                    }
                >
                    Encerrar as outras {others} sessões
                </button>
            )}

            <Modal open={target !== null} title="Encerrar sessão" onClose={() => setTarget(null)}>
                <form onSubmit={revoke} className="flex flex-col gap-4">
                    <p className="text-[13px] text-text-2">Confirme sua senha para encerrar: {target?.label}.</p>
                    <TextField id="revoke-password" label="Senha" type="password" autoComplete="current-password" autoFocus required value={password} error={error} onChange={(event) => setPassword(event.target.value)} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTarget(null)}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-danger btn-sm">
                            Encerrar
                        </button>
                    </div>
                </form>
            </Modal>
        </SettingsGroup>
    );
}

const EVENT_STYLE = {
    login: {
        label: 'Login',
        icon: <LogIn size={15} className="text-up" aria-hidden="true" />,
    },
    logout: {
        label: 'Saída',
        icon: <LogOut size={15} className="text-text-2" aria-hidden="true" />,
    },
    failed: {
        label: 'Tentativa com senha incorreta',
        icon: <ShieldAlert size={15} className="text-down" aria-hidden="true" />,
    },
};

function AccessHistory({ account }: { account: AccountOverview }) {
    return (
        <SettingsGroup title="Histórico de acessos" description="Os 20 eventos mais recentes.">
            {account.login_events.length === 0 ? (
                <EmptyState icon={<Bell size={18} aria-hidden="true" />} title="Nenhum evento registrado">
                    Os próximos logins aparecerão aqui.
                </EmptyState>
            ) : (
                <ul className="divide-y divide-ink-800">
                    {account.login_events.map((event) => (
                        <li key={event.id} className="flex items-center gap-3 py-2.5">
                            {EVENT_STYLE[event.event].icon}
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium">{EVENT_STYLE[event.event].label}</div>
                                <div className="truncate text-xs text-text-3">
                                    {event.device} · {event.ip_address ?? 'IP desconhecido'}
                                </div>
                            </div>
                            <span className="numeric shrink-0 text-xs text-text-2">{formatDateTime(event.created_at)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </SettingsGroup>
    );
}

function DemoTab({ account }: { account: AccountOverview }) {
    const { props } = usePage<SharedProps>();
    // Always the demo balance, whichever account the header is showing.
    const [wallet, setWallet] = useState<WalletSummary | null>(props.demoWallet);
    const refresh = useWallet((state) => state.refresh);

    useEffect(() => {
        let active = true;
        api<WalletSummary>('/wallet?environment=demo')
            .then((summary) => active && setWallet(summary))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, []);
    const push = useToasts((state) => state.push);
    const options = account.options.demo_reset_cents;
    const [amount, setAmount] = useState(options[1] ?? options[0]);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const reset = async () => {
        setBusy(true);

        try {
            const balance = await api<{
                available_cents: number;
                reserved_cents: number;
            }>('/wallet/demo/reset', {
                method: 'POST',
                body: { amount_cents: amount },
            });
            setWallet((current) => ({
                ...current,
                environment: 'demo',
                ...balance,
            }));
            await refresh();
            setConfirming(false);
            push({
                tone: 'up',
                title: 'Saldo demo reiniciado',
                detail: formatCents(amount),
            });
            router.reload({
                only: ['wallet', 'entries', 'demoWallet', 'activeWallet', 'performance'],
            });
        } catch (error) {
            setConfirming(false);
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível reiniciar o saldo.'),
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <SettingsGroup title="Saldo da conta demo" description="Saldo virtual para treinar, separado da conta real. Não pode ser sacado nem transferido.">
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-ink-800 bg-ink-950 p-3.5">
                        <div className="label">Disponível</div>
                        <Money cents={wallet?.available_cents ?? 0} className="mt-1.5 block text-lg" />
                    </div>
                    <div className="rounded-xl border border-ink-800 bg-ink-950 p-3.5">
                        <div className="label">Em operações</div>
                        <Money cents={wallet?.reserved_cents ?? 0} className="mt-1.5 block text-lg" />
                    </div>
                </div>
            </SettingsGroup>

            <SettingsGroup title="Reiniciar saldo" description="Define um novo saldo para a conta demo. O histórico é mantido, e o reinício fica registrado no extrato. Não é possível com operações abertas.">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Novo saldo">
                    {options.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={`numeric h-11 rounded-lg border text-[13px] transition-colors ${amount === option ? 'border-accent bg-accent-soft text-text-1' : 'border-ink-700 text-text-2 hover:border-ink-600'}`}
                            aria-pressed={amount === option}
                            onClick={() => setAmount(option)}
                        >
                            {formatCents(option).replace(',00', '')}
                        </button>
                    ))}
                </div>
                <button type="button" className="btn btn-ghost mt-4" onClick={() => setConfirming(true)}>
                    Reiniciar saldo
                </button>
            </SettingsGroup>

            <Modal open={confirming} title="Reiniciar saldo da conta demo?" onClose={() => setConfirming(false)}>
                <p className="text-[13px] leading-relaxed text-text-2">
                    Seu saldo demo passará a ser <strong className="numeric text-text-1">{formatCents(amount)}</strong>. O histórico continua no extrato.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                        Cancelar
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void reset()}>
                        {busy ? 'Reiniciando…' : 'Confirmar'}
                    </button>
                </div>
            </Modal>
        </div>
    );
}

/**
 * True while the reader scrolls down the nearest scrolling area: the section
 * switcher then slides away and comes back as soon as they scroll up.
 */
function useHideOnScroll(anchor: RefObject<HTMLElement | null>): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const container = anchor.current?.closest('.thin-scroll');

        if (!container) return;

        let last = container.scrollTop;
        let frame = 0;
        const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const top = container.scrollTop;
                const delta = top - last;

                if (top < 72) {
                    setHidden(false);
                    last = top;
                } else if (Math.abs(delta) > 8) {
                    setHidden(delta > 0);
                    last = top;
                }
            });
        };

        container.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(frame);
        };
    }, [anchor]);

    return hidden;
}

/**
 * The section switcher on phones and in the drawer: one row of pills that
 * the finger drags sideways. The chosen section scrolls itself into the
 * middle, and a fade on each side shows when there is more to see.
 */
function SectionBar({ tab, onSelect }: { tab: AccountTab; onSelect: (tab: AccountTab) => void }) {
    const scroller = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: true, end: false });

    const measure = useCallback(() => {
        const element = scroller.current;

        if (!element) return;

        setEdges({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
    }, []);

    useEffect(() => {
        const element = scroller.current;
        const active = element?.querySelector<HTMLElement>('[aria-selected="true"]');

        if (element && active) {
            element.scrollTo({ left: active.offsetLeft - (element.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
        }
    }, [tab]);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);

        return () => window.removeEventListener('resize', measure);
    }, [measure]);

    return (
        <div className="relative min-w-0">
            <div ref={scroller} onScroll={measure} role="tablist" aria-label="Configurações da conta" className="no-scrollbar relative flex w-full snap-x snap-proximity gap-1.5 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 py-2.5">
                {ACCOUNT_TABS.map((item) => {
                    const active = tab === item.value;

                    return (
                        <button
                            key={item.value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onSelect(item.value)}
                            className={`flex h-9 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.97] ${active ? 'border-accent bg-accent text-on-accent shadow-[0_6px_18px_-10px_var(--color-accent)]' : 'border-ink-700 bg-ink-850 text-text-2 hover:border-ink-600 hover:text-text-1'}`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    );
                })}
            </div>
            <span className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-ink-950 to-transparent transition-opacity duration-200 ${edges.start ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />
            <span className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent transition-opacity duration-200 ${edges.end ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />
            {/* A mouse cannot drag the row, so devices with one get arrows; fingers just swipe. */}
            {(['start', 'end'] as const).map((side) =>
                edges[side] ? null : (
                    <button
                        key={side}
                        type="button"
                        tabIndex={-1}
                        aria-label={side === 'start' ? 'Ver seções anteriores' : 'Ver mais seções'}
                        onClick={() => scroller.current?.scrollBy({ left: side === 'start' ? -220 : 220, behavior: 'smooth' })}
                        className={`absolute top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-ink-700 bg-ink-900 text-text-2 shadow-[var(--shadow-float)] hover:text-text-1 [@media(hover:hover)]:grid ${side === 'start' ? 'left-1.5' : 'right-1.5'}`}
                    >
                        {side === 'start' ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    </button>
                ),
            )}
        </div>
    );
}

export default function AccountSettings({ layout = 'drawer' }: { layout?: 'drawer' | 'page' }) {
    const tab = useAccountPanel((state) => state.tab);
    const setTab = useAccountPanel((state) => state.setTab);
    const root = useRef<HTMLDivElement>(null);
    const [account, setAccount] = useState<AccountOverview | null>(null);

    // A new section starts at its top, with the switcher in view.
    const switcherHidden = useHideOnScroll(root);
    const selectTab = useCallback(
        (next: AccountTab) => {
            setTab(next);
            root.current?.closest('.thin-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [setTab],
    );
    const [failed, setFailed] = useState(false);

    const load = useCallback(() => {
        api<AccountOverview>('/account')
            .then((response) => {
                setAccount(response);
                setFailed(false);
            })
            .catch(() => setFailed(true));
    }, []);

    useEffect(load, [load]);

    const content = (
        <>
            {failed && (
                <EmptyState title="Não foi possível carregar sua conta">
                    <button type="button" className="underline" onClick={load}>
                        Tentar novamente
                    </button>
                </EmptyState>
            )}
            {!account && !failed && (
                <div className="flex flex-col gap-3" role="status" aria-label="Carregando">
                    <div className="skeleton h-32 w-full" />
                    <div className="skeleton h-56 w-full" />
                </div>
            )}
            {account && (
                <div key={tab} className="stagger flex flex-col gap-4">
                    {tab === 'profile' && (
                        <>
                            <IdentityCard account={account} onChanged={load} />
                            <ProfileTab account={account} onChanged={load} />
                            <StatementCard account={account} />
                        </>
                    )}
                    {tab === 'notifications' && <NotificationsTab />}
                    {tab === 'preferences' && <PreferencesTab account={account} />}
                    {tab === 'payments' && <PaymentMethodsTab account={account} onChanged={load} />}
                    {tab === 'security' && (
                        <>
                            <TwoFactorPanel account={account} onChanged={load} />
                            <PasswordForm />
                            <SessionsPanel account={account} onChanged={load} />
                            <AccessHistory account={account} />
                        </>
                    )}
                    {tab === 'account' && <AccountActionsTab account={account} onChanged={load} />}
                    {tab === 'demo' && <DemoTab account={account} />}
                </div>
            )}
        </>
    );

    if (layout === 'page') {
        const current = ACCOUNT_TABS.find((item) => item.value === tab);

        return (
            <div ref={root} className="flex flex-col gap-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
                <nav
                    aria-label="Seções da conta"
                    className={`sticky top-0 z-10 -mx-4 border-b border-ink-800 bg-ink-950/90 backdrop-blur-md transition-transform duration-300 ease-out sm:-mx-6 lg:top-6 lg:mx-0 lg:translate-y-0 lg:self-start lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none ${switcherHidden ? '-translate-y-full' : 'translate-y-0'}`}
                >
                    <div className="lg:hidden">
                        <SectionBar tab={tab} onSelect={selectTab} />
                    </div>
                    <ul className="hidden lg:flex lg:flex-col">
                        {ACCOUNT_TABS.map((item) => {
                            const active = tab === item.value;

                            return (
                                <li key={item.value} className="shrink-0 lg:border-b lg:border-dashed lg:border-ink-700 lg:last:border-b-0">
                                    <button
                                        type="button"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => selectTab(item.value)}
                                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition-colors lg:rounded-none lg:px-1 lg:py-3.5 lg:text-[14px] ${active ? 'bg-ink-800 text-accent lg:bg-transparent' : 'text-text-2 hover:text-text-1'}`}
                                    >
                                        <span className={active ? 'text-accent' : 'text-text-3'}>{item.icon}</span>
                                        {item.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <section className="min-w-0">
                    <h2 className="mb-4 text-lg font-bold tracking-tight lg:text-xl">{current?.label}</h2>
                    {content}
                </section>
            </div>
        );
    }

    return (
        <div ref={root} className="flex flex-col">
            <div className={`sticky top-0 z-10 border-b border-ink-800 bg-ink-950/90 backdrop-blur-md transition-transform duration-300 ease-out ${switcherHidden ? '-translate-y-full' : 'translate-y-0'}`}>
                <SectionBar tab={tab} onSelect={selectTab} />
            </div>
            <div className="p-4 sm:p-5" role="tabpanel" aria-label={ACCOUNT_TABS.find((item) => item.value === tab)?.label}>
                <h3 className="mb-4 text-base font-bold tracking-tight">{ACCOUNT_TABS.find((item) => item.value === tab)?.label}</h3>
                {content}
            </div>
        </div>
    );
}
