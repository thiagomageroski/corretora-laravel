/** Area code plus number: 10 digits for landlines, 11 for mobiles. */
export const PHONE_MAX_DIGITS = 11;

/**
 * The digits of a Brazilian phone, at most 11. A leading country code 55
 * (from autofill or an older saved number) is dropped when the rest is a full
 * number, so "+55 11 98888-7777" becomes "11988887777".
 */
export function phoneDigits(value: string): string {
    let digits = value.replace(/\D/g, '');

    if (digits.length > PHONE_MAX_DIGITS && digits.startsWith('55')) {
        digits = digits.slice(2);
    }

    return digits.slice(0, PHONE_MAX_DIGITS);
}

/**
 * Masks a phone as it is typed: "(47", "(47) 9920", "(47) 3201-2732" for
 * 10 digits and "(47) 99201-2732" for 11.
 */
export function formatPhone(value: string): string {
    const digits = phoneDigits(value);

    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;

    const area = digits.slice(0, 2);
    const rest = digits.slice(2);

    if (rest.length <= 4) return `(${area}) ${rest}`;

    const split = digits.length === PHONE_MAX_DIGITS ? 5 : 4;

    return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
