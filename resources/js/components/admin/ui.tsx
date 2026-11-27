import { Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '@/components/ui';
import type { AdminPage, Tone } from '@/lib/admin';

const TONES: Record<Tone, string> = {
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    demo: 'bg-demo-soft text-demo',
    real: 'bg-real-soft text-real',
    accent: 'bg-accent/10 text-accent',
    neutral: 'bg-ink-800 text-text-2',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
    return <span className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase ${TONES[tone]}`}>{label}</span>;
}

export function AdminCard({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`panel overflow-hidden ${className}`}>
            {(title || action) && (
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-5 py-3.5">
                    <h2 className="text-[14px] font-bold">{title}</h2>
                    {action}
                </header>
            )}
            {children}
        </section>
    );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'up' | 'down' | 'accent' }) {
    const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'accent' ? 'text-accent' : 'text-text-1';

    return (
        <div className="panel p-4">
            <div className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">{label}</div>
            <div className={`numeric mt-1.5 text-lg leading-tight font-medium break-words sm:text-[22px] ${color}`}>{value}</div>
            {hint && <div className="mt-1 text-xs text-text-3">{hint}</div>}
        </div>
    );
}

export function Pagination<T>({ page }: { page: AdminPage<T> }) {
    if (page.total === 0) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 px-5 py-3 text-xs text-text-3">
            <span className="numeric">
                {page.from}–{page.to} de {page.total}
            </span>
            {page.last_page > 1 && (
                <div className="flex items-center gap-1.5">
                    {page.prev_page_url ? (
                        <Link href={page.prev_page_url} preserveScroll className="btn btn-ghost btn-sm" aria-label="Página anterior">
                            <ChevronLeft size={15} aria-hidden="true" />
                        </Link>
                    ) : (
                        <span className="btn btn-ghost btn-sm opacity-40" aria-hidden="true">
                            <ChevronLeft size={15} />
                        </span>
                    )}
                    <span className="numeric px-1">
                        {page.current_page} / {page.last_page}
                    </span>
                    {page.next_page_url ? (
                        <Link href={page.next_page_url} preserveScroll className="btn btn-ghost btn-sm" aria-label="Próxima página">
                            <ChevronRight size={15} aria-hidden="true" />
                        </Link>
                    ) : (
                        <span className="btn btn-ghost btn-sm opacity-40" aria-hidden="true">
                            <ChevronRight size={15} />
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Filters live in the address, so a filtered list can be shared or reloaded.
 */
export function useFilters<F extends Record<string, string | null | undefined>>(url: string, filters: F) {
    return (changes: Partial<F>) => {
        const next = Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
        router.get(url, next, { preserveState: true, preserveScroll: true, replace: true });
    };
}

export function SearchBox({ value, placeholder, onSearch }: { value: string; placeholder: string; onSearch: (value: string) => void }) {
    const [text, setText] = useState(value);
    const first = useRef(true);

    // Searches as the person types, after a short pause.
    useEffect(() => {
        if (first.current) {
            first.current = false;

            return;
        }

        const timer = window.setTimeout(() => onSearch(text.trim()), 350);

        return () => window.clearTimeout(timer);
    }, [text]);

    return (
        <label className="relative block w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3" aria-hidden="true" />
            <span className="sr-only">{placeholder}</span>
            <input className="field !h-10 !pl-9" type="search" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
    );
}

export function FilterChips<T extends string>({ value, options, onChange, label }: { value: T | null; options: { value: T | null; label: string }[]; onChange: (value: T | null) => void; label: string }) {
    return (
        <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={label}>
            {options.map((option) => (
                <button key={option.value ?? 'all'} type="button" className="chip h-8 shrink-0" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export type PendingAction = {
    url: string;
    method?: 'post' | 'put';
    title: string;
    description?: ReactNode;
    confirmLabel: string;
    tone?: 'primary' | 'danger';
    /** Asks for the written justification that every money decision needs. */
    noteField?: 'note' | 'reason';
    data?: Record<string, unknown>;
};

/**
 * Confirmation for a sensitive action: says what will happen, asks for the
 * justification recorded in the audit log, and shows the server's errors.
 */
export function ActionDialog({ action, onClose }: { action: PendingAction | null; onClose: () => void }) {
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setNote('');
        setErrors({});
    }, [action]);

    if (!action) return null;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        setSending(true);
        const data = { ...(action.data ?? {}), ...(action.noteField ? { [action.noteField]: note } : {}) };
        const options = {
            preserveScroll: true,
            onSuccess: () => onClose(),
            onError: (received: Record<string, string>) => setErrors(received),
            onFinish: () => setSending(false),
        };

        if (action.method === 'put') {
            router.put(action.url, data as never, options);
        } else {
            router.post(action.url, data as never, options);
        }
    };

    return (
        <Modal open title={action.title} onClose={onClose}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                {action.description && <div className="text-[13px] leading-relaxed text-text-2">{action.description}</div>}
                {action.noteField && (
                    <div>
                        <label className="label" htmlFor="action-note">
                            Justificativa (fica registrada na auditoria)
                        </label>
                        <textarea id="action-note" className="field mt-1.5 !h-24 py-2.5" required minLength={5} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
                    </div>
                )}
                {Object.values(errors).map((message) => (
                    <p key={message} className="text-xs text-down" role="alert">
                        {message}
                    </p>
                ))}
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="submit" className={`btn btn-sm ${action.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={sending || (action.noteField !== undefined && note.trim().length < 5)}>
                        {sending ? 'Enviando…' : action.confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
    return (
        <tr>
            <td colSpan={colSpan} className="!py-10 text-center text-[13px] text-text-3">
                {children}
            </td>
        </tr>
    );
}
