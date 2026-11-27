import { useMemo, useState } from 'react';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { formatCents, potentialProfitCents } from '@/lib/format';
import type { Asset, Position, TradingRules, WalletSummary } from '@/lib/types';
import { usePreferences } from '@/stores/preferences';
import { useTicket } from '@/stores/ticket';

export type Direction = 'call' | 'put';

function blockedReason(asset: Asset, hasFreshQuote: boolean): string | null {
    if (!asset.provider) return 'Este ativo ainda não tem provedor de dados configurado.';
    if (!asset.provider_configured) return 'O provedor deste ativo precisa de uma chave de API.';
    if (!asset.tradable) return 'Disponível só para visualização: este provedor não oferece preço de encerramento com precisão de segundos.';
    if (!asset.market_open) return `Mercado fechado. Horário: ${asset.session_label}.`;
    if (!hasFreshQuote) return 'Aguardando cotação recente do provedor.';

    return null;
}

/**
 * The state behind both ticket layouts, so desktop and mobile share one order.
 * The server still validates everything and decides prices.
 */
export function useTradeTicket({ asset, wallet, rules, hasFreshQuote, onOpened }: { asset: Asset; wallet: WalletSummary; rules: TradingRules; hasFreshQuote: boolean; onOpened: (position: Position) => void }) {
    const preferences = usePreferences((state) => state.preferences);
    const [amount, setAmount] = useState((preferences.default_stake_cents / 100).toString());
    const sharedDuration = useTicket((state) => state.durationSeconds);
    const setDuration = useTicket((state) => state.setDurationSeconds);
    const fallbackDuration = rules.durations_seconds.includes(preferences.default_duration_seconds) ? preferences.default_duration_seconds : rules.durations_seconds[0];
    const duration = sharedDuration !== null && rules.durations_seconds.includes(sharedDuration) ? sharedDuration : fallbackDuration;
    const [submitting, setSubmitting] = useState<Direction | null>(null);
    const [pendingConfirmation, setPendingConfirmation] = useState<Direction | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Set when the person tries to trade more than they have; the warning waits for that attempt. */
    const [triedWithoutBalance, setTriedWithoutBalance] = useState(false);

    const stakeCents = useMemo(() => {
        const value = Math.round(Number(amount.replace(',', '.')) * 100);

        return Number.isFinite(value) ? value : 0;
    }, [amount]);

    /** Typing mistakes, shown as soon as they happen. */
    const stakeError = stakeCents < rules.min_stake_cents ? `Mínimo de ${formatCents(rules.min_stake_cents)}.` : stakeCents > rules.max_stake_cents ? `Máximo de ${formatCents(rules.max_stake_cents)}.` : null;
    const isReal = wallet.environment === 'real';
    const missingCents = Math.max(0, stakeCents - wallet.available_cents);
    const shortfall = triedWithoutBalance && stakeError === null && missingCents > 0 ? { title: `Saldo ${isReal ? 'real' : 'demo'} insuficiente`, missing: formatCents(missingCents), available: formatCents(wallet.available_cents) } : null;

    const blocked = blockedReason(asset, hasFreshQuote);

    const send = async (direction: Direction) => {
        setPendingConfirmation(null);
        setSubmitting(direction);
        setError(null);

        try {
            const { data } = await api<{ data: Position }>('/positions', {
                method: 'POST',
                body: { asset_id: asset.id, direction, stake_cents: stakeCents, duration_seconds: duration, idempotency_key: newIdempotencyKey(), environment: wallet.environment ?? 'demo' },
            });
            onOpened(data);
        } catch (exception) {
            setError(exception instanceof ApiError ? exception.message : 'Não foi possível abrir a operação.');
        } finally {
            setSubmitting(null);
        }
    };

    const attempt = (direction: Direction) => {
        if (missingCents > 0) {
            setError(null);
            setTriedWithoutBalance(true);

            return;
        }

        setTriedWithoutBalance(false);

        if (preferences.confirm_before_trade) {
            setPendingConfirmation(direction);
        } else {
            void send(direction);
        }
    };

    const nudgeAmount = (deltaCents: number) => {
        const next = Math.min(rules.max_stake_cents, Math.max(rules.min_stake_cents, stakeCents + deltaCents));
        setAmount((next / 100).toString());
    };

    return {
        amount,
        setAmount,
        duration,
        setDuration,
        stakeCents,
        stakeError,
        blocked,
        error,
        submitting,
        pendingConfirmation,
        cancelConfirmation: () => setPendingConfirmation(null),
        confirm: () => (pendingConfirmation ? void send(pendingConfirmation) : undefined),
        isReal,
        shortfall,
        // A missing balance does not disable the buttons: pressing them is what explains it.
        disabled: blocked !== null || stakeError !== null || submitting !== null,
        profitCents: potentialProfitCents(stakeCents, asset.payout_rate_bps),
        nudgeAmount,
        open: attempt,
    };
}

export type TradeTicket = ReturnType<typeof useTradeTicket>;
