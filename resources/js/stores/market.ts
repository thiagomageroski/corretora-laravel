import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { isCurrentTick } from '@/lib/liveChart';
import type { Tick } from '@/lib/types';

export type FeedStatus = 'connecting' | 'realtime' | 'polling' | 'offline';

type MarketState = {
    ticks: Record<number, Tick>;
    status: FeedStatus;
    applyTicks: (ticks: Tick[]) => void;
    setStatus: (status: FeedStatus) => void;
};

export const useMarket = create<MarketState>((set) => ({
    ticks: {},
    status: 'connecting',
    applyTicks: (incoming) =>
        set((state) => {
            const ticks = { ...state.ticks };

            for (const tick of incoming) {
                if (isCurrentTick(tick.source_at, ticks[tick.asset_id]?.source_at)) {
                    ticks[tick.asset_id] = tick;
                }
            }

            return { ticks };
        }),
    setStatus: (status) => set({ status }),
}));

const POLL_INTERVAL_MS = 3000;

let echo: Echo<'reverb'> | null = null;
let pollTimer: number | null = null;
let pollingAllowed = false;

export function getEcho(): Echo<'reverb'> | null {
    return echo;
}

async function pollOnce(): Promise<void> {
    try {
        const { data } = await api<{ data: Tick[] }>('/quotes');
        useMarket.getState().applyTicks(data);

        if (useMarket.getState().status !== 'realtime') {
            useMarket.getState().setStatus('polling');
        }
    } catch {
        if (useMarket.getState().status !== 'realtime') {
            useMarket.getState().setStatus('offline');
        }
    }
}

function startPolling(): void {
    if (pollTimer === null) {
        void pollOnce();
        pollTimer = window.setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    }
}

function stopPolling(): void {
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Starts the shared quote feed once per page load: WebSocket when Reverb is
 * reachable, polling the stored quotes whenever it is not. Public pages have no
 * session for the polling route, so they only use the public channel.
 */
export function startMarketFeed({ polling = true }: { polling?: boolean } = {}): void {
    if (polling) {
        pollingAllowed = true;
        startPolling();
    }

    if (echo !== null) {
        return;
    }

    const key = import.meta.env.VITE_REVERB_APP_KEY as string | undefined;

    if (!key) {
        return;
    }

    (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

    /**
     * A local "localhost" setting would point a phone on the same network at
     * itself, so the page's own host is used instead; real domains are kept.
     */
    const realtimeHost = (): string => {
        const configured = import.meta.env.VITE_REVERB_HOST as string | undefined;

        return !configured || configured === 'localhost' || configured === '127.0.0.1' ? window.location.hostname : configured;
    };

    const scheme = (import.meta.env.VITE_REVERB_SCHEME as string | undefined) ?? 'http';
    const port = Number(import.meta.env.VITE_REVERB_PORT ?? 8080);

    echo = new Echo({
        broadcaster: 'reverb',
        key,
        wsHost: realtimeHost(),
        wsPort: port,
        wssPort: port,
        forceTLS: scheme === 'https',
        enabledTransports: ['ws', 'wss'],
    });

    echo.channel('market.quotes').listen('.quotes.updated', (event: { quotes: Tick[] }) => {
        useMarket.getState().applyTicks(event.quotes);
    });

    echo.connector.pusher.connection.bind('state_change', ({ current }: { current: string }) => {
        if (current === 'connected') {
            stopPolling();
            useMarket.getState().setStatus('realtime');
        } else {
            if (useMarket.getState().status === 'realtime') {
                useMarket.getState().setStatus('polling');
            }

            if (pollingAllowed) {
                startPolling();
            }
        }
    });
}
