import { router } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, QrCode, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PanelHeader } from '@/components/ui';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { isValidCpf, maskCpf } from '@/lib/cpf';
import { formatCents, formatCountdown } from '@/lib/format';
import type { Deposit, RealAccountState } from '@/lib/types';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';

/** Quick amounts, shown when inside the deposit limits. */
const QUICK_AMOUNTS = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 250_000, 500_000];
const POLL_MS = 5_000;
const DEFAULT_EXPIRY_MINUTES = 30;

type Step = 'method' | 'details';

function parseCents(value: string): number {
    const cents = Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100);

    return Number.isFinite(cents) ? cents : 0;
}

/**
 * Why a deposit cannot be made now, or null when it can.
 */
export function depositBlockedReason(realAccount: RealAccountState | null): string | null {
    if (!realAccount?.opened) return 'Abra sua conta real para depositar.';
    if (realAccount.status === 'frozen') return 'Sua conta real está bloqueada. Fale com o suporte.';
    if (!realAccount.enabled) return 'Depósitos suspensos no momento. Saques continuam disponíveis.';
    if (!realAccount.payments_configured) return 'Pagamentos ainda não configurados no servidor.';

    return null;
}

/** The PIX mark, drawn here so it needs no image. */
function PixMark({ size = 28 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
            <g fill="#32bcad">
                <path d="M24.3 23.7a3.9 3.9 0 0 1-2.8-1.2l-4-4a.8.8 0 0 0-1 0l-4.1 4.1a3.9 3.9 0 0 1-2.8 1.1h-.8l5.2 5.2a4.1 4.1 0 0 0 5.8 0l5.2-5.2h-.7Z" />
                <path d="M9.6 8.3a3.9 3.9 0 0 1 2.8 1.1l4.1 4.1a.7.7 0 0 0 1 0l4-4a3.9 3.9 0 0 1 2.8-1.2h.5l-5.2-5.2a4.1 4.1 0 0 0-5.8 0L8.6 8.3h1Z" />
                <path d="m28.8 13.1-3.1-3.2h-1.4a2.8 2.8 0 0 0-2 .9l-4 4a1.9 1.9 0 0 1-2.8 0l-4.1-4.1a2.8 2.8 0 0 0-2-.8H7.7l-3.2 3.2a4.1 4.1 0 0 0 0 5.8l3.2 3.2h1.7a2.8 2.8 0 0 0 2-.8l4.1-4.1a2 2 0 0 1 2.8 0l4 4a2.8 2.8 0 0 0 2 .9h1.4l3.1-3.2a4.1 4.1 0 0 0 0-5.8Z" />
            </g>
        </svg>
    );
}

/**
 * PIX deposit in steps, as brokers lay it out: choose the method, set the
 * amount and confirm the payer's CPF and the terms, then pay the QR code.
 * The balance changes only after the server has confirmed the payment.
 */
export function DepositPanel({
    limits,
    initial,
    disabledReason,
    embedded = false,
    expiryMinutes = DEFAULT_EXPIRY_MINUTES,
}: {
    limits: { min: number; max: number };
    initial: Deposit | null;
    disabledReason: string | null;
    embedded?: boolean;
    expiryMinutes?: number;
}) {
    const push = useToasts((state) => state.push);
    const refreshWallet = useWallet((state) => state.refresh);
    const [step, setStep] = useState<Step>('method');
    const [amount, setAmount] = useState(String(Math.max(limits.min, 10_000) / 100));
    const [cpf, setCpf] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [deposit, setDeposit] = useState<Deposit | null>(initial);
    const [error, setError] = useState<string | null>(null);
    const [cpfError, setCpfError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [copied, setCopied] = useState(false);

    const amountCents = parseCents(amount);
    const amountError = amountCents < limits.min ? `Mínimo de ${formatCents(limits.min)}.` : amountCents > limits.max ? `Máximo de ${formatCents(limits.max)}.` : null;
    const cpfComplete = cpf.replace(/\D/g, '').length === 11;
    const cpfInvalid = cpfComplete && !isValidCpf(cpf);
    const quickAmounts = QUICK_AMOUNTS.filter((cents) => cents >= limits.min && cents <= limits.max);

    const check = useCallback(
        async (id: string, askProvider = false) => {
            const { data } = await api<{ data: Deposit }>(`/deposits/${id}${askProvider ? '?check=1' : ''}`);
            setDeposit((current) => (current?.id === id ? { ...data, pix_qr_svg: data.pix_qr_svg ?? current.pix_qr_svg } : current));

            if (data.status === 'completed') {
                push({ tone: 'up', title: `Depósito de ${formatCents(data.amount_cents)} confirmado`, detail: 'O valor já está disponível na conta real.' });
                await refreshWallet();
                router.reload({ only: ['entries', 'deposits', 'wallet', 'realAccount', 'activeWallet'] });
            }

            return data;
        },
        [push, refreshWallet],
    );

    useEffect(() => {
        if (deposit?.status !== 'pending') return;

        const poll = window.setInterval(() => void check(deposit.id).catch(() => undefined), POLL_MS);
        const clock = window.setInterval(() => setNow(Date.now()), 1000);

        return () => {
            window.clearInterval(poll);
            window.clearInterval(clock);
        };
    }, [deposit?.id, deposit?.status, check]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setCpfError(null);

        try {
            const { data } = await api<{ data: Deposit }>('/deposits', {
                method: 'POST',
                body: { amount_cents: amountCents, cpf, accept_terms: accepted, idempotency_key: newIdempotencyKey() },
            });
            setDeposit(data);
            router.reload({ only: ['deposits'] });
        } catch (exception) {
            if (exception instanceof ApiError && exception.errors?.cpf) {
                setCpfError(exception.errors.cpf[0]);
            } else {
                setError(exception instanceof ApiError ? exception.message : 'Não foi possível gerar a cobrança.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const copy = async () => {
        if (!deposit?.pix_code) return;

        try {
            await navigator.clipboard.writeText(deposit.pix_code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Não foi possível copiar. Selecione o código e copie manualmente.');
        }
    };

    const remaining = deposit?.expires_at ? new Date(deposit.expires_at).getTime() - now : null;
    const showingCharge = deposit !== null && deposit.status === 'pending' && deposit.pix_code !== null && (remaining === null || remaining > 0);
    const methodHeader = (
        <div className="flex items-center gap-3">
            <PixMark size={30} />
            <div>
                <div className="text-[14px] font-bold">PIX (apenas seu CPF)</div>
                <div className="text-xs text-text-3">Instantâneo · mín. {formatCents(limits.min)}</div>
            </div>
        </div>
    );

    let content: ReactNode;

    if (showingCharge) {
        content = (
            <div className="flex flex-col gap-4">
                {methodHeader}
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink-800 bg-ink-950/60 p-4 text-center">
                    <div className="text-[13px] text-text-2">
                        Pague <span className="numeric text-[15px] font-semibold text-text-1">{formatCents(deposit.amount_cents)}</span> pelo app do seu banco
                    </div>
                    {deposit.pix_qr_svg && <div className="rounded-xl bg-white p-3 [&_svg]:size-48" aria-label="QR Code PIX" role="img" dangerouslySetInnerHTML={{ __html: deposit.pix_qr_svg }} />}
                    <p className="flex items-center gap-2 text-xs text-text-3" aria-live="polite">
                        <RefreshCw size={13} className="animate-spin [animation-duration:2.5s]" aria-hidden="true" />
                        Aguardando o pagamento{remaining !== null ? ` · expira em ${formatCountdown(remaining)}` : ''}
                    </p>
                </div>
                <div>
                    <label className="label" htmlFor="pix-code">
                        PIX copia e cola
                    </label>
                    <div className="mt-1.5 flex gap-1.5">
                        <input id="pix-code" readOnly className="field numeric min-w-0 flex-1 text-xs" value={deposit.pix_code ?? ''} onFocus={(event) => event.target.select()} />
                        <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => void copy()}>
                            {copied ? <CheckCircle2 size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                            {copied ? 'Copiado' : 'Copiar'}
                        </button>
                    </div>
                </div>
                <ol className="flex flex-col gap-2 text-xs text-text-2">
                    {[
                        'Abra o app do seu banco e escolha pagar com PIX (QR Code ou copia e cola).',
                        'Confira o valor e pague usando uma conta no seu próprio CPF.',
                        'Pronto: o saldo entra na sua conta real assim que o banco confirma, normalmente em segundos.',
                    ].map((text, index) => (
                        <li key={text} className="flex gap-2.5">
                            <span className="numeric grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">{index + 1}</span>
                            {text}
                        </li>
                    ))}
                </ol>
                {error && (
                    <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-xs text-text-1" role="alert">
                        {error}
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => void check(deposit.id, true).catch(() => setError('Sem resposta agora. Tente de novo em instantes.'))}>
                        Já paguei, verificar
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm flex-1"
                        onClick={() => {
                            setDeposit(null);
                            setStep('details');
                        }}
                    >
                        Novo depósito
                    </button>
                </div>
            </div>
        );
    } else if (step === 'method') {
        content = (
            <div className="flex flex-col gap-3">
                {disabledReason && <p className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-xs leading-relaxed text-text-2">{disabledReason}</p>}
                <span className="text-[11px] font-bold tracking-wide text-text-3 uppercase">Recomendado</span>
                <button
                    type="button"
                    disabled={disabledReason !== null}
                    onClick={() => setStep('details')}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-850/70 p-4 text-left transition-colors hover:border-accent/50 hover:bg-ink-800 disabled:pointer-events-none disabled:opacity-50"
                >
                    {methodHeader}
                    <ChevronRight size={18} className="text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                </button>
                <ul className="grid grid-cols-3 gap-2 text-center text-[11px] text-text-3">
                    <li className="rounded-xl border border-ink-800 px-2 py-2.5">
                        <Zap size={15} className="mx-auto mb-1 text-accent" aria-hidden="true" />
                        Crédito em segundos
                    </li>
                    <li className="rounded-xl border border-ink-800 px-2 py-2.5">
                        <ShieldCheck size={15} className="mx-auto mb-1 text-accent" aria-hidden="true" />
                        Sem taxa
                    </li>
                    <li className="rounded-xl border border-ink-800 px-2 py-2.5">
                        <Clock3 size={15} className="mx-auto mb-1 text-accent" aria-hidden="true" />
                        24 horas, todo dia
                    </li>
                </ul>
                {deposit && deposit.status !== 'pending' && deposit.status !== 'completed' && <p className="text-xs text-text-3">A última cobrança não está mais disponível para pagamento.</p>}
            </div>
        );
    } else {
        content = (
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
                <button type="button" className="-mb-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-text-3 hover:text-text-1" onClick={() => setStep('method')}>
                    <ArrowLeft size={14} aria-hidden="true" />
                    Métodos de pagamento
                </button>
                {methodHeader}

                <div>
                    <label className="label" htmlFor="deposit-amount">
                        Valor do depósito
                    </label>
                    <div className="relative mt-1.5">
                        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] font-semibold text-text-2">R$</span>
                        <input
                            id="deposit-amount"
                            className="field numeric !h-14 !pl-12 !text-[22px] font-semibold"
                            inputMode="decimal"
                            value={amount}
                            aria-invalid={amountError !== null}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                    </div>
                    {amountError && <p className="mt-1.5 text-xs text-down">{amountError}</p>}
                    <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Valores rápidos">
                        {quickAmounts.map((cents) => (
                            <button
                                key={cents}
                                type="button"
                                aria-pressed={amountCents === cents}
                                onClick={() => setAmount((cents / 100).toString())}
                                className={`numeric h-9 rounded-xl border text-[12px] font-semibold transition-colors ${amountCents === cents ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 text-text-2 hover:border-ink-600 hover:text-text-1'}`}
                            >
                                {formatCents(cents).replace(',00', '')}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="label" htmlFor="deposit-cpf">
                        CPF do titular (quem vai pagar)
                    </label>
                    <input
                        id="deposit-cpf"
                        className="field numeric mt-1.5"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000.000.000-00"
                        value={cpf}
                        aria-invalid={cpfInvalid || cpfError !== null ? true : undefined}
                        onChange={(event) => {
                            setCpf(maskCpf(event.target.value));
                            setCpfError(null);
                        }}
                    />
                    {cpfError || cpfInvalid ? (
                        <p className="mt-1.5 text-xs text-down" role="alert">
                            {cpfError ?? 'CPF inválido. Confira os números.'}
                        </p>
                    ) : (
                        <p className="mt-1.5 text-xs text-text-3">O PIX precisa sair de uma conta bancária no seu CPF, o mesmo da sua conta real.</p>
                    )}
                </div>

                <div className="rounded-2xl border border-ink-800 p-3.5">
                    <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-2">
                        <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                        <span>Li e aceito os termos de depósito e confirmo que o pagamento será feito de uma conta no meu CPF.</span>
                    </label>
                    <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent" aria-expanded={showTerms} onClick={() => setShowTerms((current) => !current)}>
                        {showTerms ? 'Ocultar termos' : 'Ler os termos de depósito'}
                        <ChevronDown size={14} className={`transition-transform ${showTerms ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {showTerms && (
                        <ol className="mt-2.5 flex list-decimal flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-text-3">
                            <li>O valor é creditado na conta real somente depois que o provedor de pagamentos (AmploPay) confirma o PIX.</li>
                            <li>O pagamento deve sair de uma conta bancária no CPF do titular da conta. Pagamentos de terceiros ficam retidos para análise e podem ser devolvidos ao pagador.</li>
                            <li>Pague exatamente o valor da cobrança. Valores diferentes ficam retidos para análise.</li>
                            <li>Cada QR Code vale por {expiryMinutes} minutos e serve para um único pagamento. Não pague um código expirado: gere outro.</li>
                            <li>Em caso de estorno ou contestação do PIX, o valor é retirado do saldo; se o saldo não bastar, a conta real pode ser bloqueada até a regularização.</li>
                            <li>
                                Operações com opções binárias envolvem alto risco e podem levar à perda total do valor de cada operação. Veja os{' '}
                                <a href="/termos" target="_blank" rel="noreferrer" className="underline hover:text-text-1">
                                    termos de uso
                                </a>{' '}
                                e as{' '}
                                <a href="/riscos" target="_blank" rel="noreferrer" className="underline hover:text-text-1">
                                    regras e riscos
                                </a>
                                .
                            </li>
                        </ol>
                    )}
                </div>

                {error && (
                    <p className="rounded-xl border border-down/40 bg-down-soft p-3 text-xs text-text-1" role="alert">
                        {error}
                    </p>
                )}

                <button type="submit" className="btn btn-primary h-12 text-[15px]" disabled={submitting || amountError !== null || !cpfComplete || cpfInvalid || !accepted || disabledReason !== null}>
                    <QrCode size={17} aria-hidden="true" />
                    {submitting ? 'Gerando QR Code…' : `Gerar QR Code de ${amountError ? 'PIX' : formatCents(amountCents)}`}
                </button>
            </form>
        );
    }

    const body = <div className={embedded ? '' : 'p-4 sm:p-5'}>{content}</div>;

    if (embedded) {
        return body;
    }

    return (
        <section className="panel overflow-hidden">
            <PanelHeader title={showingCharge ? 'Pagar com PIX' : 'Depositar'} />
            {body}
        </section>
    );
}
