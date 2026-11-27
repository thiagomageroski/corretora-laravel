import { CheckCircle2, Info, MinusCircle, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToasts, type Toast } from '@/stores/toasts';

function useEscape(active: boolean, onClose: () => void) {
    useEffect(() => {
        if (!active) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [active, onClose]);
}

/**
 * Side panel over the current page, so a running chart stays on screen behind it.
 */
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
    const panel = useRef<HTMLDivElement>(null);
    useEscape(open, onClose);

    useEffect(() => {
        if (open) panel.current?.focus();
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
            <button type="button" aria-label="Fechar" className="absolute inset-0 animate-fade cursor-default bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
            <div
                ref={panel}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative flex h-full w-full max-w-[560px] animate-slide-in flex-col border-l border-ink-700 bg-gradient-to-b from-ink-900 to-ink-950 shadow-[var(--shadow-float)] outline-none"
            >
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink-800 px-5">
                    <h2 className="text-base font-bold">{title}</h2>
                    <button type="button" aria-label="Fechar painel" className="grid size-9 place-items-center rounded-lg text-text-2 hover:bg-ink-800 hover:text-text-1" onClick={onClose}>
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>
                <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
    useEscape(open, onClose);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button type="button" aria-label="Fechar" className="absolute inset-0 animate-fade cursor-default bg-black/65 backdrop-blur-[4px]" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label={title} className="panel relative w-full max-w-md animate-toast !rounded-2xl p-6 shadow-[var(--shadow-float)]">
                <h2 className="text-lg font-bold">{title}</h2>
                <div className="mt-4">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

/**
 * Small menu anchored to its trigger; closes on outside click and Escape.
 */
export function Popover({
    trigger,
    children,
    align = 'left',
    side = 'bottom',
    label,
}: {
    trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
    children: (close: () => void) => ReactNode;
    align?: 'left' | 'right';
    /** 'right' opens beside the trigger and grows upwards, for controls at the bottom of a panel. */
    side?: 'bottom' | 'right';
    label: string;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const close = () => setOpen(false);
    useEscape(open, close);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        window.addEventListener('pointerdown', onPointerDown);

        return () => window.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    return (
        <div ref={root} className="relative inline-flex">
            {trigger({ open, toggle: () => setOpen((current) => !current) })}
            {open && (
                <div
                    role="menu"
                    aria-label={label}
                    className={`absolute z-40 min-w-56 animate-pop rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-[var(--shadow-float)] ${side === 'right' ? 'bottom-0 left-full ml-2' : `top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'}`}`}
                >
                    {children(close)}
                </div>
            )}
        </div>
    );
}

const TOAST_STYLE: Record<Toast['tone'], { icon: ReactNode; border: string }> = {
    up: { icon: <CheckCircle2 size={20} className="text-up" aria-hidden="true" />, border: 'border-up/40' },
    down: { icon: <XCircle size={20} className="text-down" aria-hidden="true" />, border: 'border-down/40' },
    neutral: { icon: <MinusCircle size={20} className="text-text-2" aria-hidden="true" />, border: 'border-ink-600' },
    info: { icon: <Info size={20} className="text-info" aria-hidden="true" />, border: 'border-ink-600' },
};

export function ToastHost() {
    const { toasts, dismiss } = useToasts();

    return createPortal(
        <div
            className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] mx-auto flex max-w-[400px] flex-col items-stretch gap-2 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:mx-0 sm:w-[360px]"
            aria-live="polite"
        >
            {toasts.map((toast) => (
                <div key={toast.id} className={`glass pointer-events-auto relative flex animate-toast items-start gap-3 overflow-hidden rounded-2xl border p-3.5 pb-4 shadow-[var(--shadow-float)] ${TOAST_STYLE[toast.tone].border}`}>
                    <span className="mt-0.5 shrink-0">{TOAST_STYLE[toast.tone].icon}</span>
                    <div className="min-w-0 flex-1">
                        <div className="font-semibold">{toast.title}</div>
                        {toast.detail && <div className="mt-0.5 text-xs text-text-2">{toast.detail}</div>}
                    </div>
                    <button type="button" aria-label="Dispensar" className="shrink-0 rounded-md text-text-3 transition-colors hover:text-text-1" onClick={() => dismiss(toast.id)}>
                        <X size={15} aria-hidden="true" />
                    </button>
                    <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left animate-toast-life bg-gradient-to-r from-transparent via-text-3/60 to-text-3/60" aria-hidden="true" />
                </div>
            ))}
        </div>,
        document.body,
    );
}
