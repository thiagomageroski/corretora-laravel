import { ArrowDownRight, ArrowUpRight, Clock3, Info, Minus, Plus } from 'lucide-react';
import { requestDeposit } from '@/components/account/OnboardingCard';
import { Modal } from '@/components/ui';
import { formatCents, formatDuration } from '@/lib/format';
import type { Asset, TradingRules } from '@/lib/types';
import { useAccountPanel } from '@/stores/accountPanel';
import type { Direction, TradeTicket } from './useTradeTicket';

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

function DirectionButton({ direction, ticket, compact = false }: { direction: Direction; ticket: TradeTicket; compact?: boolean }) {
    const isCall = direction === 'call';
    const Icon = isCall ? ArrowUpRight : ArrowDownRight;

    return (
        <button
            type="button"
            disabled={ticket.disabled}
            onClick={() => ticket.open(direction)}
            className={`btn relative overflow-hidden !gap-0 ${compact ? 'h-12 flex-1' : 'h-[58px] w-full flex-col'} ${isCall ? 'bg-up text-[#04130e] shadow-[0_10px_28px_-14px_var(--color-up)]' : 'bg-down text-[#1d070b] shadow-[0_10px_28px_-14px_var(--color-down)]'} hover:brightness-110`}
        >
            <span className="flex items-center gap-1 text-[15px] font-bold">
                <Icon size={18} aria-hidden="true" />
                {isCall ? 'CALL' : 'PUT'}
            </span>
            {!compact && <span className="text-[11px] font-medium opacity-80">{ticket.submitting === direction ? 'Enviando…' : isCall ? 'Fechar acima' : 'Fechar abaixo'}</span>}
        </button>
    );
}

function ConfirmationModal({ ticket, asset }: { ticket: TradeTicket; asset: Asset }) {
    const direction = ticket.pendingConfirmation;

    return (
        <Modal open={direction !== null} title={ticket.isReal ? 'Confirmar operação com dinheiro real' : 'Confirmar operação na conta demo'} onClose={ticket.cancelConfirmation}>
            <dl className="flex flex-col gap-2 text-[13px]">
                {[
                    ['Conta', ticket.isReal ? 'Real' : 'Demo'],
                    ['Ativo', asset.symbol],
                    ['Direção', direction === 'call' ? 'CALL, fechar acima' : 'PUT, fechar abaixo'],
                    [ticket.isReal ? 'Valor' : 'Valor (demo)', formatCents(ticket.stakeCents)],
                    ['Prazo', formatDuration(ticket.duration)],
                    ['Ganho estimado', `+${formatCents(ticket.profitCents)}`],
                ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                        <dt className="text-text-2">{label}</dt>
                        <dd className="numeric font-medium">{value}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-3 text-xs text-text-3">O preço de entrada é definido pelo servidor no envio.</p>
            <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={ticket.cancelConfirmation}>
                    Cancelar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={ticket.confirm}>
                    Enviar operação
                </button>
            </div>
        </Modal>
    );
}

function Notices({ ticket }: { ticket: TradeTicket }) {
    return (
        <>
            {ticket.blocked && (
                <p className="relative flex gap-2 rounded-xl border border-ink-700 bg-ink-850 p-2.5 text-[11px] leading-snug text-text-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
                    {ticket.blocked}
                </p>
            )}
            {ticket.shortfall && (
                <div className="relative animate-pop rounded-xl border border-down/40 bg-down-soft p-2.5 text-[11px] leading-snug" role="alert">
                    <div className="font-semibold text-text-1">{ticket.shortfall.title}</div>
                    <div className="mt-0.5 text-text-2">
                        Faltam <span className="numeric font-semibold text-text-1">{ticket.shortfall.missing}</span> · disponível <span className="numeric">{ticket.shortfall.available}</span>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm mt-2 !h-8 w-full" onClick={ticket.isReal ? requestDeposit : () => useAccountPanel.getState().show('demo')}>
                        {ticket.isReal ? 'Depositar' : 'Reiniciar saldo demo'}
                    </button>
                </div>
            )}
            {ticket.error && (
                <p className="relative animate-pop rounded-xl border border-down/40 bg-down-soft p-2.5 text-[11px] leading-snug text-text-1" role="alert">
                    {ticket.error}
                </p>
            )}
        </>
    );
}

export function TradePanelCompact({ asset, ticket, rules }: { asset: Asset; ticket: TradeTicket; rules: TradingRules }) {
    return (
        <div className="flex flex-col gap-2 p-3">
            <Notices ticket={ticket} />
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="stake-compact">
                        Valor
                    </label>
                    <div className="relative mt-1">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-text-3">R$</span>
                        <input id="stake-compact" className="field numeric !h-10 !pl-8" inputMode="decimal" value={ticket.amount} aria-invalid={ticket.stakeError !== null} onChange={(event) => ticket.setAmount(event.target.value)} />
                    </div>
                </div>
                <div className="w-28 shrink-0">
                    <label className="label" htmlFor="duration-compact">
                        Prazo
                    </label>
                    <select id="duration-compact" className="field mt-1 !h-10 !px-2.5" value={ticket.duration} onChange={(event) => ticket.setDuration(Number(event.target.value))}>
                        {rules.durations_seconds.map((seconds) => (
                            <option key={seconds} value={seconds}>
                                {formatDuration(seconds)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {ticket.stakeError && <p className="text-xs text-down">{ticket.stakeError}</p>}
            <div className="flex gap-2">
                <DirectionButton direction="call" ticket={ticket} compact />
                <DirectionButton direction="put" ticket={ticket} compact />
            </div>
            <p className="text-center text-[11px] text-text-3">
                Se acertar recebe <span className="numeric text-up">{formatCents(ticket.stakeCents + ticket.profitCents)}</span> (<span className="numeric text-up">+{formatCents(ticket.profitCents)}</span>)
            </p>
            <ConfirmationModal ticket={ticket} asset={asset} />
        </div>
    );
}

function StepButtons({
    onMinus,
    onPlus,
    minusLabel,
    plusLabel,
    minusDisabled = false,
    plusDisabled = false,
}: {
    onMinus: () => void;
    onPlus: () => void;
    minusLabel: string;
    plusLabel: string;
    minusDisabled?: boolean;
    plusDisabled?: boolean;
}) {
    const base = 'grid h-[18px] w-6 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-ink-700 hover:text-text-1 disabled:pointer-events-none disabled:opacity-30';

    return (
        <div className="flex shrink-0 flex-col gap-0.5">
            <button type="button" aria-label={plusLabel} className={base} disabled={plusDisabled} onClick={onPlus}>
                <Plus size={12} aria-hidden="true" />
            </button>
            <button type="button" aria-label={minusLabel} className={base} disabled={minusDisabled} onClick={onMinus}>
                <Minus size={12} aria-hidden="true" />
            </button>
        </div>
    );
}

/**
 * The fixed trading rail beside the chart: narrow, with only what a trade
 * needs (amount, expiry, profit and the two directions).
 */
export default function TradePanel({ asset, ticket, rules }: { asset: Asset; ticket: TradeTicket; rules: TradingRules }) {
    const durations = rules.durations_seconds;
    const durationIndex = Math.max(0, durations.indexOf(ticket.duration));
    const payoutPercent = (asset.payout_rate_bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    return (
        <div className="flex min-h-full flex-col gap-2.5 p-2.5">
            <div className={`flex items-center justify-center gap-1.5 rounded-lg py-1 text-[10px] font-bold tracking-wider uppercase ${ticket.isReal ? 'bg-real-soft text-real' : 'bg-demo-soft text-demo'}`}>
                <span className={`size-1.5 rounded-full ${ticket.isReal ? 'bg-real' : 'bg-demo'}`} aria-hidden="true" />
                {ticket.isReal ? 'Conta real' : 'Conta demo'}
            </div>

            <div className={`rounded-xl border bg-ink-950 px-2.5 py-2 transition-colors focus-within:border-ink-600 ${ticket.stakeError || ticket.shortfall ? 'border-down/60' : 'border-ink-800'}`}>
                <label className="text-[10px] font-semibold tracking-wide text-text-3 uppercase" htmlFor="stake">
                    Valor
                </label>
                <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-xs text-text-3">R$</span>
                    <input
                        id="stake"
                        className="numeric w-full min-w-0 bg-transparent text-[17px] font-medium text-text-1 outline-none"
                        inputMode="decimal"
                        value={ticket.amount}
                        aria-invalid={ticket.stakeError !== null}
                        onChange={(event) => ticket.setAmount(event.target.value)}
                    />
                    <StepButtons plusLabel="Aumentar valor" minusLabel="Diminuir valor" onPlus={() => ticket.nudgeAmount(1000)} onMinus={() => ticket.nudgeAmount(-1000)} />
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-0.5" role="group" aria-label="Valores rápidos">
                    {QUICK_AMOUNTS.filter((cents) => cents <= rules.max_stake_cents).map((cents) => (
                        <button
                            key={cents}
                            type="button"
                            className={`numeric h-5 rounded-[5px] text-[10px] font-semibold transition-colors ${ticket.stakeCents === cents ? 'bg-ink-700 text-text-1' : 'text-text-3 hover:bg-ink-800 hover:text-text-1'}`}
                            aria-pressed={ticket.stakeCents === cents}
                            onClick={() => ticket.setAmount((cents / 100).toString())}
                        >
                            {cents / 100}
                        </button>
                    ))}
                </div>
            </div>
            {ticket.stakeError && <p className="-mt-1 text-[11px] leading-snug text-down">{ticket.stakeError}</p>}

            <div className="rounded-xl border border-ink-800 bg-ink-950 px-2.5 py-2">
                <span className="text-[10px] font-semibold tracking-wide text-text-3 uppercase" id="duration-label">
                    Prazo
                </span>
                <div className="mt-0.5 flex items-center gap-1">
                    <Clock3 size={14} className="shrink-0 text-text-3" aria-hidden="true" />
                    <span className="numeric flex-1 text-[17px] font-medium" aria-live="polite" aria-labelledby="duration-label">
                        {formatDuration(ticket.duration)}
                    </span>
                    <StepButtons
                        plusLabel="Aumentar prazo"
                        minusLabel="Diminuir prazo"
                        plusDisabled={durationIndex >= durations.length - 1}
                        minusDisabled={durationIndex === 0}
                        onPlus={() => ticket.setDuration(durations[Math.min(durations.length - 1, durationIndex + 1)])}
                        onMinus={() => ticket.setDuration(durations[Math.max(0, durationIndex - 1)])}
                    />
                </div>
            </div>

            <div className="pt-1 text-center">
                <div className="text-[10px] font-semibold tracking-wide text-text-3 uppercase">Lucro</div>
                <div className="numeric text-[32px] leading-tight font-light text-up">+{payoutPercent}%</div>
                <div className="numeric text-[13px] font-semibold text-up">+{formatCents(ticket.profitCents)}</div>
            </div>

            <div className="flex flex-col gap-2">
                <DirectionButton direction="call" ticket={ticket} />
                <DirectionButton direction="put" ticket={ticket} />
            </div>

            <Notices ticket={ticket} />

            <p className="mt-auto pt-1 text-center text-[10px] leading-relaxed text-text-3">
                <a href="/riscos" className="underline hover:text-text-1">
                    Regras e riscos
                </a>
            </p>

            <ConfirmationModal ticket={ticket} asset={asset} />
        </div>
    );
}
