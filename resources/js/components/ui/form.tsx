import type { InputHTMLAttributes, ReactNode } from 'react';
import { cleanEmailInput, emailSuggestion } from '@/lib/email';

export function FieldError({ message }: { message?: string }) {
    return message ? (
        <p className="mt-1.5 text-xs text-down" role="alert">
            {message}
        </p>
    ) : null;
}

export function TextField({ label, error, hint, id, trailing, className = '', ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string; hint?: string; trailing?: ReactNode }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                <label className="label" htmlFor={id}>
                    {label}
                </label>
                {trailing}
            </div>
            <input id={id} className={`field mt-1.5 ${className}`} aria-invalid={error ? true : undefined} {...input} />
            {hint && !error && <p className="mt-1.5 text-xs text-text-3">{hint}</p>}
            <FieldError message={error} />
        </div>
    );
}

export function Switch({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean }) {
    return (
        <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
            <span className="min-w-0">
                <span className="block font-medium text-text-1">{label}</span>
                {description && <span className="mt-0.5 block text-xs leading-relaxed text-text-3">{description}</span>}
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0">
                <input type="checkbox" role="switch" className="peer absolute inset-0 cursor-pointer opacity-0" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
                <span className={`block h-6 w-10 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${checked ? 'bg-accent' : 'bg-ink-600'}`} />
                <span className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform ${checked ? 'translate-x-4 bg-on-accent' : 'bg-text-1'}`} />
            </span>
        </label>
    );
}

export function Segmented<T extends string | number>({
    value,
    options,
    onChange,
    label,
    stretch = false,
}: {
    value: T;
    options: { value: T; label: ReactNode; title?: string }[];
    onChange: (value: T) => void;
    label: string;
    stretch?: boolean;
}) {
    return (
        <div role="group" aria-label={label} className={`segmented ${stretch ? 'flex w-full' : ''}`}>
            {options.map((option) => (
                <button key={String(option.value)} type="button" title={option.title} aria-label={option.title} className={`chip ${stretch ? 'flex-1' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="panel p-5">
            <h3 className="font-bold text-text-1">{title}</h3>
            {description && <p className="mt-1 text-xs leading-relaxed text-text-3">{description}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
}

/**
 * The e-mail field of every auth and profile form: no autocorrect, capitals or
 * spell check (phones otherwise turn "linguica" into "linguiça"), spaces
 * removed as they are typed, and a one-tap fix when accents slip in.
 */
export function EmailInput({
    id,
    value,
    onChange,
    error,
    className = '',
    ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { id: string; value: string; onChange: (value: string) => void; error?: string }) {
    const suggestion = emailSuggestion(value);

    return (
        <>
            <input
                id={id}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`field ${className}`}
                aria-invalid={error || suggestion ? true : undefined}
                value={value}
                onChange={(event) => onChange(cleanEmailInput(event.target.value))}
                {...input}
            />
            {suggestion ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-demo" role="alert">
                    E-mail não pode ter acentos ou ç.
                    <button type="button" className="font-semibold text-text-1 underline underline-offset-2" onClick={() => onChange(suggestion)}>
                        Usar {suggestion}
                    </button>
                </p>
            ) : (
                <FieldError message={error} />
            )}
        </>
    );
}
