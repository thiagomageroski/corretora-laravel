<?php

namespace App\Domain\Market\Data;

use Carbon\CarbonImmutable;

final readonly class CandleData
{
    public function __construct(
        public CarbonImmutable $openTime,
        public string $open,
        public string $high,
        public string $low,
        public string $close,
        public ?string $volume,
    ) {}
}
