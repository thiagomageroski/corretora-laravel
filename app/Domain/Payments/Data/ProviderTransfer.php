<?php

namespace App\Domain\Payments\Data;

/**
 * A payout as the provider reports it.
 */
final readonly class ProviderTransfer
{
    public function __construct(
        public string $id,
        public ?string $identifier,
        public string $status,
        public int $amountCents,
        public ?int $feeCents,
        public ?int $receivedCents,
        public ?string $endToEndId,
        public ?string $reason,
        public ?string $webhookToken = null,
    ) {}
}
