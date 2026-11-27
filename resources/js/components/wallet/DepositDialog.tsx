import { Link, usePage } from '@inertiajs/react';
import { Landmark, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Money } from '@/components/ui';
import { api } from '@/lib/api';
import type { Deposit, SharedProps } from '@/lib/types';
import { DepositPanel, depositBlockedReason } from './DepositPanel';

/**
 * PIX deposit in a card over the current page, so the trading screen and its chart
 * stay where they are. The money always goes to the real account.
 */
export function DepositDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { props } = usePage<SharedProps>();
    const realAccount = props.realAccount;
    const [pending, setPending] = useState<Deposit | null | undefined>(undefined);

    useEffect(() => {
        if (!open || !realAccount?.opened) return;

        let active = true;
        setPending(undefined);
        api<{ data: Deposit[] }>('/deposits')
            .then(({ data }) => active && setPending(data.find((deposit) => deposit.status === 'pending' && deposit.pix_code !== null) ?? null))
            .catch(() => active && setPending(null));

        return () => {
            active = false;
        };
    }, [open, realAccount?.opened]);

    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button type="button" aria-label="Fechar" className="absolute inset-0 animate-fade cursor-default bg-black/65 backdrop-blur-[3px]" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label="Depositar" className="panel thin-scroll relative max-h-[calc(100dvh-2rem)] w-full max-w-[480px] animate-toast overflow-y-auto shadow-[var(--shadow-float)]">
                <header className="flex items-start justify-between gap-3 border-b border-ink-800 p-5">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-real-soft text-real">
                            <Landmark size={19} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-base font-bold">Depositar</h2>
                            <p className="text-xs text-text-3">
                                Conta real{realAccount?.wallet ? ' · saldo ' : ''}
                                {realAccount?.wallet && <Money cents={realAccount.wallet.available_cents} />}
                            </p>
                        </div>
                    </div>
                    <button type="button" aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-lg text-text-2 hover:bg-ink-800 hover:text-text-1" onClick={onClose}>
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                <div className="p-5">
                    {!realAccount?.opened ? (
                        <div className="flex flex-col items-center gap-4 py-2 text-center">
                            <p className="text-[13px] leading-relaxed text-text-2">Para depositar, abra sua conta real. Ela é separada da conta demo e leva menos de um minuto.</p>
                            <Link href="/carteira?abrir=real" className="btn btn-primary" onClick={onClose}>
                                Abrir conta real
                            </Link>
                        </div>
                    ) : pending === undefined ? (
                        <div className="flex flex-col gap-3" aria-busy="true">
                            <div className="skeleton h-10 rounded-xl" />
                            <div className="skeleton h-8 rounded-xl" />
                            <div className="skeleton h-11 rounded-xl" />
                        </div>
                    ) : (
                        <DepositPanel
                            embedded
                            initial={pending}
                            disabledReason={depositBlockedReason(realAccount)}
                            limits={{ min: realAccount.deposit_limits.min_cents, max: realAccount.deposit_limits.max_cents }}
                            expiryMinutes={realAccount.deposit_limits.expiry_minutes}
                        />
                    )}
                </div>

                <footer className="flex items-center gap-2 border-t border-ink-800 px-5 py-3 text-[11px] text-text-3">
                    <ShieldCheck size={14} className="shrink-0 text-up" aria-hidden="true" />
                    PIX processado pela AmploPay. Você paga no app do seu banco; a Nivora nunca pede sua senha bancária.
                </footer>
            </div>
        </div>,
        document.body,
    );
}
