import { router } from '@inertiajs/react';
import { Landmark, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { maskCpf } from '@/lib/cpf';
import { formatPhone } from '@/lib/phone';

type Errors = Partial<Record<'cpf' | 'birth_date' | 'phone' | 'accept_real_terms', string>>;

/**
 * Opens the real-money account. The CPF ties deposits and withdrawals to one
 * person: PIX payouts only go to keys registered under it.
 */
export function OpenRealAccount() {
    const [cpf, setCpf] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [phone, setPhone] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [errors, setErrors] = useState<Errors>({});
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setErrors({});
        setMessage(null);

        try {
            await api('/real-account', { method: 'POST', body: { cpf, birth_date: birthDate, phone, accept_real_terms: accepted } });
            router.visit('/carteira', { preserveState: false });
        } catch (exception) {
            if (exception instanceof ApiError) {
                setErrors(Object.fromEntries(Object.entries(exception.errors).map(([field, list]) => [field, list[0]])) as Errors);
                setMessage(Object.keys(exception.errors).length === 0 ? exception.message : null);
            } else {
                setMessage('Não foi possível abrir a conta.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-real-soft text-real">
                    <Landmark size={19} aria-hidden="true" />
                </span>
                <div>
                    <h2 className="text-lg font-bold">Abrir conta real</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-2">Saldo separado da conta demo, com depósito e saque por PIX. O dinheiro virtual nunca passa para a conta real.</p>
                </div>
            </div>

            <form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={(event) => void submit(event)}>
                <TextField label="CPF" id="real-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpf} error={errors.cpf} onChange={(event) => setCpf(maskCpf(event.target.value))} required />
                <TextField label="Data de nascimento" id="real-birth" type="date" value={birthDate} error={errors.birth_date} onChange={(event) => setBirthDate(event.target.value)} required />
                <TextField
                    label="Celular"
                    id="real-phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={15}
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    error={errors.phone}
                    onChange={(event) => setPhone(formatPhone(event.target.value))}
                    required
                />

                <label className="flex items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-950 p-3.5 text-[13px] leading-relaxed text-text-2 sm:col-span-3">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-real)]" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                    <span>
                        Entendo que opções binárias têm alto risco, que posso perder todo o valor de cada operação e que os saques só vão para chaves PIX no meu CPF. Li as{' '}
                        <a href="/riscos" target="_blank" className="text-text-1 underline">
                            regras e riscos
                        </a>
                        .{errors.accept_real_terms && <span className="mt-1 block text-xs text-down">{errors.accept_real_terms}</span>}
                    </span>
                </label>

                {message && (
                    <p className="flex gap-2 rounded-xl border border-down/40 bg-down-soft p-3 text-xs text-text-1 sm:col-span-3" role="alert">
                        <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {message}
                    </p>
                )}

                <div className="sm:col-span-3">
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? 'Abrindo…' : 'Abrir conta real'}
                    </button>
                </div>
            </form>
        </section>
    );
}
