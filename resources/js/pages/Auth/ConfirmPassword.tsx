import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { FieldError } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';

export default function ConfirmPassword() {
    const form = useForm({ password: '' });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/user/confirm-password', { onFinish: () => form.reset() });
    };

    return (
        <GuestLayout title="Confirme sua senha" subtitle="Esta área exige confirmar a senha antes de continuar.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="label" htmlFor="password">
                        Senha
                    </label>
                    <input id="password" type="password" className="field mt-1" autoComplete="current-password" autoFocus required value={form.data.password} onChange={(event) => form.setData('password', event.target.value)} />
                    <FieldError message={form.errors.password} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    Confirmar
                </button>
            </form>
        </GuestLayout>
    );
}
