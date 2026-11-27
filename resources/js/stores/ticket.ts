import { create } from 'zustand';

/**
 * The expiry chosen in the trade ticket, shared so the chart can draw where
 * a trade opened now would close, and so the phone and desktop tickets agree.
 */
type TicketState = {
    durationSeconds: number | null;
    setDurationSeconds: (seconds: number) => void;
};

export const useTicket = create<TicketState>((set) => ({
    durationSeconds: null,
    setDurationSeconds: (seconds) => set({ durationSeconds: seconds }),
}));
