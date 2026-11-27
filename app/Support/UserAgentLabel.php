<?php

namespace App\Support;

/**
 * A readable label for a device list. Approximate by nature: user agents can be spoofed.
 */
final class UserAgentLabel
{
    private const BROWSERS = ['Edg/' => 'Edge', 'OPR/' => 'Opera', 'Chrome/' => 'Chrome', 'Firefox/' => 'Firefox', 'Safari/' => 'Safari'];

    private const SYSTEMS = ['Windows' => 'Windows', 'Android' => 'Android', 'iPhone' => 'iPhone', 'iPad' => 'iPad', 'Mac OS X' => 'macOS', 'Linux' => 'Linux'];

    public static function describe(?string $userAgent): string
    {
        if (blank($userAgent)) {
            return 'Dispositivo desconhecido';
        }

        $browser = self::firstMatch($userAgent, self::BROWSERS) ?? 'Navegador desconhecido';
        $system = self::firstMatch($userAgent, self::SYSTEMS);

        return $system === null ? $browser : "{$browser} em {$system}";
    }

    /**
     * @param  array<string, string>  $candidates
     */
    private static function firstMatch(string $userAgent, array $candidates): ?string
    {
        foreach ($candidates as $needle => $label) {
            if (str_contains($userAgent, $needle)) {
                return $label;
            }
        }

        return null;
    }
}
