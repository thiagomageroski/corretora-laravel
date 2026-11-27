<?php

namespace App\Domain\Market;

use App\Domain\Market\Data\QuoteData;
use App\Events\QuotesUpdated;
use App\Models\Asset;
use App\Models\MarketQuote;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class QuoteStore
{
    private const BROADCAST_WARNING_INTERVAL_SECONDS = 300;

    /**
     * Keeps every broadcast under Reverb's request size limit.
     */
    private const BROADCAST_BATCH_SIZE = 25;

    /** @var array<string, array<string, int>> */
    private array $assetIdsByProvider = [];

    /**
     * Save the latest quotes and, unless the caller broadcasts on its own schedule,
     * announce them. A broadcasting failure never loses data: the quotes are stored
     * and clients can poll them.
     *
     * @param  list<QuoteData>  $quotes
     * @return int Number of quotes stored.
     */
    public function store(string $providerCode, array $quotes, bool $announce = true): int
    {
        if ($quotes === []) {
            return 0;
        }

        $assetIds = Asset::query()
            ->where('provider_code', $providerCode)
            ->whereIn('provider_symbol', array_map(fn (QuoteData $quote): string => $quote->providerSymbol, $quotes))
            ->pluck('id', 'provider_symbol');

        $now = now('UTC')->format('Y-m-d H:i:s.v');
        $rows = [];

        foreach ($quotes as $quote) {
            $assetId = $assetIds[$quote->providerSymbol] ?? null;

            if ($assetId === null) {
                continue;
            }

            $rows[] = [
                'asset_id' => $assetId,
                'price' => $quote->price,
                'open_24h' => $quote->open,
                'high_24h' => $quote->high,
                'low_24h' => $quote->low,
                'volume_24h' => $quote->volume,
                'source' => $providerCode,
                'delivery' => $quote->delivery->value,
                'source_at' => $quote->sourceAt->format('Y-m-d H:i:s.v'),
                'received_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        MarketQuote::query()->upsert(
            $rows,
            ['asset_id'],
            ['price', 'open_24h', 'high_24h', 'low_24h', 'volume_24h', 'source', 'delivery', 'source_at', 'received_at', 'updated_at'],
        );

        if ($announce) {
            $this->announce(array_map(fn (array $row): array => [
                'asset_id' => $row['asset_id'],
                'price' => $row['price'],
                'open_24h' => $row['open_24h'],
                'source_at' => $row['source_at'],
            ], $rows));
        }

        return count($rows);
    }

    /**
     * Announce live changes without touching the database, so the screen can update
     * more often than quotes are stored.
     *
     * @param  list<array{quote: QuoteData, traded: string}>  $changes
     */
    public function broadcast(string $providerCode, array $changes): void
    {
        $this->assetIdsByProvider[$providerCode] ??= Asset::query()
            ->where('provider_code', $providerCode)
            ->pluck('id', 'provider_symbol')
            ->all();

        $payload = [];

        foreach ($changes as $change) {
            $assetId = $this->assetIdsByProvider[$providerCode][$change['quote']->providerSymbol] ?? null;

            if ($assetId !== null) {
                $payload[] = [
                    'asset_id' => $assetId,
                    'price' => $change['quote']->price,
                    'open_24h' => $change['quote']->open,
                    'source_at' => $change['quote']->sourceAt->format('Y-m-d H:i:s.v'),
                    'traded' => $change['traded'],
                ];
            }
        }

        $this->announce($payload);
    }

    /**
     * @param  list<array{asset_id: int, price: string, open_24h: ?string, source_at: string, traded?: string}>  $quotes
     */
    private function announce(array $quotes): void
    {
        try {
            foreach (array_chunk($quotes, self::BROADCAST_BATCH_SIZE) as $batch) {
                QuotesUpdated::dispatch($batch);
            }
        } catch (Throwable $exception) {
            if (Cache::add('market:broadcast-failure-logged', true, self::BROADCAST_WARNING_INTERVAL_SECONDS)) {
                Log::warning('Quote broadcast failed; clients will fall back to polling', ['error' => $exception->getMessage()]);
            }
        }
    }
}
