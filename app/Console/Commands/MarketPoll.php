<?php

namespace App\Console\Commands;

use App\Domain\Market\ProviderRegistry;
use App\Domain\Market\ProviderUnavailable;
use App\Domain\Market\QuoteStore;
use App\Models\Asset;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

#[Signature('market:poll {provider : Provider code, such as binance or twelvedata} {--limit= : Maximum symbols in this run}')]
#[Description('Fetch quotes over REST, rotating through the catalog to respect provider limits')]
class MarketPoll extends Command
{
    public function handle(ProviderRegistry $providers, QuoteStore $store): int
    {
        $code = (string) $this->argument('provider');
        $provider = $providers->find($code);

        if ($provider === null || ! $provider->isConfigured()) {
            $this->warn("Provider [{$code}] is unknown or not configured; nothing fetched.");

            return self::SUCCESS;
        }

        $symbols = Asset::query()->active()->where('provider_code', $code)->orderBy('id')->pluck('provider_symbol')->all();
        $batch = $this->nextBatch($code, $symbols);

        try {
            $stored = $store->store($code, $provider->fetchQuotes($batch));
        } catch (ProviderUnavailable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info("Stored {$stored} quotes from {$code}.");

        return self::SUCCESS;
    }

    /**
     * @param  list<string>  $symbols
     * @return list<string>
     */
    private function nextBatch(string $code, array $symbols): array
    {
        $limit = $this->option('limit');

        if ($limit === null || $symbols === []) {
            return $symbols;
        }

        $cursorKey = "market:poll-cursor:{$code}";
        $cursor = (int) Cache::get($cursorKey, 0) % count($symbols);
        $batch = array_slice([...$symbols, ...$symbols], $cursor, min((int) $limit, count($symbols)));

        Cache::forever($cursorKey, $cursor + count($batch));

        return $batch;
    }
}
