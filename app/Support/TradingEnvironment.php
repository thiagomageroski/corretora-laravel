<?php

namespace App\Support;

use App\Enums\Environment;
use Illuminate\Http\Request;

/**
 * Which account, demo or real, the pages show. It is kept in the session and
 * falls back to demo whenever the real account does not exist. Orders still
 * name their account explicitly, so a stale page cannot trade on the wrong one.
 */
final class TradingEnvironment
{
    private const SESSION_KEY = 'trading_environment';

    public static function current(Request $request): Environment
    {
        $user = $request->user();
        $selected = Environment::tryFrom((string) $request->session()->get(self::SESSION_KEY));

        if ($selected === Environment::Real && $user?->findRealWallet() !== null) {
            return Environment::Real;
        }

        return Environment::Demo;
    }

    public static function select(Request $request, Environment $environment): void
    {
        $request->session()->put(self::SESSION_KEY, $environment->value);
    }
}
