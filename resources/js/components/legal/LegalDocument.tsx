import { Head, Link, usePage } from '@inertiajs/react';
import { Building2, CalendarDays, Info, Mail, Scale, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import PublicLayout from '@/layouts/PublicLayout';
import { LEGAL_DOCUMENTS, LEGAL_UPDATED_AT, type LegalEntity } from '@/lib/legal';
import type { SharedProps } from '@/lib/types';

export type LegalSection = { id: string; title: string; body: ReactNode };

/** The section being read: the last heading that has scrolled past the top third of the screen. */
function useActiveSection(ids: string[]): string | null {
    const [active, setActive] = useState<string | null>(ids[0] ?? null);

    useEffect(() => {
        const update = () => {
            const line = window.innerHeight / 3;
            let current = ids[0] ?? null;

            for (const id of ids) {
                const element = document.getElementById(id);

                if (element && element.getBoundingClientRect().top <= line) {
                    current = id;
                }
            }

            setActive(current);
        };

        update();
        window.addEventListener('scroll', update, { passive: true });

        return () => window.removeEventListener('scroll', update);
    }, [ids]);

    return active;
}

/**
 * The shared frame of every policy: a header with the effective date, tabs to
 * the other policies, a table of contents that follows the reading and
 * numbered sections that can be linked to directly.
 */
export function LegalDocument({ title, summary, sections, children }: { title: string; summary: ReactNode; sections: LegalSection[]; children?: ReactNode }) {
    const { url } = usePage<SharedProps>();
    const [ids] = useState(() => sections.map((section) => section.id));
    const active = useActiveSection(ids);
    const path = url.split(/[?#]/)[0];

    return (
        <PublicLayout>
            <Head title={title} />

            <div className="border-b border-ink-800 bg-gradient-to-b from-ink-900/70 to-ink-950">
                <div className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-text-2 uppercase">
                        <Scale size={13} className="text-accent" aria-hidden="true" />
                        Central jurídica
                    </span>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight text-text-1 sm:text-4xl">{title}</h1>
                    <div className="mt-4 max-w-3xl text-[15px] leading-relaxed text-text-2">{summary}</div>
                    <p className="mt-4 flex items-center gap-1.5 text-xs text-text-3">
                        <CalendarDays size={13} aria-hidden="true" />
                        Última atualização: {LEGAL_UPDATED_AT}
                    </p>

                    <nav aria-label="Documentos jurídicos" className="thin-scroll -mx-4 mt-8 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                        {LEGAL_DOCUMENTS.map((document) => {
                            const current = document.href === path;

                            return (
                                <Link
                                    key={document.href}
                                    href={document.href}
                                    aria-current={current ? 'page' : undefined}
                                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${current ? 'border-accent/50 bg-accent/10 text-text-1' : 'border-ink-800 text-text-2 hover:border-ink-600 hover:text-text-1'}`}
                                >
                                    {document.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>

            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
                <aside className="hidden lg:block">
                    <nav aria-label="Nesta página" className="sticky top-24 flex flex-col gap-0.5 border-l border-ink-800">
                        <span className="mb-2 pl-4 text-[11px] font-semibold tracking-wide text-text-3 uppercase">Nesta página</span>
                        {sections.map((section, index) => (
                            <a
                                key={section.id}
                                href={`#${section.id}`}
                                className={`-ml-px border-l py-1.5 pl-4 text-[13px] leading-snug transition-colors ${active === section.id ? 'border-accent text-text-1' : 'border-transparent text-text-3 hover:text-text-1'}`}
                            >
                                {index + 1}. {section.title}
                            </a>
                        ))}
                    </nav>
                </aside>

                <article className="max-w-3xl min-w-0 animate-rise text-[15px] leading-relaxed text-text-2">
                    <div className="flex flex-col gap-10">
                        {sections.map((section, index) => (
                            <section key={section.id} id={section.id} className="flex scroll-mt-24 flex-col gap-3">
                                <h2 className="text-lg font-bold text-text-1 sm:text-xl">
                                    <span className="numeric mr-2 text-text-3">{String(index + 1).padStart(2, '0')}</span>
                                    {section.title}
                                </h2>
                                {section.body}
                            </section>
                        ))}
                    </div>
                    {children}
                </article>
            </div>
        </PublicLayout>
    );
}

export function Bullets({ items }: { items: ReactNode[] }) {
    return (
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-text-3">
            {items.map((item, index) => (
                <li key={index}>{item}</li>
            ))}
        </ul>
    );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'risk'; children: ReactNode }) {
    const Icon = tone === 'risk' ? TriangleAlert : Info;

    return (
        <div className={`flex gap-2.5 rounded-xl border p-4 text-[14px] text-text-1 ${tone === 'risk' ? 'border-down/30 bg-down-soft' : 'border-ink-700 bg-ink-900'}`}>
            <Icon size={16} className={`mt-0.5 shrink-0 ${tone === 'risk' ? 'text-down' : 'text-accent'}`} aria-hidden="true" />
            <div>{children}</div>
        </div>
    );
}

/** A definition table, for things like cookies or data categories. */
export function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
    return (
        <div className="thin-scroll overflow-x-auto rounded-xl border border-ink-800">
            <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="bg-ink-900 text-[11px] tracking-wide text-text-3 uppercase">
                    <tr>
                        {head.map((cell) => (
                            <th key={cell} scope="col" className="px-3.5 py-2.5 font-semibold">
                                {cell}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                    {rows.map((row, index) => (
                        <tr key={index} className="align-top">
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className={`px-3.5 py-3 ${cellIndex === 0 ? 'font-medium text-text-1' : ''}`}>
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function MailLink({ email }: { email: string }) {
    return (
        <a href={`mailto:${email}`} className="font-medium text-text-1 underline decoration-ink-600 underline-offset-2 hover:decoration-accent">
            {email}
        </a>
    );
}

export function DocLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link href={href} className="font-medium text-text-1 underline decoration-ink-600 underline-offset-2 hover:decoration-accent">
            {children}
        </Link>
    );
}

/** Who runs the platform and how to reach it, from what the admin panel has filled in. */
export function CompanyCard({ company }: { company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;
    const emails = [
        company.contact_email && { label: 'Atendimento', email: company.contact_email },
        company.privacy_email && company.privacy_email !== company.contact_email && { label: 'Privacidade e dados pessoais', email: company.privacy_email },
    ].filter((item): item is { label: string; email: string } => Boolean(item));

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-[14px]">
            <div className="flex items-start gap-2.5">
                <Building2 size={16} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
                <div>
                    <div className="font-semibold text-text-1">{company.name ?? appName}</div>
                    {company.document && <div className="numeric text-[13px] text-text-3">CNPJ {company.document}</div>}
                    {company.address && <div className="text-[13px] text-text-3">{company.address}</div>}
                </div>
            </div>
            {emails.length > 0 ? (
                emails.map((item) => (
                    <div key={item.email} className="flex items-start gap-2.5">
                        <Mail size={16} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
                        <div>
                            <div className="text-[12px] text-text-3">{item.label}</div>
                            <MailLink email={item.email} />
                        </div>
                    </div>
                ))
            ) : (
                <div className="flex items-start gap-2.5 text-[13px] text-text-3">
                    <Mail size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Pedidos sobre sua conta podem ser feitos, depois de entrar, em Minha conta.
                </div>
            )}
        </div>
    );
}
