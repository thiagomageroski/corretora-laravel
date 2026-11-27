import { Link } from '@inertiajs/react';
import { Cookie } from 'lucide-react';
import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'cookie-notice-dismissed';

/**
 * A one-time note that the site only uses essential cookies. There is nothing
 * to accept or refuse, so it informs and goes away once read.
 */
export function CookieNotice() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            setVisible(localStorage.getItem(DISMISSED_KEY) !== '1');
        } catch {
            setVisible(true);
        }
    }, []);

    if (!visible) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISSED_KEY, '1');
        } catch {
            /* Only a convenience; it just shows again next visit. */
        }

        setVisible(false);
    };

    return (
        <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl animate-rise sm:bottom-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900/95 p-4 shadow-[var(--shadow-float)] backdrop-blur sm:flex-row sm:items-center">
                <div className="flex flex-1 gap-3">
                    <Cookie size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <p className="text-[13px] leading-relaxed text-text-2">
                        Usamos apenas cookies essenciais, para manter você conectado e proteger sua conta. Nada de publicidade ou rastreamento.{' '}
                        <Link href="/cookies" className="font-medium text-text-1 underline underline-offset-2">
                            Política de cookies
                        </Link>
                    </p>
                </div>
                <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={dismiss}>
                    Entendi
                </button>
            </div>
        </div>
    );
}
