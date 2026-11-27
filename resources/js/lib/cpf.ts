/** Masks a CPF as it is typed: "123.456.789-09", at most 11 digits. */
export function maskCpf(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);

    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** Same check-digit rule as the server, so a typo is caught before sending. */
export function isValidCpf(value: string): boolean {
    const digits = value.replace(/\D/g, '');

    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

    const check = (length: number) => {
        const sum = [...digits.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
        const rest = (sum * 10) % 11;

        return rest === 10 ? 0 : rest;
    };

    return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}
