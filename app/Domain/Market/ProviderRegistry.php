<?php

namespace App\Domain\Market;

use App\Domain\Market\Contracts\MarketDataProvider;
use App\Domain\Market\Providers\BinanceProvider;
use App\Domain\Market\Providers\TwelveDataProvider;

class ProviderRegistry
{
    public function __construct(
        private BinanceProvider $binance,
        private TwelveDataProvider $twelveData,
    ) {}

    public function find(?string $code): ?MarketDataProvider
    {
        return match ($code) {
            'binance' => $this->binance,
            'twelvedata' => $this->twelveData,
            default => null,
        };
    }
}
