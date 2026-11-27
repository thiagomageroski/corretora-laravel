import { create } from 'zustand';
import { api } from '@/lib/api';
import { setDisplayTimezone } from '@/lib/format';
import type { Preferences } from '@/lib/types';

export const DEFAULT_PREFERENCES: Preferences = {
    chart_type: 'candles',
    chart_interval: '1m',
    chart_indicators: [],
    chart_animations: true,
    default_stake_cents: 5000,
    default_duration_seconds: 60,
    confirm_before_trade: false,
    sound_on_settlement: false,
    hide_balance: false,
    timezone: 'auto',
    interface_scale: 100,
    chart_position_lines: true,
    chart_stake_labels: true,
    chart_legend: true,
    keyboard_shortcuts: false,
    notify_settlement_toast: true,
    email_transactions: true,
    email_product_news: true,
    email_promotions: false,
};

/** Below this width the scale is not applied: phone browsers misplace fixed elements (toasts, drawers) under a page zoom. */
const SCALE_MIN_WIDTH_QUERY = '(min-width: 1024px)';

let requestedScale = 100;
let watchingWidth = false;

/**
 * Scales the whole interface, like a browser zoom limited to this site, on
 * computer-sized screens only. Phones already zoom natively.
 */
function applyInterfaceScale(scale: number): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    requestedScale = scale;
    const query = window.matchMedia?.(SCALE_MIN_WIDTH_QUERY);
    const render = () => {
        const applies = query?.matches ?? true;
        document.documentElement.style.zoom = !applies || requestedScale === 100 ? '' : String(requestedScale / 100);
    };

    render();

    if (query && !watchingWidth) {
        watchingWidth = true;
        query.addEventListener('change', render);
    }
}

type PreferencesState = {
    preferences: Preferences;
    /** The chart's working state; it starts from the saved defaults and survives switching assets. */
    chart: { type: Preferences['chart_type']; interval: string; indicators: string[] };
    seededFor: number | null;
    seed: (preferences: Preferences | null | undefined, userId: number | null | undefined) => void;
    save: (changes: Partial<Preferences>) => Promise<void>;
    setChart: (changes: Partial<PreferencesState['chart']>) => void;
    /** Takes preferences the server already saved, such as after a reset. */
    replace: (preferences: Preferences) => void;
};

export const usePreferences = create<PreferencesState>((set, get) => ({
    preferences: DEFAULT_PREFERENCES,
    chart: { type: DEFAULT_PREFERENCES.chart_type, interval: DEFAULT_PREFERENCES.chart_interval, indicators: DEFAULT_PREFERENCES.chart_indicators },
    seededFor: null,
    seed: (preferences, userId) => {
        if (!preferences || !userId || get().seededFor === userId) return;

        setDisplayTimezone(preferences.timezone);
        applyInterfaceScale(preferences.interface_scale ?? 100);
        set({
            preferences,
            seededFor: userId,
            chart: { type: preferences.chart_type, interval: preferences.chart_interval, indicators: preferences.chart_indicators },
        });
    },
    save: async (changes) => {
        const previous = get().preferences;
        const optimistic = { ...previous, ...changes };
        setDisplayTimezone(optimistic.timezone);
        applyInterfaceScale(optimistic.interface_scale);
        set({ preferences: optimistic });

        try {
            const response = await api<{ preferences: Preferences }>('/account/preferences', { method: 'PATCH', body: changes });
            set({ preferences: response.preferences });
        } catch (error) {
            setDisplayTimezone(previous.timezone);
            applyInterfaceScale(previous.interface_scale);
            set({ preferences: previous });

            throw error;
        }
    },
    setChart: (changes) => set((state) => ({ chart: { ...state.chart, ...changes } })),
    replace: (preferences) => {
        setDisplayTimezone(preferences.timezone);
        applyInterfaceScale(preferences.interface_scale);
        set({ preferences, chart: { type: preferences.chart_type, interval: preferences.chart_interval, indicators: preferences.chart_indicators } });
    },
}));

export function motionAllowed(): boolean {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    return !reduced && usePreferences.getState().preferences.chart_animations;
}
