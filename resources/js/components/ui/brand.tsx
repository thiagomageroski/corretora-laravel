import { FlaskConical } from 'lucide-react';
import { useId } from 'react';

export function Logo({ compact = false }: { compact?: boolean }) {
    const gradientId = useId();

    return (
        <span className="inline-flex items-center gap-2.5 font-bold tracking-tight text-text-1">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="28" y2="28">
                        <stop offset="0" stopColor="#d8fa72" />
                        <stop offset="1" stopColor="#a9e02c" />
                    </linearGradient>
                </defs>
                <rect width="28" height="28" rx="8" fill={`url(#${gradientId})`} />
                <path d="M8 19.5V8.5l12 11V8.5" fill="none" stroke="#10140a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!compact && <span className="text-[18px]">Nivora</span>}
        </span>
    );
}

export function DemoBadge({ short = false }: { short?: boolean }) {
    return (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-demo/25 bg-demo-soft px-2.5 text-[11px] font-bold tracking-wide whitespace-nowrap text-demo">
            <FlaskConical size={13} aria-hidden="true" />
            {short ? 'DEMO' : 'CONTA DEMO'}
        </span>
    );
}
