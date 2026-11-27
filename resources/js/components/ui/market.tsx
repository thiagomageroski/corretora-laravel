import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useRef } from 'react';
import { formatCents, formatPrice, rangePosition } from '@/lib/format';
import type { Asset } from '@/lib/types';
import { useMarket, type FeedStatus } from '@/stores/market';
import { usePreferences } from '@/stores/preferences';

/** Both live transports (websocket and the 3 s fallback) deliver every quote, so both read as live. */
const FEED_LABELS: Record<FeedStatus, { label: string; color: string; text: string; pulse: boolean }> = {
    connecting: { label: 'Conectando', color: 'bg-text-3', text: 'text-text-2', pulse: false },
    realtime: { label: 'Ao vivo', color: 'bg-up', text: 'text-up', pulse: true },
    polling: { label: 'Ao vivo', color: 'bg-up', text: 'text-up', pulse: true },
    offline: { label: 'Sem conexão', color: 'bg-down', text: 'text-down', pulse: false },
};

export function LiveDot({ color = 'bg-up', pulse = true }: { color?: string; pulse?: boolean }) {
    return (
        <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
            {pulse && <span className={`absolute inset-0 animate-live-ring rounded-full ${color}`} />}
            <span className={`relative size-2 rounded-full ${color}`} />
        </span>
    );
}

export function FeedIndicator() {
    const status = useMarket((state) => state.status);
    const { label, color, text, pulse } = FEED_LABELS[status];

    return (
        <span className={`inline-flex items-center gap-2 text-xs font-semibold whitespace-nowrap ${text}`} role="status">
            <LiveDot color={color} pulse={pulse} />
            {label}
        </span>
    );
}

const DATA_LABELS: Record<Asset['data_status'], { label: string; className: string }> = {
    live: { label: 'Ao vivo', className: 'bg-up-soft text-up' },
    delayed: { label: 'Atrasado', className: 'bg-demo-soft text-demo' },
    unavailable: { label: 'Sem dados', className: 'bg-ink-800 text-text-3' },
};

export function DataStatus({ status }: { status: Asset['data_status'] }) {
    const { label, className } = DATA_LABELS[status];

    return <span className={`inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-bold tracking-wide uppercase ${className}`}>{label}</span>;
}

export function Change({ value, size = 13 }: { value: number | null | undefined; size?: number }) {
    if (value === null || value === undefined) {
        return <span className="numeric text-text-3">—</span>;
    }

    const up = value > 0;
    const down = value < 0;
    const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

    return (
        <span className={`numeric inline-flex items-center gap-0.5 ${up ? 'text-up' : down ? 'text-down' : 'text-text-2'}`}>
            <Icon size={size} aria-hidden="true" />
            {Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
        </span>
    );
}

/**
 * A price that briefly flashes in the direction of each real change. Remounting
 * on the value restarts the CSS animation without any timers.
 */
export function LivePrice({ price, className = '' }: { price: string | number | null | undefined; className?: string }) {
    const previous = useRef<number | null>(null);
    const value = price === null || price === undefined ? null : Number(price);
    const flash = previous.current === null || value === null || value === previous.current ? '' : value > previous.current ? 'flash-up' : 'flash-down';
    previous.current = value;

    return (
        <span key={value ?? 'empty'} className={`numeric inline-block ${flash} ${className}`}>
            {formatPrice(price)}
        </span>
    );
}

/**
 * Where the price sits between the 24-hour low and high.
 */
export function RangeBar({ price, low, high }: { price: string | number | null | undefined; low: string | null | undefined; high: string | null | undefined }) {
    const position = rangePosition(price, low, high);

    if (position === null) {
        return <span className="numeric text-text-3">—</span>;
    }

    return (
        <span className="block w-full min-w-20" title={`Mínima ${formatPrice(low)} · Máxima ${formatPrice(high)}`} aria-label={`Preço a ${Math.round(position)}% da amplitude de 24 horas`} role="img">
            <span className="relative block h-1 rounded-full bg-ink-700">
                <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-1 ring-2 ring-ink-900 transition-[left] duration-500" style={{ left: `${position}%` }} />
            </span>
        </span>
    );
}

/**
 * A balance that respects the account's privacy preference.
 */
export function Money({ cents, className = '' }: { cents: number; className?: string }) {
    const hidden = usePreferences((state) => state.preferences.hide_balance);

    return <span className={`numeric ${className}`}>{hidden ? 'R$ ••••••' : formatCents(cents)}</span>;
}
