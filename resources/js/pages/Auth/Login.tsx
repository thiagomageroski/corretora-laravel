import { Link, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { EmailInput, FieldError } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';
import type { SharedProps } from '@/lib/types';

export default function Login() {
    const { flash } = usePage<SharedProps>().props;
    const form = useForm({ email: '', password: '', remember: false });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/login', { onFinish: () => form.reset('password') });
    };

    return (
        <GuestLayout title="Entrar">
            {flash.status && <p className="mb-4 rounded-lg bg-up-soft p-3 text-xs">{flash.status}</p>}
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                <div>
                    <label className="label" htmlFor="email">
                        E-mail
                    </label>
                    <EmailInput id="email" className="mt-1" autoComplete="email" autoFocus required value={form.data.email} onChange={(value) => form.setData('email', value)} error={form.errors.email} />
                </div>
                <div>
                    <div className="flex items-center justify-between">
                        <label className="label" htmlFor="password">
                            Senha
                        </label>
                        <Link href="/forgot-password" className="text-xs text-text-2 hover:text-text-1">
                            Esqueci a senha
                        </Link>
                    </div>
                    <input id="password" type="password" className="field mt-1" autoComplete="current-password" required value={form.data.password} onChange={(event) => form.setData('password', event.target.value)} />
                    <FieldError message={form.errors.password} />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-2">
                    <input type="checkbox" className="accent-[var(--color-accent)]" checked={form.data.remember} onChange={(event) => form.setData('remember', event.target.checked)} />
                    Manter conectado neste dispositivo
                </label>
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    {form.processing ? 'Entrando…' : 'Entrar'}
                </button>
            </form>
            <p className="mt-5 text-center text-xs text-text-2">
                Ainda não tem conta?{' '}
                <Link href="/register" className="font-semibold text-accent">
                    Criar conta
                </Link>
            </p>
        </GuestLayout>
    );
}
