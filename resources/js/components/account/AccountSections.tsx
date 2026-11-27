import { router } from '@inertiajs/react';
import { Camera, Copy, Download, KeyRound, Plus, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Modal, SettingsGroup, Switch, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { playResultTone } from '@/lib/sound';
import { SHORTCUTS } from '@/lib/shortcuts';
import type { AccountOverview, Preferences, SavedPixKey } from '@/lib/types';
import { usePreferences } from '@/stores/preferences';
import { useToasts } from '@/stores/toasts';

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? (Object.values(error.errors)[0]?.[0] ?? error.message) : fallback;
}

function csrfHeader(): Record<string, string> {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);

    return {
        'X-XSRF-TOKEN': match ? decodeURIComponent(match[1]) : '',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
}

function initials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

export function AccountAvatar({ name, url, size = 32 }: { name: string; url: string | null | undefined; size?: number }) {
    const style = { width: size, height: size };

    if (url) {
        return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover ring-1 ring-ink-600" />;
    }

    return (
        <span style={{ ...style, fontSize: Math.max(10, size * 0.34) }} className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#7fbf1f] font-bold text-on-accent">
            {initials(name) || <UserRound size={size * 0.5} />}
        </span>
    );
}

function useSaver() {
    const save = usePreferences((state) => state.save);
    const push = useToasts((state) => state.push);

    return (changes: Partial<Preferences>) =>
        save(changes).catch((error) =>
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível salvar a preferência.'),
            }),
        );
}

/* ------------------------------------------------------------------ Dados pessoais */

export function IdentityCard({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const { profile } = account;
    const name = `${profile.first_name} ${profile.last_name}`.trim();

    const upload = async (file: File) => {
        setBusy(true);
        const body = new FormData();
        body.append('photo', file);

        try {
            const response = await fetch('/api/v1/account/avatar', {
                method: 'POST',
                credentials: 'same-origin',
                headers: csrfHeader(),
                body,
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new ApiError(payload?.message ?? 'Não foi possível enviar a foto.', response.status, null, payload?.errors ?? {});
            }

            push({ tone: 'up', title: 'Foto atualizada' });
            onChanged();
            router.reload({ only: ['auth'] });
        } catch (error) {
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível enviar a foto.'),
            });
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);

        try {
            await api('/account/avatar', { method: 'DELETE' });
            onChanged();
            router.reload({ only: ['auth'] });
        } finally {
            setBusy(false);
        }
    };

    const copyId = () => {
        navigator.clipboard
            ?.writeText(profile.profile_id)
            .then(() => push({ tone: 'info', title: 'ID copiado' }))
            .catch(() => undefined);
    };

    return (
        <section className="panel overflow-hidden">
            <div className="relative flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
                <div className="glow-backdrop absolute inset-0 opacity-60" aria-hidden="true" />
                <div className="relative">
                    <AccountAvatar name={name} url={profile.avatar_url} size={88} />
                    <button
                        type="button"
                        disabled={busy}
                        aria-label="Enviar uma foto"
                        className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border border-ink-600 bg-ink-800 text-text-1 shadow-[var(--shadow-float)] transition-colors hover:bg-ink-700"
                        onClick={() => input.current?.click()}
                    >
                        <Camera size={15} aria-hidden="true" />
                    </button>
                    <input
                        ref={input}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';

                            if (file) void upload(file);
                        }}
                    />
                </div>
                <div className="relative min-w-0 flex-1">
                    <div className="truncate text-lg font-bold">{name}</div>
                    <div className="truncate text-[13px] text-text-2">{profile.email}</div>
                    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-text-3 sm:justify-start">
                        <span>
                            Cadastro: <span className="text-text-2">{profile.member_since ? formatDateTime(profile.member_since).split(',')[0] : '—'}</span>
                        </span>
                        <button type="button" className="inline-flex items-center gap-1 hover:text-text-1" onClick={copyId} title="Copiar ID">
                            ID de perfil: <span className="numeric text-text-2">{profile.profile_id}</span>
                            <Copy size={12} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="relative flex gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
                        <Plus size={15} aria-hidden="true" />
                        {profile.avatar_url ? 'Trocar foto' : 'Enviar foto'}
                    </button>
                    {profile.avatar_url && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label="Remover foto" onClick={() => void remove()}>
                            <Trash2 size={15} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>
            <p className="border-t border-ink-800 px-6 py-3 text-xs text-text-3">JPG, PNG ou WebP de até 2 MB. Sua foto aparece só para você, no menu da conta.</p>
        </section>
    );
}

function monthLabel(month: string): string {
    const [year, number] = month.split('-').map(Number);
    const label = new Date(year, number - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });

    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function StatementCard({ account }: { account: AccountOverview }) {
    const months = account.options.statement_months;
    const [month, setMonth] = useState(months[0] ?? '');
    const [wallet, setWallet] = useState<'demo' | 'real'>(account.profile.real_account ? 'real' : 'demo');

    return (
        <SettingsGroup title="Extrato da conta: mensal" description="Baixe todas as movimentações de um mês em uma planilha (CSV), com data, tipo, valores e saldo após cada lançamento.">
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-44 flex-1">
                    <label className="label" htmlFor="statement-month">
                        Mês
                    </label>
                    <select id="statement-month" className="field mt-1.5" value={month} onChange={(event) => setMonth(event.target.value)}>
                        {months.map((value) => (
                            <option key={value} value={value}>
                                {monthLabel(value)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="min-w-36">
                    <label className="label" htmlFor="statement-wallet">
                        Conta
                    </label>
                    <select id="statement-wallet" className="field mt-1.5" value={wallet} onChange={(event) => setWallet(event.target.value as 'demo' | 'real')}>
                        {account.profile.real_account && <option value="real">Conta real</option>}
                        <option value="demo">Conta demo</option>
                    </select>
                </div>
                <a className="btn btn-primary" href={`/conta/extrato?mes=${month}&conta=${wallet}`} download>
                    <Download size={16} aria-hidden="true" />
                    Baixar extrato
                </a>
            </div>
        </SettingsGroup>
    );
}

/* ------------------------------------------------------------------ Notificações */

export function NotificationsTab() {
    const preferences = usePreferences((state) => state.preferences);
    const update = useSaver();

    return (
        <div className="flex flex-col gap-4">
            <SettingsGroup title="Notificações por e-mail" description="Avisos de segurança, como a redefinição de senha, são sempre enviados.">
                <div className="divide-y divide-ink-800">
                    <Switch
                        label="Depósitos e saques"
                        description="Comprovante por e-mail quando um depósito é creditado ou um saque é concluído."
                        checked={preferences.email_transactions}
                        onChange={(email_transactions) => void update({ email_transactions })}
                    />
                    <Switch label="Novidades da plataforma" description="Novos recursos, ativos e mudanças importantes." checked={preferences.email_product_news} onChange={(email_product_news) => void update({ email_product_news })} />
                    <Switch
                        label="Ofertas e promoções"
                        description="Campanhas e condições especiais. Você pode desligar quando quiser."
                        checked={preferences.email_promotions}
                        onChange={(email_promotions) => void update({ email_promotions })}
                    />
                </div>
            </SettingsGroup>
            <SettingsGroup title="Na plataforma">
                <div className="divide-y divide-ink-800">
                    <Switch
                        label="Aviso ao encerrar operação"
                        description="Mostra o resultado de cada operação assim que ela vence."
                        checked={preferences.notify_settlement_toast}
                        onChange={(notify_settlement_toast) => void update({ notify_settlement_toast })}
                    />
                    <Switch
                        label="Som ao encerrar operação"
                        description="Um tom curto para resultado positivo, negativo ou neutro."
                        checked={preferences.sound_on_settlement}
                        onChange={(sound_on_settlement) => {
                            void update({ sound_on_settlement });

                            if (sound_on_settlement) playResultTone('won');
                        }}
                    />
                </div>
            </SettingsGroup>
        </div>
    );
}

/* ------------------------------------------------------------------ Negociação: aparência, gráfico e teclado */

export function InterfaceGroup({ scales }: { scales: number[] }) {
    const preferences = usePreferences((state) => state.preferences);
    const update = useSaver();

    return (
        <SettingsGroup title="Escala da interface" description="Aumenta ou diminui todos os elementos da plataforma, como o zoom do navegador. Vale para telas de computador; no celular, use o zoom do próprio aparelho.">
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Escala da interface">
                {scales.map((scale) => (
                    <button
                        key={scale}
                        type="button"
                        role="radio"
                        aria-checked={preferences.interface_scale === scale}
                        className={`numeric flex h-11 items-center justify-center gap-2 rounded-lg border text-[13px] transition-colors ${preferences.interface_scale === scale ? 'border-accent bg-accent-soft text-text-1' : 'border-ink-700 text-text-2 hover:border-ink-600'}`}
                        onClick={() => void update({ interface_scale: scale })}
                    >
                        <span className={`size-3 rounded-full border-2 ${preferences.interface_scale === scale ? 'border-accent bg-accent' : 'border-ink-600'}`} aria-hidden="true" />
                        {scale}%
                    </button>
                ))}
            </div>
        </SettingsGroup>
    );
}

export function ChartDisplayGroup() {
    const preferences = usePreferences((state) => state.preferences);
    const update = useSaver();

    return (
        <SettingsGroup title="Operações e informações no gráfico">
            <div className="divide-y divide-ink-800">
                <Switch
                    label="Linha das operações abertas"
                    description="Linha pontilhada no preço de entrada de cada operação aberta no ativo."
                    checked={preferences.chart_position_lines}
                    onChange={(chart_position_lines) => void update({ chart_position_lines })}
                />
                <Switch
                    label="Valor da operação no gráfico"
                    description="Mostra o valor investido junto da linha de entrada."
                    checked={preferences.chart_stake_labels}
                    disabled={!preferences.chart_position_lines}
                    onChange={(chart_stake_labels) => void update({ chart_stake_labels })}
                />
            </div>
        </SettingsGroup>
    );
}

export function ShortcutsGroup() {
    const preferences = usePreferences((state) => state.preferences);
    const update = useSaver();

    return (
        <SettingsGroup title="Atalhos do teclado" description="Funcionam na tela Negociar quando nenhum campo de texto está selecionado. Respeitam a confirmação antes de operar.">
            <Switch label="Ativar atalhos" checked={preferences.keyboard_shortcuts} onChange={(keyboard_shortcuts) => void update({ keyboard_shortcuts })} />
            <ul className={`mt-3 grid gap-2 sm:grid-cols-2 ${preferences.keyboard_shortcuts ? '' : 'opacity-50'}`}>
                {SHORTCUTS.map((shortcut) => (
                    <li key={shortcut.label} className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[13px]">
                        <span className="text-text-2">{shortcut.label}</span>
                        <span className="flex gap-1">
                            {shortcut.keys.map((key) => (
                                <kbd key={key} className="numeric rounded-md border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[11px] text-text-1 shadow-[0_1px_0_0_var(--color-ink-600)]">
                                    {key}
                                </kbd>
                            ))}
                        </span>
                    </li>
                ))}
            </ul>
        </SettingsGroup>
    );
}

/* ------------------------------------------------------------------ Métodos de pagamento */

const KEY_TYPE_LABELS: Record<string, string> = {
    cpf: 'CPF',
    email: 'E-mail',
    phone: 'Celular',
    random: 'Aleatória',
};

export function PaymentMethodsTab({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const [type, setType] = useState('cpf');
    const [key, setKey] = useState('');
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const keys: SavedPixKey[] = account.pix_keys;

    const add = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);

        try {
            await api('/pix-keys', {
                method: 'POST',
                body: { type, key, label: label || null },
            });
            setKey('');
            setLabel('');
            push({ tone: 'up', title: 'Chave PIX salva' });
            onChanged();
        } catch (error) {
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível salvar a chave.'),
            });
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await api(`/pix-keys/${id}`, { method: 'DELETE' });
            onChanged();
        } catch (error) {
            push({
                tone: 'down',
                title: errorMessage(error, 'Não foi possível remover a chave.'),
            });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <SettingsGroup title="Chaves PIX para saque" description="Salve até 5 chaves registradas no seu CPF e escolha uma ao sacar, sem precisar digitar.">
                {keys.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-ink-700 p-4 text-center text-[13px] text-text-3">Nenhuma chave salva ainda.</p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {keys.map((item) => (
                            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950 p-3">
                                <span className="icon-tile size-9 shrink-0 !rounded-lg">
                                    <KeyRound size={16} aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-semibold">{item.label || KEY_TYPE_LABELS[item.type]}</div>
                                    <div className="numeric truncate text-xs text-text-3">
                                        {KEY_TYPE_LABELS[item.type]} · {item.masked}
                                    </div>
                                </div>
                                <button type="button" className="grid size-8 place-items-center rounded-lg text-text-3 hover:bg-ink-800 hover:text-down" aria-label="Remover chave" onClick={() => void remove(item.id)}>
                                    <Trash2 size={15} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </SettingsGroup>
            <SettingsGroup title="Adicionar chave">
                <form className="flex flex-col gap-3" onSubmit={(event) => void add(event)}>
                    <div className="segmented flex w-full" role="group" aria-label="Tipo de chave">
                        {account.options.pix_key_types.map((value) => (
                            <button key={value} type="button" className="chip flex-1 !px-0 text-[12px]" aria-pressed={type === value} onClick={() => setType(value)}>
                                {KEY_TYPE_LABELS[value] ?? value}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <TextField id="pix-key" label="Chave" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required />
                        <TextField id="pix-label" label="Apelido (opcional)" maxLength={40} placeholder="Ex.: Nubank" value={label} onChange={(event) => setLabel(event.target.value)} />
                    </div>
                    <div>
                        <button type="submit" className="btn btn-primary" disabled={busy || key.trim() === ''}>
                            Salvar chave
                        </button>
                    </div>
                </form>
            </SettingsGroup>
        </div>
    );
}

/* ------------------------------------------------------------------ Definições da conta */

type PasswordAction = 'close' | 'delete' | null;

export function AccountActionsTab({ account, onChanged }: { account: AccountOverview; onChanged: () => void }) {
    const push = useToasts((state) => state.push);
    const replace = usePreferences((state) => state.replace);
    const [action, setAction] = useState<PasswordAction>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    const reset = async () => {
        try {
            const response = await api<{ preferences: Preferences }>('/account/preferences/reset', { method: 'POST' });
            replace(response.preferences);
            push({
                tone: 'up',
                title: 'Configurações restauradas',
                detail: 'Todas as preferências voltaram ao padrão.',
            });
            onChanged();
        } catch (failure) {
            push({
                tone: 'down',
                title: errorMessage(failure, 'Não foi possível restaurar.'),
            });
        }
    };

    const confirm = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);

        try {
            if (action === 'close') {
                await api('/account/close', {
                    method: 'POST',
                    body: { password },
                });
                window.location.href = '/';

                return;
            }

            await api('/account/deletion-request', {
                method: 'POST',
                body: { password },
            });
            push({
                tone: 'info',
                title: 'Solicitação de exclusão recebida',
                detail: 'Nossa equipe vai concluir o processo e avisar por e-mail.',
            });
            setAction(null);
            onChanged();
        } catch (failure) {
            setError(errorMessage(failure, 'Não foi possível concluir.'));
        } finally {
            setBusy(false);
            setPassword('');
        }
    };

    const requested = account.profile.deletion_requested_at;

    return (
        <div className="flex flex-col gap-4">
            <SettingsGroup
                title="Restaurar configurações"
                description="Se algo na plataforma não estiver como você espera, volte todas as preferências de gráfico, operação, notificações e aparência ao padrão. Seus saldos e histórico não mudam."
            >
                <button type="button" className="btn btn-ghost" onClick={() => void reset()}>
                    Restaurar padrão
                </button>
            </SettingsGroup>

            <SettingsGroup
                title="Fechamento temporário da conta"
                description="Depois de fechada, não será possível entrar nem operar. Seus saldos ficam guardados e a conta pode ser reaberta pelo suporte. É preciso não ter operações abertas nem saques em andamento."
            >
                <button type="button" className="btn btn-ghost" onClick={() => setAction('close')}>
                    Fechar conta
                </button>
            </SettingsGroup>

            <SettingsGroup
                title="Exclusão da conta e dos dados pessoais"
                description="A exclusão é permanente. Antes de pedir, encerre as operações abertas e saque todo o saldo da conta real. Registros financeiros são mantidos pelo prazo exigido por lei."
            >
                {requested ? (
                    <p className="flex items-center gap-2 rounded-xl border border-demo/30 bg-demo-soft p-3 text-[13px] text-text-1">
                        <ShieldAlert size={16} className="shrink-0 text-demo" aria-hidden="true" />
                        Exclusão solicitada em {formatDateTime(requested)}. Nossa equipe vai concluir o processo.
                    </p>
                ) : (
                    <button type="button" className="btn btn-danger" onClick={() => setAction('delete')}>
                        Solicitar exclusão
                    </button>
                )}
            </SettingsGroup>

            <Modal open={action !== null} title={action === 'close' ? 'Fechar sua conta?' : 'Solicitar exclusão da conta?'} onClose={() => setAction(null)}>
                <form onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4">
                    <p className="text-[13px] leading-relaxed text-text-2">
                        {action === 'close' ? 'Você será desconectado de todos os dispositivos e só poderá voltar com a ajuda do suporte.' : 'Depois de concluída, a exclusão não pode ser desfeita.'} Confirme com sua senha.
                    </p>
                    <TextField id="confirm-password" label="Senha" type="password" autoComplete="current-password" value={password} error={error} onChange={(event) => setPassword(event.target.value)} required />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAction(null)}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-danger btn-sm" disabled={busy || password === ''}>
                            {action === 'close' ? 'Fechar conta' : 'Solicitar exclusão'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
