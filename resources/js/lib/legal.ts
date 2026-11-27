/** Who runs the platform, as set in the admin panel. Fields left empty are null. */
export type LegalEntity = {
    name: string | null;
    document: string | null;
    address: string | null;
    contact_email: string | null;
    privacy_email: string | null;
};

/** Every policy, in the order they are listed in the footer and in the document tabs. */
export const LEGAL_DOCUMENTS = [
    { href: '/termos', label: 'Termos de uso' },
    { href: '/privacidade', label: 'Política de privacidade' },
    { href: '/cookies', label: 'Política de cookies' },
    { href: '/riscos', label: 'Divulgação de riscos' },
    { href: '/pld', label: 'Prevenção à lavagem de dinheiro' },
] as const;

/** When the current texts took effect. Change it whenever a policy changes. */
export const LEGAL_UPDATED_AT = '8 de novembro de 2026';

/** The address for privacy requests, falling back to the general contact. */
export function privacyContact(company: LegalEntity): string | null {
    return company.privacy_email ?? company.contact_email;
}
