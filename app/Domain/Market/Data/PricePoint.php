<?php

namespace App\Domain\Market\Data;

use Carbon\CarbonImmutable;

final readonly class PricePoint
{
    public function __construct(
        public string $price,
        public CarbonImmutable $at,
        public string $source,
    ) {}
}
