<?php

namespace App\Domain\Market\Providers;

use App\Domain\Market\Contracts\MarketDataProvider;
use App\Domain\Market\Data\CandleData;
use App\Domain\Market\Data\PricePoint;
use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\ProviderUnavailable;
use App\Enums\CandleInterval;
use App\Enums\QuoteDelivery;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

/**
 * REST quotes and candles from Twelve Data. Not validated against the live API
 * yet because no key is configured; the request and response shapes follow its
 * published documentation for /quote and /time_series.
 */
class TwelveDataProvider implements MarketDataProvider
{
    private const INTERVALS = [
        '1m' => '1min',
        '5m' => '5min',
        '15m' => '15min',
        '30m' => '30min',
        '1h' => '1h',
        '4h' => '4h',
        '1d' => '1day',
    ];

    public function code(): string
    {
        return 'twelvedata';
    }

    public function isConfigured(): bool
    {
        return filled(config('market.providers.twelvedata.api_key'));
    }

    /**
     * REST polling has no second-level price at expiry, so assets from this
     * provider can be viewed but not traded.
     */
    public function supportsSimulatedTrading(): bool
    {
        return false;
    }

    public function fetchQuotes(array $providerSymbols): array
    {
        $quotes = [];

        foreach ($providerSymbols as $symbol) {
            $row = $this->get('/quote', ['symbol' => $symbol]);

            $quotes[] = new QuoteData(
                providerSymbol: $symbol,
                price: $row['close'],
                open: $row['open'] ?? null,
                high: $row['high'] ?? null,
                low: $row['low'] ?? null,
                volume: $row['volume'] ?? null,
                sourceAt: CarbonImmutable::createFromTimestampUTC($row['last_quote_at'] ?? $row['timestamp']),
                delivery: QuoteDelivery::Polling,
            );
        }

        return $quotes;
    }

    public function fetchCandles(string $providerSymbol, CandleInterval $interval, int $limit, ?CarbonImmutable $before = null): array
    {
        $providerInterval = self::INTERVALS[$interval->value]
            ?? throw new ProviderUnavailable("Twelve Data does not offer {$interval->value} candles.");

        $body = $this->get('/time_series', array_filter([
            'symbol' => $providerSymbol,
            'interval' => $providerInterval,
            'outputsize' => $limit,
            'timezone' => 'UTC',
            'order' => 'asc',
            // end_date is inclusive: one second earlier keeps the candle at $before out.
            'end_date' => $before?->subSecond()->format('Y-m-d H:i:s'),
        ], fn (mixed $value): bool => $value !== null));

        return array_map(fn (array $row): CandleData => new CandleData(
            openTime: CarbonImmutable::parse($row['datetime'], 'UTC'),
            open: $row['open'],
            high: $row['high'],
            low: $row['low'],
            close: $row['close'],
            volume: $row['volume'] ?? null,
        ), $body['values'] ?? []);
    }

    public function priceBefore(string $providerSymbol, CarbonImmutable $instant): ?PricePoint
    {
        return null;
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private function get(string $path, array $query): array
    {
        if (! $this->isConfigured()) {
            throw new ProviderUnavailable('TWELVEDATA_API_KEY is not configured.');
        }

        $this->consumeCredit();

        try {
            $response = Http::baseUrl((string) config('market.providers.twelvedata.rest_url'))
                ->acceptJson()
                ->connectTimeout(3)
                ->timeout(8)
                ->get($path, [...$query, 'apikey' => config('market.providers.twelvedata.api_key')]);
        } catch (ConnectionException) {
            throw new ProviderUnavailable('Twelve Data is unreachable.');
        }

        $body = $response->json();

        if ($response->failed() || ! is_array($body) || ($body['status'] ?? 'ok') === 'error') {
            $message = is_array($body) ? ($body['message'] ?? 'unknown error') : 'invalid response';

            throw new ProviderUnavailable("Twelve Data error (HTTP {$response->status()}): {$message}");
        }

        return $body;
    }

    private function consumeCredit(): void
    {
        $allowed = RateLimiter::attempt(
            'twelvedata-credits',
            (int) config('market.providers.twelvedata.credits_per_minute'),
            fn (): bool => true,
        );

        if ($allowed === false) {
            throw new ProviderUnavailable('Twelve Data credit budget for this minute is exhausted.');
        }
    }
}
