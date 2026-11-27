<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Str;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * Refuses e-mail addresses with accents, "ç" or spaces. The RFC check accepts
 * them, but mail providers do not issue such addresses: they come from phone
 * autocorrect ("linguica" becoming "linguiça") and would never receive mail.
 */
class PlainAsciiEmail implements ValidationRule
{
    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || preg_match('/^[\x21-\x7E]+$/', $value) === 1) {
            return;
        }

        $suggestion = Str::lower(preg_replace('/\s+/', '', Str::ascii($value)) ?? '');

        $fail($suggestion !== '' && preg_match('/^[\x21-\x7E]+$/', $suggestion) === 1
            ? "O e-mail não pode ter acentos, ç ou espaços. Você quis dizer {$suggestion}?"
            : 'O e-mail não pode ter acentos, ç ou espaços.');
    }
}
