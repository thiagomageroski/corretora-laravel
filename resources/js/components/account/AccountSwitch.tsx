import { router } from '@inertiajs/react';
import { FlaskConical, Landmark } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import type { Environment, RealAccountState } from '@/lib/types';
import { useToasts } from '@/stores/toasts';
import { useWallet } from '@/stores/wallet';

/**
 * Chooses which account every page shows and trades on. The two balances never
 * mix: switching only changes what is displayed and where new orders go.
 */
export function AccountSwitch({ environment, realAccount, compact = false }: { environment: Environment; realAccount: RealAccountState | null; compact?: boolean }) {
    const select = useWallet((state) => state.select);
    const push = useToasts((state) => state.push);
    const [switching, setSwitching] = useState(false);
    const realAvailable = realAccount?.opened || realAccount?.enabled;

    const choose = async (target: Environment) => {
        if (target === environment || switching) return;

        if (target === 'real' && !realAccount?.opened) {
            router.visit('/carteira?abrir=real');

            return;
        }

        setSwitching(true);

        try {
            await select(target);
        } catch (exception) {
            push({
                tone: 'down',
                title: exception instanceof ApiError ? exception.message : 'Não foi possível trocar de conta.',
            });
        } finally {
            setSwitching(false);
        }
    };

    const option = (target: Environment) => {
        const active = environment === target;
        const isReal = target === 'real';
        const Icon = isReal ? Landmark : FlaskConical;
        const tone = isReal ? 'bg-real-soft text-real border-real/40' : 'bg-demo-soft text-demo border-demo/30';

        return (
            <button
                type="button"
                aria-pressed={active}
                disabled={switching || (isReal && !realAvailable)}
                title={isReal ? (realAccount?.opened ? 'Conta real: dinheiro de verdade' : realAvailable ? 'Abrir conta real' : 'Conta real indisponível') : 'Conta demo: dinheiro virtual'}
                onClick={() => void choose(target)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold tracking-wide whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? tone : 'border-transparent text-text-3 hover:text-text-1'}`}
            >
                <Icon size={13} aria-hidden="true" />
                {isReal ? (compact ? 'REAL' : 'CONTA REAL') : compact ? 'DEMO' : 'CONTA DEMO'}
            </button>
        );
    };

    return (
        <div className="flex items-center gap-0.5 rounded-xl border border-ink-800 bg-ink-950 p-0.5" role="group" aria-label="Conta em uso">
            {option('demo')}
            {option('real')}
        </div>
    );
}
