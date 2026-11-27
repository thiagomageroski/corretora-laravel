import { create } from 'zustand';

export type Toast = { id: number; tone: 'up' | 'down' | 'neutral' | 'info'; title: string; detail?: string };

type ToastState = {
    toasts: Toast[];
    push: (toast: Omit<Toast, 'id'>) => void;
    dismiss: (id: number) => void;
};

const TOAST_LIFETIME_MS = 6000;
let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
    toasts: [],
    push: (toast) => {
        const id = nextId++;
        set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
        window.setTimeout(() => get().dismiss(id), TOAST_LIFETIME_MS);
    },
    dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
