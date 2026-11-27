<?php

namespace App\Domain\Payments\Data;

use Carbon\CarbonImmutable;

final readonly class PixCharge
{
    public function __construct(
        public string $transactionId,
        public string $status,
        public ?string $webhookToken,
        public string $pixCode,
        public ?string $pixImageUrl,
        public ?CarbonImmutable $expiresAt,
        public ?int $feeCents,
    ) {}
}
