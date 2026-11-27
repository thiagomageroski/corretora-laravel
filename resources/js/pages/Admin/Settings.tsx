import { useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdminCard } from '@/components/admin/ui';
import { FieldError, Switch } from '@/components/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { SETTING_LABELS } from '@/lib/admin';
import { formatDuration } from '@/lib/format';

type Settings = {
    real_money_enabled: boolean;
    min_deposit_cents: number;
    max_deposit_cents: number;
    max_pending_deposits: number;
    min_withdrawal_cents: number;
    max_withdrawal_cents: number;
    daily_withdrawal_limit_cents: number;
    auto_approve_withdrawal_max_cents: number;
    require_payer_match: boolean;
    withdrawal_fee_paid_by_user: boolean;
    min_stake_cents: number;
    max_stake_cents: number;
    max_open_positions: number;
    default_payout_bps: number;
    durations_seconds: number[];
    demo_initial_balance_cents: number;
    legal_company_name: string | null;
    legal_company_document: string | null;
    legal_address: string | null;
    legal_contact_email: string | null;
    legal_privacy_email: string | null;
};

type System = { payments_configured: boolean; webhook_url: string | null; environment: string; laravel: string; php: string; database: string };

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

/** Money fields are typed in reais and kept in cents. */
function MoneyField({ name, form, hint }: { name: NumberKey; form: ReturnType<typeof useForm<Settings>>; hint?: string }) {
    const cents = form.data[name];

    return (
        <div>
            <label className="label" htmlFor={name}>
                {SETTING_LABELS[name]}
            </label>
            <div className="relative mt-1.5">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-text-3">R$</span>
                <input
                    id={name}
                    className="field numeric !pl-9"
                    inputMode="decimal"
                    defaultValue={(cents / 100).toFixed(2).replace('.', ',')}
                    onChange={(event) => form.setData(name, Math.round(Number(event.target.value.replace(/\./g, '').replace(',', '.')) * 100) || 0)}
                />
            </div>
            {hint && !form.errors[name] && <p className="mt-1.5 text-xs text-text-3">{hint}</p>}
            <FieldError message={form.errors[name]} />
        </div>
    );
}

function CountField({ name, form, suffix, hint, scale = 1 }: { name: NumberKey; form: ReturnType<typeof useForm<Settings>>; suffix?: string; hint?: string; scale?: number }) {
    return (
        <div>
            <label className="label" htmlFor={name}>
                {SETTING_LABELS[name]}
            </label>
            <div className="relative mt-1.5">
                <input
                    id={name}
                    className="field numeric"
                    inputMode="decimal"
                    defaultValue={String(form.data[name] / scale).replace('.', ',')}
                    onChange={(event) => form.setData(name, Math.round(Number(event.target.value.replace(',', '.')) * scale) || 0)}
                />
                {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-text-3">{suffix}</span>}
            </div>
            {hint && !form.errors[name] && <p className="mt-1.5 text-xs text-text-3">{hint}</p>}
            <FieldError message={form.errors[name]} />
        </div>
    );
}

type TextKey = { [K in keyof Settings]: Settings[K] extends string | null ? K : never }[keyof Settings];

function TextField({ name, form, type = 'text', placeholder, hint }: { name: TextKey; form: ReturnType<typeof useForm<Settings>>; type?: 'text' | 'email'; placeholder?: string; hint?: string }) {
    return (
        <div>
            <label className="label" htmlFor={name}>
                {SETTING_LABELS[name]}
            </label>
            <input id={name} type={type} className="field mt-1.5" placeholder={placeholder} value={form.data[name] ?? ''} onChange={(event) => form.setData(name, event.target.value === '' ? null : event.target.value)} />
            {hint && !form.errors[name] && <p className="mt-1.5 text-xs text-text-3">{hint}</p>}
            <FieldError message={form.errors[name]} />
        </div>
    );
}

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return (
        <AdminCard title={title}>
            <div className="p-5">
                <p className="mb-4 text-xs leading-relaxed text-text-3">{description}</p>
                {children}
            </div>
        </AdminCard>
    );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
    return (
        <div className="flex items-start gap-2.5 text-[13px]">
            {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-down" aria-hidden="true" />}
            <div className="min-w-0">
                <div>{label}</div>
                {detail && <div className="font-mono text-[11px] break-all text-text-3">{detail}</div>}
            </div>
        </div>
    );
}

export default function SettingsPage({ settings, durationChoices, system }: { settings: Settings; durationChoices: number[]; system: System }) {
    const form = useForm<Settings>(settings);
    const realChanged = form.data.real_money_enabled !== settings.real_money_enabled;

    const submit = () => {
        if (
            realChanged &&
            !window.confirm(form.data.real_money_enabled ? 'Ligar o modo real? Os clientes poderão depositar e operar com dinheiro.' : 'Desligar o modo real? Novos depósitos e operações reais param; saques e liquidações continuam.')
        ) {
            return;
        }

        form.put('/admin/configuracoes', { preserveScroll: true });
    };

    const toggleDuration = (seconds: number) => {
        const current = form.data.durations_seconds;
        form.setData('durations_seconds', current.includes(seconds) ? current.filter((value) => value !== seconds) : [...current, seconds].sort((a, b) => a - b));
    };

    return (
        <AdminLayout
            title="Configurações"
            description="Regras da plataforma. As mudanças valem para todo o site assim que você salva, e ficam registradas na auditoria."
            actions={
                <button type="button" className="btn btn-primary btn-sm" disabled={form.processing || !form.isDirty} onClick={submit}>
                    {form.processing ? 'Salvando…' : 'Salvar configurações'}
                </button>
            }
        >
            <div className="grid gap-4 xl:grid-cols-2">
                <Group title="Modo real" description="Chave geral do dinheiro real. Desligado: ninguém deposita nem abre operação real; saques, confirmações de PIX já pagos e liquidações continuam, para nenhum saldo ficar preso.">
                    <div className={`rounded-xl border px-4 ${form.data.real_money_enabled ? 'border-up/40 bg-up-soft/40' : 'border-down/40 bg-down-soft/40'}`}>
                        <Switch
                            checked={form.data.real_money_enabled}
                            onChange={(value) => form.setData('real_money_enabled', value)}
                            label={form.data.real_money_enabled ? 'Modo real ligado' : 'Modo real desligado'}
                            description={form.data.real_money_enabled ? 'Clientes podem depositar, operar e sacar com dinheiro real.' : 'Somente a conta demo está disponível para novas operações.'}
                        />
                    </div>
                    {realChanged && (
                        <p className="mt-3 flex items-start gap-2 text-xs text-demo">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                            Você está mudando o modo real. Será pedida confirmação ao salvar.
                        </p>
                    )}
                </Group>

                <Group title="Sistema" description="Situação técnica, só para conferência.">
                    <div className="flex flex-col gap-3">
                        <Check ok={system.payments_configured} label={system.payments_configured ? 'Chaves da AmploPay configuradas' : 'Chaves da AmploPay ausentes'} />
                        <Check ok={system.webhook_url !== null} label={system.webhook_url ? 'Endereço de confirmação dos pagamentos' : 'Sem endereço público para confirmações'} detail={system.webhook_url} />
                        <div className="numeric mt-1 grid grid-cols-2 gap-2 text-xs text-text-3">
                            <span>Ambiente: {system.environment}</span>
                            <span className="col-span-2 break-all">Banco: {system.database}</span>
                            <span>Laravel {system.laravel}</span>
                            <span>PHP {system.php}</span>
                        </div>
                    </div>
                </Group>

                <Group title="Depósitos" description="Limites de cada cobrança PIX.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <MoneyField name="min_deposit_cents" form={form} />
                        <MoneyField name="max_deposit_cents" form={form} />
                        <CountField name="max_pending_deposits" form={form} hint="Cobranças geradas e ainda não pagas, por cliente." />
                    </div>
                    <div className="mt-2">
                        <Switch
                            checked={form.data.require_payer_match}
                            onChange={(value) => form.setData('require_payer_match', value)}
                            label={SETTING_LABELS.require_payer_match}
                            description="PIX pago por outro CPF fica em análise em vez de ser creditado (recomendado contra fraude)."
                        />
                    </div>
                </Group>

                <Group title="Saques" description="Limites e aprovação dos saques PIX.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <MoneyField name="min_withdrawal_cents" form={form} />
                        <MoneyField name="max_withdrawal_cents" form={form} />
                        <MoneyField name="daily_withdrawal_limit_cents" form={form} hint="Soma dos saques de um cliente em 24 horas." />
                        <MoneyField name="auto_approve_withdrawal_max_cents" form={form} hint="R$ 0,00 = todo saque espera sua aprovação no painel." />
                    </div>
                    <div className="mt-2">
                        <Switch
                            checked={form.data.withdrawal_fee_paid_by_user}
                            onChange={(value) => form.setData('withdrawal_fee_paid_by_user', value)}
                            label={SETTING_LABELS.withdrawal_fee_paid_by_user}
                            description="Ligado: a tarifa da AmploPay é descontada do valor que o cliente recebe."
                        />
                    </div>
                </Group>

                <Group title="Operações" description="Regras de cada operação. Operações já abertas mantêm o que foi contratado.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <MoneyField name="min_stake_cents" form={form} />
                        <MoneyField name="max_stake_cents" form={form} />
                        <CountField name="max_open_positions" form={form} />
                        <CountField name="default_payout_bps" form={form} suffix="%" scale={100} hint="Usado em ativos novos. Para mudar os atuais, use a tela Ativos." />
                    </div>
                    <div className="mt-4">
                        <span className="label">{SETTING_LABELS.durations_seconds}</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={SETTING_LABELS.durations_seconds}>
                            {durationChoices.map((seconds) => (
                                <button key={seconds} type="button" className="chip h-8 border border-ink-800" aria-pressed={form.data.durations_seconds.includes(seconds)} onClick={() => toggleDuration(seconds)}>
                                    {formatDuration(seconds)}
                                </button>
                            ))}
                        </div>
                        <FieldError message={form.errors.durations_seconds ?? Object.entries(form.errors).find(([key]) => key.startsWith('durations_seconds.'))?.[1]} />
                    </div>
                </Group>

                <Group title="Conta demo" description="Saldo virtual que cada cliente novo recebe para treinar.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <MoneyField name="demo_initial_balance_cents" form={form} />
                    </div>
                </Group>

                <Group title="Dados da empresa" description="Aparecem nos termos de uso, nas políticas de privacidade, cookies e PLD e na divulgação de riscos. Campos vazios não são exibidos.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <TextField name="legal_company_name" form={form} placeholder="Ex.: Nivora Tecnologia Ltda." />
                        <TextField name="legal_company_document" form={form} placeholder="00.000.000/0001-00" />
                        <div className="sm:col-span-2">
                            <TextField name="legal_address" form={form} placeholder="Rua, número, cidade, estado, CEP" />
                        </div>
                        <TextField name="legal_contact_email" form={form} type="email" placeholder="atendimento@seudominio.com" />
                        <TextField name="legal_privacy_email" form={form} type="email" placeholder="privacidade@seudominio.com" hint="Para pedidos da LGPD. Vazio = usa o de atendimento." />
                    </div>
                </Group>
            </div>

            {form.isDirty && (
                <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-ink-900/95 px-4 py-3 shadow-[var(--shadow-float)] backdrop-blur">
                    <span className="text-[13px] text-text-2">Há alterações não salvas.</span>
                    <div className="flex gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
                            Descartar
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" disabled={form.processing} onClick={submit}>
                            {form.processing ? 'Salvando…' : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
