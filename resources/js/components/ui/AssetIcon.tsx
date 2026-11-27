import { Bean, Candy, Coffee, Droplet, Flame, Wheat, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { ICON_FLAGS, ICON_LOGOS } from '@/lib/assetIconFiles';

/** Currency to the flag that stands for it. */
const CURRENCY_FLAG: Record<string, string> = {
    EUR: 'eu',
    USD: 'us',
    GBP: 'gb',
    JPY: 'jp',
    CHF: 'ch',
    AUD: 'au',
    CAD: 'ca',
    NZD: 'nz',
    BRL: 'br',
    MXN: 'mx',
    ZAR: 'za',
    TRY: 'tr',
    SEK: 'se',
    NOK: 'no',
    DKK: 'dk',
    PLN: 'pl',
    SGD: 'sg',
    HKD: 'hk',
    CZK: 'cz',
    HUF: 'hu',
    INR: 'in',
    CNH: 'cn',
    THB: 'th',
};

/** Stock index to the country of its exchange. */
const INDEX_FLAG: Record<string, string> = { SPX: 'us', NDX: 'us', DJI: 'us', RUT: 'us', DAX: 'de', UKX: 'gb', PX1: 'fr', N225: 'jp', IBOV: 'br', SX5E: 'eu' };

/** Metals carry their chemical symbol on a metallic disc. */
const METALS: Record<string, { label: string; from: string; to: string; ink: string }> = {
    'XAU/USD': { label: 'Au', from: '#f6d77a', to: '#b8860b', ink: '#3b2a02' },
    'XAG/USD': { label: 'Ag', from: '#f1f3f6', to: '#9aa3ad', ink: '#23282e' },
    'XPT/USD': { label: 'Pt', from: '#e6e9ee', to: '#7d8794', ink: '#1f242b' },
    'XPD/USD': { label: 'Pd', from: '#dfe3e8', to: '#8a8f99', ink: '#1f242b' },
    COPPER: { label: 'Cu', from: '#f0a57a', to: '#a4502a', ink: '#2c1206' },
};

const COMMODITIES: Record<string, { icon: LucideIcon; background: string; color: string }> = {
    WTI: { icon: Droplet, background: '#1c1f26', color: '#e8b04a' },
    BRENT: { icon: Droplet, background: '#1c1f26', color: '#f08c3a' },
    NATGAS: { icon: Flame, background: '#123a6b', color: '#7cc4ff' },
    COFFEE: { icon: Coffee, background: '#5b3a24', color: '#f3d3b5' },
    SUGAR: { icon: Candy, background: '#e9e4dc', color: '#8a6d4a' },
    CORN: { icon: Wheat, background: '#f2c94c', color: '#5f4b0b' },
    SOYBEAN: { icon: Bean, background: '#b8a46a', color: '#3f3517' },
    WHEAT: { icon: Wheat, background: '#d9a95b', color: '#4a3010' },
};

/** Fund issuers and the ETFs they run, as a coloured mark with the ticker. */
/** Site icons drawn in white: a dark disc keeps them visible. */
const LIGHT_MARKS = new Set(['imx-usd']);

const ETF_COLORS: Record<string, string> = { SPY: '#c8102e', DIA: '#c8102e', XLF: '#c8102e', GLD: '#c9a227', SLV: '#8f99a5', QQQ: '#4b2c86', IWM: '#1f1f1f', VTI: '#96151d', VOO: '#96151d', ARKK: '#000000' };

/** A steady colour per symbol for assets without a logo. */
function hashColor(text: string): string {
    let hash = 0;

    for (const char of text) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return `hsl(${hash % 360} 45% 34%)`;
}

export function iconKey(symbol: string): string {
    return symbol.replace('/', '-').replace('.', '-').toLowerCase();
}

function Flag({ code, size, className = '' }: { code: string; size: number; className?: string }) {
    return ICON_FLAGS.has(code) ? (
        <img src={`/asset-icons/flags/${code}.svg`} alt="" width={size} height={size} loading="lazy" className={`shrink-0 rounded-full object-cover ring-2 ring-ink-900 ${className}`} style={{ width: size, height: size }} />
    ) : (
        <span className={`grid shrink-0 place-items-center rounded-full bg-ink-700 text-[8px] font-bold uppercase ring-2 ring-ink-900 ${className}`} style={{ width: size, height: size }}>
            {code}
        </span>
    );
}

function Initials({ symbol, size, background }: { symbol: string; size: number; background?: string }) {
    const text = symbol.split(/[/.]/)[0].slice(0, symbol.length <= 3 ? 3 : 2);

    return (
        <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: background ?? hashColor(symbol), fontSize: Math.max(8, size * (text.length > 2 ? 0.3 : 0.36)) }}>
            {text}
        </span>
    );
}

/**
 * The icon of an asset, as brokers show it: two flags for a currency pair,
 * the exchange's flag for an index, the logo for a coin or a company, a
 * symbol for commodities. Every image is served by the platform itself.
 */
export const AssetIcon = memo(function AssetIcon({ symbol, category, size = 28, className = '' }: { symbol: string; category?: string | null; size?: number; className?: string }) {
    const metal = METALS[symbol];
    const commodity = COMMODITIES[symbol];
    const [base, quote] = symbol.split('/');
    const isPair = category !== 'crypto' && quote !== undefined && CURRENCY_FLAG[base] !== undefined && CURRENCY_FLAG[quote] !== undefined;
    const logo = ICON_LOGOS[iconKey(symbol)];
    const wrapper = `relative inline-flex shrink-0 ${className}`;

    if (metal) {
        return (
            <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
                <span
                    className="grid size-full place-items-center rounded-full font-extrabold shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]"
                    style={{ background: `linear-gradient(135deg, ${metal.from}, ${metal.to})`, color: metal.ink, fontSize: size * 0.38 }}
                >
                    {metal.label}
                </span>
            </span>
        );
    }

    if (commodity) {
        const Icon = commodity.icon;

        return (
            <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
                <span className="grid size-full place-items-center rounded-full" style={{ background: commodity.background, color: commodity.color }}>
                    <Icon size={size * 0.56} strokeWidth={2.2} />
                </span>
            </span>
        );
    }

    if (isPair) {
        const small = Math.round(size * 0.72);

        return (
            <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
                <Flag code={CURRENCY_FLAG[base]} size={small} className="absolute top-0 left-0" />
                <Flag code={CURRENCY_FLAG[quote]} size={small} className="absolute right-0 bottom-0" />
            </span>
        );
    }

    if (INDEX_FLAG[symbol]) {
        return (
            <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
                <Flag code={INDEX_FLAG[symbol]} size={size} />
            </span>
        );
    }

    if (logo) {
        return (
            <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
                {logo === 'svg' ? (
                    <img src={`/asset-icons/logos/${iconKey(symbol)}.svg`} alt="" width={size} height={size} loading="lazy" className="size-full rounded-full object-contain" />
                ) : (
                    // Site icons are square marks: shown on a white disc, like brokers do.
                    <span className={`grid size-full place-items-center overflow-hidden rounded-full ${LIGHT_MARKS.has(iconKey(symbol)) ? 'bg-[#111418]' : 'bg-white'}`}>
                        <img src={`/asset-icons/logos/${iconKey(symbol)}.png`} alt="" width={size} height={size} loading="lazy" className="size-[72%] object-contain" />
                    </span>
                )}
            </span>
        );
    }

    return (
        <span className={wrapper} style={{ width: size, height: size }} aria-hidden="true">
            <Initials symbol={symbol} size={size} background={category === 'etfs' || ETF_COLORS[symbol] ? (ETF_COLORS[symbol] ?? undefined) : undefined} />
        </span>
    );
});
