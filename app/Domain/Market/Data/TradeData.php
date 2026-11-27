<?php

namespace App\Domain\Market\Data;

use Carbon\CarbonImmutable;

final readonly class TradeData
{
    public function __construct(
        public string $providerSymbol,
        public string $price,
        public string $quantity,
        public CarbonImmutable $tradedAt,
    ) {}
}
