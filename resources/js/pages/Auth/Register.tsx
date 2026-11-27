import { Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { EmailInput, FieldError } from '@/components/ui';
import GuestLayout from '@/layouts/GuestLayout';
import { formatPhone } from '@/lib/phone';

export default function Register() {
    const form = useForm({ first_name: '', last_name: '', email: '', phone: '', password: '', password_confirmation: '', accept_terms: false });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/register', { onFinish: () => form.reset('password', 'password_confirmation') });
    };

    return (
        <GuestLayout title="Criar conta" subtitle="Cadastro grátis. Você começa com uma conta demo para treinar e abre a conta real quando quiser.">
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label" htmlFor="first_name">
                            Nome
                        </label>
                        <input id="first_name" className="field mt-1" autoComplete="given-name" required value={form.data.first_name} onChange={(event) => form.setData('first_name', event.target.value)} />
                        <FieldError message={form.errors.first_name} />
                    </div>
                    <div>
                        <label className="label" htmlFor="last_name">
                            Sobrenome
                        </label>
                        <input id="last_name" className="field mt-1" autoComplete="family-name" required value={form.data.last_name} onChange={(event) => form.setData('last_name', event.target.value)} />
                        <FieldError message={form.errors.last_name} />
                    </div>
                </div>
                <div>
                    <label className="label" htmlFor="email">
                        E-mail
                    </label>
                    <EmailInput id="email" className="mt-1" autoComplete="email" required value={form.data.email} onChange={(value) => form.setData('email', value)} error={form.errors.email} />
                </div>
                <div>
                    <label className="label" htmlFor="phone">
                        Telefone (opcional)
                    </label>
                    <input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        className="field mt-1"
                        autoComplete="tel"
                        placeholder="(11) 99999-9999"
                        maxLength={15}
                        value={form.data.phone}
                        onChange={(event) => form.setData('phone', formatPhone(event.target.value))}
                    />
                    <FieldError message={form.errors.phone} />
                </div>
                <div>
                    <label className="label" htmlFor="password">
                        Senha
                    </label>
                    <input id="password" type="password" className="field mt-1" autoComplete="new-password" required value={form.data.password} onChange={(event) => form.setData('password', event.target.value)} />
                    <FieldError message={form.errors.password} />
                </div>
                <div>
                    <label className="label" htmlFor="password_confirmation">
                        Confirme a senha
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
                <div>
                    <label className="flex items-start gap-2 text-xs leading-relaxed text-text-2">
                        <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={form.data.accept_terms} onChange={(event) => form.setData('accept_terms', event.target.checked)} />
                        <span>
                            Li e aceito os{' '}
                            <a href="/termos" target="_blank" className="underline hover:text-text-1">
                                termos de uso
                            </a>{' '}
                            e as{' '}
                            <a href="/riscos" target="_blank" className="underline hover:text-text-1">
                                regras e riscos
                            </a>
                            , e estou ciente da{' '}
                            <a href="/privacidade" target="_blank" className="underline hover:text-text-1">
                                política de privacidade
                            </a>
                            .
                        </span>
                    </label>
                    <FieldError message={form.errors.accept_terms} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={form.processing}>
                    {form.processing ? 'Criando…' : 'Criar conta'}
                </button>
            </form>
            <p className="mt-5 text-center text-xs text-text-2">
                Já tem conta?{' '}
                <Link href="/login" className="font-semibold text-accent">
                    Entrar
                </Link>
            </p>
        </GuestLayout>
    );
}
