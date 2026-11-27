<?php

namespace App\Support;

use App\Models\Wallet;

final class WalletSummary
{
    /**
     * @return array{environment: string|null, currency: string|null, available_cents: int, reserved_cents: int}|null
     */
    public static function of(?Wallet $wallet): ?array
    {
        if ($wallet === null) {
            return null;
        }

        $balance = $wallet->balance();

        return [
            'environment' => $wallet->account->environment->value,
            'currency' => $wallet->currency,
            'available_cents' => $balance->availableCents,
            'reserved_cents' => $balance->reservedCents,
        ];
    }
}
