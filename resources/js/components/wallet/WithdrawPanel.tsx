import { router } from '@inertiajs/react';
import { ArrowUpFromLine, KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PanelHeader, TextField } from '@/components/ui';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { formatCents } from '@/lib/format';
import type { SavedPixKey } from '@/lib/types';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';

const KEY_TYPES = [
    { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
    { value: 'email', label: 'E-mail', placeholder: 'voce@exemplo.com' },
    { value: 'phone', label: 'Celular', placeholder: '(11) 99999-9999' },
    { value: 'random', label: 'Aleatória', placeholder: '00000000-0000-0000-0000-000000000000' },
];

type Errors = Partial<Record<'amount_cents' | 'pix_key_type' | 'pix_key' | 'password', string>>;

/**
 * Requests a PIX withdrawal. The amount is reserved at once and only leaves the
 * balance when the provider confirms the transfer.
 */
export function WithdrawPanel({ availableCents, limits }: { availableCents: number; limits: { min: number; max: number; daily: number; feePaidByUser: boolean } }) {
    const push = useToasts((state) => state.push);
    const refreshWallet = useWallet((state) => state.refresh);
    const [amount, setAmount] = useState('');
    const [keyType, setKeyType] = useState('cpf');
    const [pixKey, setPixKey] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [savedKeys, setSavedKeys] = useState<SavedPixKey[]>([]);

    useEffect(() => {
        let active = true;
        api<{ data: SavedPixKey[] }>('/pix-keys')
            .then(({ data }) => active && setSavedKeys(data))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, []);

    const amountCents = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100) || 0;
    const amountError =
        amount === ''
            ? null
            : amountCents < limits.min
              ? `Mínimo de ${formatCents(limits.min)}.`
              : amountCents > Math.min(limits.max, availableCents)
                ? amountCents > availableCents
                    ? 'Maior que o saldo disponível.'
                    : `Máximo de ${formatCents(limits.max)}.`
                : null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setErrors({});
        setMessage(null);

        try {
            await api('/withdrawals', { method: 'POST', body: { amount_cents: amountCents, pix_key_type: keyType, pix_key: pixKey, password, idempotency_key: newIdempotencyKey() } });
            push({ tone: 'info', title: `Saque de ${formatCents(amountCents)} solicitado`, detail: 'O valor fica reservado até a transferência ser confirmada.' });
            setAmount('');
            setPassword('');
            await refreshWallet();
            router.reload({ only: ['entries', 'withdrawals', 'wallet', 'realAccount', 'activeWallet'] });
        } catch (exception) {
            if (exception instanceof ApiError) {
                setErrors(Object.fromEntries(Object.entries(exception.errors).map(([field, list]) => [field, list[0]])) as Errors);
                setMessage(Object.keys(exception.errors).length === 0 ? exception.message : null);
            } else {
                setMessage('Não foi possível solicitar o saque.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const selectedType = KEY_TYPES.find((type) => type.value === keyType) ?? KEY_TYPES[0];

    return (
        <section className="panel overflow-hidden">
            <PanelHeader title="Sacar via PIX" />
            <form className="flex flex-col gap-3 p-4 sm:p-5" onSubmit={(event) => void submit(event)}>
                <TextField
                    label="Valor"
                    id="withdraw-amount"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    error={errors.amount_cents ?? amountError ?? undefined}
                    onChange={(event) => setAmount(event.target.value)}
                    trailing={
                        <button type="button" className="text-[11px] font-semibold text-accent hover:underline" onClick={() => setAmount((Math.min(availableCents, limits.max) / 100).toString())}>
                            Sacar tudo
                        </button>
                    }
                    required
                />
                {savedKeys.length > 0 && (
                    <div>
                        <span className="label">Chaves salvas</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Chaves PIX salvas">
                            {savedKeys.map((saved) => (
                                <button
                                    key={saved.id}
                                    type="button"
                                    className="chip border border-ink-700"
                                    aria-pressed={keyType === saved.type && pixKey === saved.key}
                                    onClick={() => {
                                        setKeyType(saved.type);
                                        setPixKey(saved.key ?? '');
                                    }}
                                >
                                    <KeyRound size={13} aria-hidden="true" />
                                    {saved.label || saved.masked}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <span className="label">Tipo de chave</span>
                    <div className="segmented mt-1.5 flex w-full" role="group" aria-label="Tipo de chave PIX">
                        {KEY_TYPES.map((type) => (
                            <button key={type.value} type="button" className="chip flex-1 !px-0 text-[11px]" aria-pressed={keyType === type.value} onClick={() => setKeyType(type.value)}>
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
                <TextField label="Chave PIX" id="withdraw-key" autoComplete="off" placeholder={selectedType.placeholder} value={pixKey} error={errors.pix_key} hint="A chave precisa estar registrada no seu CPF." onChange={(event) => setPixKey(event.target.value)} required />
                <TextField label="Sua senha" id="withdraw-password" type="password" autoComplete="current-password" value={password} error={errors.password} onChange={(event) => setPassword(event.target.value)} required />
                {message && (
                    <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-xs text-text-1" role="alert">
                        {message}
                    </p>
                )}
                <button type="submit" className="btn btn-ghost border border-ink-700" disabled={submitting || amountCents === 0 || amountError !== null}>
                    <ArrowUpFromLine size={16} aria-hidden="true" />
                    {submitting ? 'Enviando…' : 'Solicitar saque'}
                </button>
                <p className="text-[11px] leading-relaxed text-text-3">
                    Limite diário de {formatCents(limits.daily)}. {limits.feePaidByUser ? 'A tarifa do PIX é descontada do valor recebido. ' : ''}O saque só aparece como concluído depois da confirmação da transferência.
                </p>
            </form>
        </section>
    );
}
