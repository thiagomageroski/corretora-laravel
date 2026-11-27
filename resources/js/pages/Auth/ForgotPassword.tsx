import { Link, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { EmailInput } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';
import type { SharedProps } from '@/lib/types';

export default function ForgotPassword() {
    const { flash } = usePage<SharedProps>().props;
    const form = useForm({ email: '' });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/forgot-password');
    };

    return (
        <GuestLayout title="Recuperar senha" subtitle="Enviaremos um link de redefinição para o seu e-mail.">
            {flash.status && <p className="mb-4 rounded-lg bg-up-soft p-3 text-xs">{flash.status}</p>}
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                <div>
                    <label className="label" htmlFor="email">
                        E-mail
                    </label>
                    <EmailInput id="email" className="mt-1" autoComplete="email" autoFocus required value={form.data.email} onChange={(value) => form.setData('email', value)} error={form.errors.email} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    Enviar link
                </button>
            </form>
            <p className="mt-5 text-center text-xs">
                <Link href="/login" className="text-text-2 hover:text-text-1">
                    Voltar para o login
                </Link>
            </p>
        </GuestLayout>
    );
}
