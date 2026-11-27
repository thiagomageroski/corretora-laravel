const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let displayTimezone: string | undefined;

/**
 * Applies the account's timezone preference to every date on screen.
 */
export function setDisplayTimezone(timezone: string): void {
    displayTimezone = timezone === 'auto' ? undefined : timezone;
}

export function formatCents(cents: number): string {
    return money.format(cents / 100);
}

export function formatSignedCents(cents: number): string {
    return `${cents > 0 ? '+' : ''}${formatCents(cents)}`;
}

export function priceDecimals(price: number): number {
    const magnitude = Math.abs(price);

    if (magnitude >= 1000) return 2;
    if (magnitude >= 1) return 4;
    if (magnitude >= 0.01) return 6;

    return 8;
}

export function formatPrice(price: string | number | null | undefined): string {
    if (price === null || price === undefined) return '—';

    const value = Number(price);

    if (!Number.isFinite(value)) return '—';

    const decimals = priceDecimals(value);

    return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';

    return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function changePercent(price: string | number, open: string | number | null | undefined): number | null {
    const base = Number(open);

    return base > 0 ? ((Number(price) - base) / base) * 100 : null;
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';

    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: displayTimezone });
}

export function formatChartTime(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: displayTimezone });
}

export function formatClock(date: Date): string {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short', timeZone: displayTimezone });
}

export function formatDuration(seconds: number): string {
    return seconds < 3600 ? `${seconds / 60} min` : `${seconds / 3600} h`;
}

export function formatCountdown(milliseconds: number): string {
    const total = Math.max(0, Math.ceil(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');

    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${String(minutes).padStart(2, '0')}:${seconds}`;
}

export function potentialProfitCents(stakeCents: number, payoutBps: number): number {
    return Math.floor((stakeCents * payoutBps) / 10_000);
}

/**
 * Win rate needed to break even over many equal contracts at this payout.
 */
export function breakEvenRate(payoutBps: number): number {
    return (1 / (1 + payoutBps / 10_000)) * 100;
}

/**
 * Axis labels in the display timezone. Tick mark types follow Lightweight
 * Charts: 0 year, 1 month, 2 day of month, 3 time, 4 time with seconds.
 */
export function formatTickMark(time: unknown, tickMarkType: number): string {
    const date = new Date((time as number) * 1000);
    const timeZone = displayTimezone;

    if (tickMarkType === 0) return date.toLocaleDateString('pt-BR', { year: 'numeric', timeZone });
    if (tickMarkType === 1) return date.toLocaleDateString('pt-BR', { month: 'short', timeZone }).replace('.', '');
    if (tickMarkType === 2) return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone });
    if (tickMarkType === 4) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone });

    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
}

const PROVIDER_NAMES: Record<string, string> = { binance: 'Binance', twelvedata: 'Twelve Data' };

export function providerName(code: string): string {
    return PROVIDER_NAMES[code] ?? code;
}

export function providerLabel(asset: { provider: string | null; provider_configured: boolean }): string {
    if (!asset.provider) return 'Não configurada';

    const name = providerName(asset.provider);

    return asset.provider_configured ? name : `${name} (sem chave)`;
}

/**
 * Where the price sits inside its 24-hour range, from 0 to 100.
 */
export function rangePosition(price: string | number | null | undefined, low: string | null | undefined, high: string | null | undefined): number | null {
    const [value, floor, ceiling] = [Number(price), Number(low), Number(high)];

    if (price === null || price === undefined || !low || !high || !(ceiling > floor)) return null;

    return Math.min(100, Math.max(0, ((value - floor) / (ceiling - floor)) * 100));
}

export const RESULT_LABELS: Record<string, string> = {
    won: 'Positivo',
    lost: 'Negativo',
    neutral: 'Neutro',
    voided: 'Anulada',
};

export const ENTRY_LABELS: Record<string, string> = {
    demo_grant: 'Saldo virtual inicial',
    demo_reset: 'Reinício do saldo',
    position_reserve: 'Reserva de operação',
    position_settlement: 'Liquidação de operação',
    deposit_credit: 'Depósito PIX',
    deposit_reversal: 'Estorno de depósito',
    withdrawal_reserve: 'Saque solicitado',
    withdrawal_payout: 'Saque enviado',
    withdrawal_release: 'Saque devolvido',
    admin_adjustment: 'Ajuste administrativo',
};

export const CATEGORY_LABELS: Record<string, string> = {
    forex: 'Pares de moedas',
    crypto: 'Criptoativos',
    stocks: 'Empresas globais',
    indices: 'Bolsas mundiais',
    commodities: 'Metais, energia e agro',
    etfs: 'Fundos negociados',
};
