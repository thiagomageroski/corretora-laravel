<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * A Brazilian phone with area code: 10 digits (landline) or 11 (mobile),
 * typed with or without the "(11) 99999-9999" mask. A leading country code
 * 55 is tolerated, since autofill often adds it.
 */
class BrazilianPhone implements ValidationRule
{
    public const MESSAGE = 'Informe o telefone com DDD, como (11) 99999-9999.';

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || preg_match('/^[0-9()+.\s-]+$/', $value) !== 1) {
            $fail(self::MESSAGE);

            return;
        }

        $length = strlen(self::digits($value));

        if ($length < 10 || $length > 11) {
            $fail(self::MESSAGE);
        }
    }

    /**
     * Area code and number only, without the mask or a leading 55.
     */
    public static function digits(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return strlen($digits) > 11 && str_starts_with($digits, '55') ? substr($digits, 2) : $digits;
    }
}
