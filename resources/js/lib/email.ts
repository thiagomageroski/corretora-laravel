/**
 * E-mail typing helpers. Phone keyboards insert spaces, capital letters and
 * autocorrected accents ("linguica" becomes "linguiça"); mail providers never
 * issue addresses like that, so the form cleans what it can and points out
 * the rest before the server refuses it.
 */

/** Spaces never belong in an address; they come from autocomplete or a stray tap. */
export function cleanEmailInput(value: string): string {
    return value.replace(/\s+/g, '');
}

export function hasAccents(value: string): boolean {
    return /[^\x21-\x7E]/.test(value);
}

/**
 * The same address without accents or "ç", in lower case, when that is what
 * the person most likely meant. Null when there is nothing to fix.
 */
export function emailSuggestion(value: string): string | null {
    if (!hasAccents(value)) return null;

    const plain = value.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '').toLowerCase();

    return plain !== '' && !hasAccents(plain) ? plain : null;
}
