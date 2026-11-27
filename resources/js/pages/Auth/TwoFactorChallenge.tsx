import { useForm } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import { FieldError } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';

export default function TwoFactorChallenge() {
    const [useRecovery, setUseRecovery] = useState(false);
    const form = useForm({ code: '', recovery_code: '' });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/two-factor-challenge');
    };

    return (
        <GuestLayout title="Verificação em duas etapas" subtitle={useRecovery ? 'Informe um dos seus códigos de recuperação.' : 'Informe o código do seu aplicativo autenticador.'}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                {useRecovery ? (
                    <div>
                        <label className="label" htmlFor="recovery_code">
                            Código de recuperação
                        </label>
                        <input id="recovery_code" className="field numeric mt-1" autoComplete="one-time-code" autoFocus value={form.data.recovery_code} onChange={(event) => form.setData('recovery_code', event.target.value)} />
                        <FieldError message={form.errors.recovery_code} />
                    </div>
                ) : (
                    <div>
                        <label className="label" htmlFor="code">
                            Código
                        </label>
                        <input id="code" className="field numeric mt-1" inputMode="numeric" autoComplete="one-time-code" autoFocus value={form.data.code} onChange={(event) => form.setData('code', event.target.value)} />
                        <FieldError message={form.errors.code} />
                    </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    Confirmar
                </button>
                <button
                    type="button"
                    className="text-xs text-text-2 hover:text-text-1"
                    onClick={() => {
                        form.reset();
                        setUseRecovery(!useRecovery);
                    }}
                >
                    {useRecovery ? 'Usar o código do aplicativo' : 'Usar um código de recuperação'}
                </button>
            </form>
        </GuestLayout>
    );
}
