import { create } from 'zustand';

export type AccountTab = 'profile' | 'notifications' | 'preferences' | 'payments' | 'security' | 'account' | 'demo';

type AccountPanelState = {
    open: boolean;
    tab: AccountTab;
    show: (tab?: AccountTab) => void;
    close: () => void;
    setTab: (tab: AccountTab) => void;
};

export const useAccountPanel = create<AccountPanelState>((set) => ({
    open: false,
    tab: 'profile',
    show: (tab = 'profile') => set({ open: true, tab }),
    close: () => set({ open: false }),
    setTab: (tab) => set({ tab }),
}));
