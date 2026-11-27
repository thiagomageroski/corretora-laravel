import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { EmailInput, FieldError } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';

export default function ResetPassword({ token, email }: { token: string; email: string | null }) {
    const form = useForm({ token, email: email ?? '', password: '', password_confirmation: '' });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/reset-password', { onFinish: () => form.reset('password', 'password_confirmation') });
    };

    return (
        <GuestLayout title="Nova senha">
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                <div>
                    <label className="label" htmlFor="email">
                        E-mail
                    </label>
                    <EmailInput id="email" className="mt-1" autoComplete="email" required value={form.data.email} onChange={(value) => form.setData('email', value)} error={form.errors.email} />
                </div>
                <div>
                    <label className="label" htmlFor="password">
                        Nova senha
                    </label>
                    <input id="password" type="password" className="field mt-1" autoComplete="new-password" autoFocus required value={form.data.password} onChange={(event) => form.setData('password', event.target.value)} />
                    <FieldError message={form.errors.password} />
                </div>
                <div>
                    <label className="label" htmlFor="password_confirmation">
                        Confirme a nova senha
                    </label>
                    <input
                        id="password_confirmation"
                        type="password"
                        className="field mt-1"
                        autoComplete="new-password"
                        required
                        value={form.data.password_confirmation}
                        onChange={(event) => form.setData('password_confirmation', event.target.value)}
                    />
                </div>
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    Redefinir senha
                </button>
            </form>
        </GuestLayout>
    );
}
