import { router } from '@inertiajs/react';
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Environment, WalletSummary } from '@/lib/types';

type WalletState = {
    summary: WalletSummary | null;
    set: (summary: WalletSummary | null) => void;
    refresh: () => Promise<void>;
    select: (environment: Environment) => Promise<void>;
};

/**
 * Display copy of the balance of the account the pages show, demo or real.
 * The server stays the source of truth: this store only holds values it returned.
 */
export const useWallet = create<WalletState>((set, get) => ({
    summary: null,
    set: (summary) => set({ summary }),
    refresh: async () => {
        const environment = get().summary?.environment;
        set({ summary: await api<WalletSummary>(environment ? `/wallet?environment=${environment}` : '/wallet') });
    },
    select: async (environment) => {
        await api('/wallet/environment', { method: 'PUT', body: { environment } });
        // Every page holds lists and totals for one account, so reload it from scratch.
        router.visit(window.location.pathname + window.location.search, { preserveState: false, preserveScroll: true });
    },
}));
