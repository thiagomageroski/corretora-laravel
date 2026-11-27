<?php

namespace App\Domain\Payments;

/**
 * Where the provider sends payment notifications: this app's own address
 * (APP_URL) plus the webhook route. AmploPay only accepts public HTTPS
 * addresses, so on a local machine there is none, and deposits and
 * withdrawals stay unavailable until the app runs on its HTTPS domain.
 */
final class PaymentCallback
{
    public static function url(): ?string
    {
        $base = rtrim((string) config('app.url'), '/');
        $host = (string) parse_url($base, PHP_URL_HOST);

        if (! str_starts_with($base, 'https://') || $host === '' || self::isLocal($host)) {
            return null;
        }

        return $base.route('webhooks.amplopay', absolute: false);
    }

    private static function isLocal(string $host): bool
    {
        if ($host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.test')) {
            return true;
        }

        return filter_var($host, FILTER_VALIDATE_IP) !== false
            && filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
