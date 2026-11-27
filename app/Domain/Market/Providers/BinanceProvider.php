<?php

namespace App\Domain\Market\Providers;

use App\Domain\Market\Contracts\MarketDataProvider;
use App\Domain\Market\Data\CandleData;
use App\Domain\Market\Data\PricePoint;
use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\Data\TradeData;
use App\Domain\Market\ProviderUnavailable;
use App\Enums\CandleInterval;
use App\Enums\QuoteDelivery;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Public spot market data from data-api.binance.vision. Needs no API key and
 * cannot trade.
 */
class BinanceProvider implements MarketDataProvider
{
    private const BATCH_SIZE = 100;

    public function code(): string
    {
        return 'binance';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function supportsSimulatedTrading(): bool
    {
        return true;
    }

    public function fetchQuotes(array $providerSymbols): array
    {
        $quotes = [];

        foreach (array_chunk($providerSymbols, self::BATCH_SIZE) as $batch) {
            $rows = $this->get('/api/v3/ticker/24hr', [
                'symbols' => json_encode($batch),
                'type' => 'MINI',
            ]);

            foreach ($rows as $row) {
                $quotes[] = new QuoteData(
                    providerSymbol: $row['symbol'],
                    price: $row['lastPrice'],
                    open: $row['openPrice'],
                    high: $row['highPrice'],
                    low: $row['lowPrice'],
                    volume: $row['volume'],
                    sourceAt: CarbonImmutable::createFromTimestampMsUTC($row['closeTime']),
                    delivery: QuoteDelivery::Polling,
                );
            }
        }

        return $quotes;
    }

    public function fetchCandles(string $providerSymbol, CandleInterval $interval, int $limit, ?CarbonImmutable $before = null): array
    {
        $rows = $this->get('/api/v3/klines', array_filter([
            'symbol' => $providerSymbol,
            'interval' => $interval->value,
            'limit' => $limit,
            // endTime is inclusive: one millisecond earlier keeps the candle at $before out.
            'endTime' => $before === null ? null : $before->getTimestampMs() - 1,
        ], fn (mixed $value): bool => $value !== null));

        return array_map(fn (array $row): CandleData => new CandleData(
            openTime: CarbonImmutable::createFromTimestampMsUTC($row[0]),
            open: $row[1],
            high: $row[2],
            low: $row[3],
            close: $row[4],
            volume: $row[5],
        ), $rows);
    }

    /**
     * Uses the close of the one-second kline ending at the instant. Binance
     * returns zero-volume klines for idle seconds, carrying the last price.
     */
    public function priceBefore(string $providerSymbol, CarbonImmutable $instant): ?PricePoint
    {
        $openTimeMs = $instant->getTimestampMs() - 1000;

        $rows = $this->get('/api/v3/klines', [
            'symbol' => $providerSymbol,
            'interval' => '1s',
            'startTime' => $openTimeMs,
            'endTime' => $openTimeMs,
            'limit' => 1,
        ]);

        $kline = $rows[0] ?? null;

        if ($kline === null || (int) $kline[0] !== $openTimeMs) {
            return null;
        }

        return new PricePoint(
            price: $kline[4],
            at: CarbonImmutable::createFromTimestampMsUTC($kline[6]),
            source: $this->code(),
        );
    }

    /**
     * @return list<string> Symbols currently trading with the given asset on either side.
     *
     * @throws ProviderUnavailable
     */
    public function tradingSymbols(string $asset): array
    {
        $info = $this->get('/api/v3/exchangeInfo', ['symbolStatus' => 'TRADING', 'showPermissionSets' => 'false']);

        $symbols = [];
        foreach ($info['symbols'] ?? [] as $symbol) {
            // Either side: BTCUSDT quotes in USDT, USDTBRL prices USDT in reais.
            if ($symbol['quoteAsset'] === $asset || ($symbol['baseAsset'] ?? null) === $asset) {
                $symbols[] = $symbol['symbol'];
            }
        }

        return $symbols;
    }

    /**
     * Local clock minus exchange clock, compensating for half the round trip.
     *
     * @throws ProviderUnavailable
     */
    public function clockSkewMilliseconds(): int
    {
        $sentAt = (int) round(microtime(true) * 1000);
        $serverTime = (int) $this->get('/api/v3/time', [])['serverTime'];
        $receivedAt = (int) round(microtime(true) * 1000);

        return intdiv($sentAt + $receivedAt, 2) - $serverTime;
    }

    /**
     * @param  list<string>  $providerSymbols
     */
    public function streamUrl(array $providerSymbols): string
    {
        $streams = [];

        foreach ($providerSymbols as $symbol) {
            $streams[] = strtolower($symbol).'@miniTicker';
            $streams[] = strtolower($symbol).'@aggTrade';
        }

        return rtrim((string) config('market.providers.binance.stream_url'), '/').'/stream?streams='.implode('/', $streams);
    }

    /**
     * Parse one combined-stream message: a mini ticker becomes a quote, an aggregate
     * trade becomes a trade, and anything else is ignored.
     */
    public function parseStreamMessage(string $message): QuoteData|TradeData|null
    {
        $data = json_decode($message, true)['data'] ?? null;

        if (! is_array($data)) {
            return null;
        }

        if (($data['e'] ?? null) === 'aggTrade') {
            return new TradeData(
                providerSymbol: $data['s'],
                price: $data['p'],
                quantity: $data['q'],
                tradedAt: CarbonImmutable::createFromTimestampMsUTC($data['T']),
            );
        }

        if (($data['e'] ?? null) !== '24hrMiniTicker') {
            return null;
        }

        return new QuoteData(
            providerSymbol: $data['s'],
            price: $data['c'],
            open: $data['o'],
            high: $data['h'],
            low: $data['l'],
            volume: $data['v'],
            sourceAt: CarbonImmutable::createFromTimestampMsUTC($data['E']),
            delivery: QuoteDelivery::Stream,
        );
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<int|string, mixed>
     */
    private function get(string $path, array $query): array
    {
        try {
            $response = $this->client()->get($path, $query);
        } catch (ConnectionException $exception) {
            throw new ProviderUnavailable("Binance is unreachable: {$exception->getMessage()}", previous: $exception);
        }

        return $this->decode($response);
    }

    /**
     * @return array<int|string, mixed>
     */
    private function decode(Response $response): array
    {
        if ($response->failed()) {
            throw new ProviderUnavailable("Binance responded with HTTP {$response->status()}.");
        }

        return $response->json() ?? [];
    }

    private function client(): PendingRequest
    {
        return Http::baseUrl((string) config('market.providers.binance.rest_url'))
            ->acceptJson()
            ->connectTimeout(3)
            ->timeout(8)
            ->retry(2, 200, throw: false);
    }
}
