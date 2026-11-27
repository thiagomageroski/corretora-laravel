<?php

namespace App\Domain\Payments;

use RuntimeException;

/**
 * A failed call to the payment provider. When the outcome is not definitive
 * (timeout, 5xx), the provider may still have acted, so callers must look the
 * operation up before retrying it.
 */
final class PaymentProviderError extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly bool $definitive,
        public readonly ?string $providerCode = null,
        public readonly ?int $httpStatus = null,
        /** @var list<string> Request fields the provider reported as invalid, such as "client.phone". */
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }
}
