<?php

namespace App\Domain\Market;

use App\Domain\Market\Data\CandleData;
use App\Enums\CandleInterval;
use App\Models\Asset;
use App\Models\MarketCandle;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class CandleService
{
    private const CACHE_SECONDS = 15;

    /**
     * One-second bars age fast and would flood the table, so they are never stored.
     */
    private const SECOND_BARS_CACHE_SECONDS = 2;

    public function __construct(private ProviderRegistry $providers) {}

    /**
     * Candles come from the provider, cached briefly. If it fails, previously
     * stored real candles are served and flagged stale. Nothing is ever fabricated.
     *
     * @return array{status: 'ok'|'stale'|'unavailable', source: ?string, candles: list<array<string, mixed>>, message: ?string}
     */
    public function history(Asset $asset, CandleInterval $interval, int $limit, ?int $before = null): array
    {
        $provider = $this->providers->find($asset->provider_code);

        if ($provider === null || ! $provider->isConfigured()) {
            return ['status' => 'unavailable', 'source' => null, 'candles' => [], 'message' => 'Nenhum provedor de dados configurado para este ativo.'];
        }

        try {
            $isSecondBars = $interval === CandleInterval::OneSecond;

            $candles = Cache::remember(
                "candles:{$asset->id}:{$interval->value}:{$limit}:".($before ?? 'latest'),
                $isSecondBars ? self::SECOND_BARS_CACHE_SECONDS : self::CACHE_SECONDS,
                function () use ($asset, $provider, $interval, $limit, $isSecondBars, $before): array {
                    $fetched = $provider->fetchCandles((string) $asset->provider_symbol, $interval, $limit, $before === null ? null : CarbonImmutable::createFromTimestampUTC($before));

                    // Providers may round the end time; never return the candle the client already has.
                    if ($before !== null) {
                        $fetched = array_values(array_filter($fetched, fn (CandleData $candle): bool => $candle->openTime->getTimestamp() < $before));
                    }

                    if (! $isSecondBars) {
                        $this->persist($asset, $interval, $provider->code(), $fetched);
                    }

                    return array_map($this->present(...), $fetched);
                },
            );

            return ['status' => 'ok', 'source' => $provider->code(), 'candles' => $candles, 'message' => null];
        } catch (ProviderUnavailable $exception) {
            Log::warning('Candle fetch failed', ['asset' => $asset->symbol, 'error' => $exception->getMessage()]);

            return $this->storedHistory($asset, $interval, $limit, $provider->code(), $before);
        }
    }

    /**
     * @param  list<CandleData>  $candles
     */
    private function persist(Asset $asset, CandleInterval $interval, string $source, array $candles): void
    {
        if ($candles === []) {
            return;
        }

        MarketCandle::query()->upsert(
            array_map(fn (CandleData $candle): array => [
                'asset_id' => $asset->id,
                'interval' => $interval->value,
                'open_time' => $candle->openTime->format('Y-m-d H:i:s'),
                'open' => $candle->open,
                'high' => $candle->high,
                'low' => $candle->low,
                'close' => $candle->close,
                'volume' => $candle->volume,
                'source' => $source,
            ], $candles),
            ['asset_id', 'interval', 'open_time'],
            ['open', 'high', 'low', 'close', 'volume', 'source'],
        );
    }

    /**
     * @return array{status: 'stale'|'unavailable', source: ?string, candles: list<array<string, mixed>>, message: string}
     */
    private function storedHistory(Asset $asset, CandleInterval $interval, int $limit, string $source, ?int $before = null): array
    {
        $candles = MarketCandle::query()
            ->where('asset_id', $asset->id)
            ->where('interval', $interval->value)
            ->when($before !== null, fn ($query) => $query->where('open_time', '<', CarbonImmutable::createFromTimestampUTC((int) $before)->format('Y-m-d H:i:s')))
            ->orderByDesc('open_time')
            ->limit($limit)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (MarketCandle $candle): array => [
                'time' => $candle->open_time->getTimestamp(),
                'open' => $candle->open,
                'high' => $candle->high,
                'low' => $candle->low,
                'close' => $candle->close,
                'volume' => $candle->volume,
            ])
            ->all();

        return $candles === []
            ? ['status' => 'unavailable', 'source' => null, 'candles' => [], 'message' => 'O provedor de dados está indisponível e não há histórico armazenado.']
            : ['status' => 'stale', 'source' => $source, 'candles' => $candles, 'message' => 'Provedor indisponível. Exibindo o último histórico armazenado.'];
    }

    /**
     * @return array<string, mixed>
     */
    private function present(CandleData $candle): array
    {
        return [
            'time' => $candle->openTime->getTimestamp(),
            'open' => $candle->open,
            'high' => $candle->high,
            'low' => $candle->low,
            'close' => $candle->close,
            'volume' => $candle->volume,
        ];
    }
}
