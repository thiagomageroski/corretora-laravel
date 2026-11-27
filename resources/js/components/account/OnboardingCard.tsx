import { router, usePage } from '@inertiajs/react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { SharedProps } from '@/lib/types';

const DISMISS_KEY = 'onboarding-dismissed';

/** Opens the deposit card that lives in the app layout. */
export function requestDeposit(): void {
    window.dispatchEvent(new CustomEvent('open-deposit'));
}

function dismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Checklist of the first steps, built from what the user really did. Hidden
 * once everything is done or when the user closes it.
 */
export function OnboardingCard() {
    const { props } = usePage<SharedProps>();
    const onboarding = props.onboarding;
    const [hidden, setHidden] = useState(dismissed);

    if (!onboarding || onboarding.progress >= 100 || hidden) return null;

    const actions: Record<string, { label: string; run: () => void }> = {
        asset: { label: 'Escolher ativo', run: () => router.visit('/ativos') },
        trade: { label: 'Negociar', run: () => router.visit('/negociar') },
        real: {
            label: 'Abrir conta',
            run: () => router.visit('/carteira?abrir=real'),
        },
        deposit: { label: 'Depositar', run: requestDeposit },
    };
    const next = onboarding.steps.find((step) => !step.done);

    const hide = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* Hidden for this visit only. */
        }
        setHidden(true);
    };

    return (
        <section id="primeiros-passos" className="panel relative overflow-hidden" aria-labelledby="onboarding-title">
            <div className="glow-backdrop absolute inset-0 opacity-50" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-ink-800 px-5 py-4">
                <div className="flex items-center gap-4">
                    <div className="numeric text-3xl font-medium text-accent">{onboarding.progress}%</div>
                    <div>
                        <h2 id="onboarding-title" className="font-bold">
                            Alguns passos simples para começar a negociar
                        </h2>
                        <p className="mt-0.5 text-xs text-text-3">
                            {onboarding.done} de {onboarding.total} concluídos
                        </p>
                        <div className="progress-track mt-2 w-56 max-w-full">
                            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${onboarding.progress}%` }} />
                        </div>
                    </div>
                </div>
                <button type="button" aria-label="Ocultar primeiros passos" className="grid size-8 place-items-center rounded-lg text-text-3 hover:bg-ink-800 hover:text-text-1" onClick={hide}>
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
            <ol className="relative grid gap-px bg-ink-800 sm:grid-cols-2 lg:grid-cols-3 sm:[&>li:last-child]:col-span-2 lg:[&>li:last-child]:col-span-2">
                {onboarding.steps.map((step, index) => {
                    const action = actions[step.key];
                    const isNext = next?.key === step.key;

                    return (
                        <li key={step.key} className={`flex items-center gap-3 bg-ink-900 px-5 py-3.5 ${isNext ? 'bg-gradient-to-r from-accent/[0.07] to-ink-900' : ''}`}>
                            <span
                                className={`numeric grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-up text-[#04130e]' : isNext ? 'border border-accent text-accent' : 'border border-ink-600 text-text-3'}`}
                            >
                                {step.done ? <Check size={14} aria-hidden="true" /> : index + 1}
                            </span>
                            <span className={`min-w-0 flex-1 text-[13px] ${step.done ? 'text-text-3 line-through' : 'font-semibold'}`}>{step.title}</span>
                            {!step.done && action && (
                                <button type="button" className={`btn btn-sm shrink-0 ${isNext ? 'btn-primary' : 'btn-ghost'}`} onClick={action.run}>
                                    {action.label}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
