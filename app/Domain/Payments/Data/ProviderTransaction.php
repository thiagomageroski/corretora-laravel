<?php

namespace App\Domain\Payments\Data;

use Carbon\CarbonImmutable;

/**
 * A charge as the provider reports it when queried directly.
 */
final readonly class ProviderTransaction
{
    public function __construct(
        public string $id,
        public ?string $identifier,
        public string $status,
        public int $amountCents,
        public string $currency,
        public ?string $payerDocument,
        public ?CarbonImmutable $paidAt,
        public ?string $description,
    ) {}
}
