<?php

namespace App\Domain\Market\Contracts;

use App\Domain\Market\Data\CandleData;
use App\Domain\Market\Data\PricePoint;
use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\ProviderUnavailable;
use App\Enums\CandleInterval;
use Carbon\CarbonImmutable;

/**
 * Read-only market data. Nothing here can place an order: execution, if it ever
 * exists, belongs to a separate contract backed by an authorized intermediary.
 */
interface MarketDataProvider
{
    public function code(): string;

    public function isConfigured(): bool;

    /**
     * Whether the provider offers both a live feed and second-level prices at
     * expiry, which the settlement rules need before an asset can be traded.
     */
    public function supportsSimulatedTrading(): bool;

    /**
     * @param  list<string>  $providerSymbols
     * @return list<QuoteData>
     *
     * @throws ProviderUnavailable
     */
    public function fetchQuotes(array $providerSymbols): array;

    /**
     * The latest candles, or with $before the ones that opened before that
     * instant (older history, loaded as the chart is dragged back).
     *
     * @return list<CandleData> Oldest first.
     *
     * @throws ProviderUnavailable
     */
    public function fetchCandles(string $providerSymbol, CandleInterval $interval, int $limit, ?CarbonImmutable $before = null): array;

    /**
     * The last traded price strictly before the given instant, or null when the
     * provider has not published it yet.
     *
     * @throws ProviderUnavailable
     */
    public function priceBefore(string $providerSymbol, CarbonImmutable $instant): ?PricePoint;
}
