import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
            <div className="min-w-0">
                <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
                {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-text-2">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Page({ children, width = 'max-w-7xl' }: { children: ReactNode; width?: string }) {
    return <div className={`stagger mx-auto flex ${width} flex-col gap-5 p-4 sm:p-6 lg:p-8`}>{children}</div>;
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
    return (
        <div className="panel panel-hover p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
                <span className="label">{label}</span>
                {icon && <span className="icon-tile size-8 !rounded-lg text-text-2">{icon}</span>}
            </div>
            <div className="numeric mt-2.5 text-xl font-medium sm:text-2xl">{value}</div>
            {hint && <div className="mt-1 text-xs text-text-3">{hint}</div>}
        </div>
    );
}

export function PanelHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-ink-800/80 bg-gradient-to-b from-white/[0.015] to-transparent px-5 py-3">
            <h2 className="font-bold tracking-tight">{title}</h2>
            {action}
        </div>
    );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            {icon && <span className="icon-tile mb-1.5 size-12 text-text-2">{icon}</span>}
            <div className="font-semibold text-text-1">{title}</div>
            {children && <div className="max-w-sm text-xs leading-relaxed text-text-3">{children}</div>}
        </div>
    );
}
