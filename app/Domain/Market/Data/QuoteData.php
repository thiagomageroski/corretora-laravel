<?php

namespace App\Domain\Market\Data;

use App\Enums\QuoteDelivery;
use Carbon\CarbonImmutable;

final readonly class QuoteData
{
    public function __construct(
        public string $providerSymbol,
        public string $price,
        public ?string $open,
        public ?string $high,
        public ?string $low,
        public ?string $volume,
        public CarbonImmutable $sourceAt,
        public QuoteDelivery $delivery,
    ) {}
}
