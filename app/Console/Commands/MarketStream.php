<?php

namespace App\Console\Commands;

use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\Data\TradeData;
use App\Domain\Market\LiveQuoteAggregator;
use App\Domain\Market\Providers\BinanceProvider;
use App\Domain\Market\ProviderUnavailable;
use App\Domain\Market\QuoteStore;
use App\Models\Asset;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Ratchet\Client\Connector;
use Ratchet\Client\WebSocket;
use React\EventLoop\Loop;
use React\Socket\Connector as TransportConnector;
use Throwable;

#[Signature('market:stream {--seconds= : Stop after this many seconds}')]
#[Description('Consume the Binance public WebSocket feed, reconnecting automatically')]
class MarketStream extends Command
{
    private const MAX_BACKOFF_SECONDS = 60;

    private const SILENCE_LIMIT_SECONDS = 30;

    private const CLOCK_SKEW_WARNING_MS = 1000;

    private const BROADCAST_EVERY_SECONDS = 0.1;

    private const STORE_EVERY_SECONDS = 0.5;

    /**
     * Binance closes every connection at 24 hours, so rotate ahead of it.
     */
    private const ROTATE_AFTER_SECONDS = 82_800;

    private LiveQuoteAggregator $aggregator;

    private ?WebSocket $connection = null;

    private float $lastMessageAt = 0;

    private float $connectedAt = 0;

    private int $backoffSeconds = 1;

    public function handle(BinanceProvider $provider, QuoteStore $store, LiveQuoteAggregator $aggregator): int
    {
        $this->aggregator = $aggregator;

        $symbols = Asset::query()->active()->where('provider_code', $provider->code())->pluck('provider_symbol')->all();

        if ($symbols === []) {
            $this->warn('No active Binance assets to stream. Run the seeders first.');

            return self::SUCCESS;
        }

        $this->warnAboutClockSkew($provider);
        $this->seedDailyFigures($provider, $symbols);

        $url = $provider->streamUrl($symbols);
        $this->connect($provider, $url);

        Loop::addPeriodicTimer(self::BROADCAST_EVERY_SECONDS, fn () => $this->broadcast($provider, $store));
        Loop::addPeriodicTimer(self::STORE_EVERY_SECONDS, fn () => $this->store($provider, $store));
        Loop::addPeriodicTimer(1, fn () => $this->closeIfUnhealthy());

        if ($this->option('seconds') !== null) {
            Loop::addTimer((float) $this->option('seconds'), function (): void {
                $this->connection?->close();
                Loop::stop();
            });
        }

        Loop::run();

        return self::SUCCESS;
    }

    private function connect(BinanceProvider $provider, string $url): void
    {
        $this->line('Connecting to Binance stream...');

        $transport = new TransportConnector(['dns' => (string) config('market.stream_dns_server'), 'timeout' => 10]);

        (new Connector(Loop::get(), $transport))($url)->then(function (WebSocket $connection) use ($provider, $url): void {
            $this->info('Connected.');
            $this->connection = $connection;
            $this->connectedAt = $this->lastMessageAt = microtime(true);
            $this->backoffSeconds = 1;

            $connection->on('message', function ($message) use ($provider): void {
                $this->lastMessageAt = microtime(true);
                $parsed = $provider->parseStreamMessage((string) $message);

                if ($parsed instanceof TradeData) {
                    $this->aggregator->applyTrade($parsed);
                } elseif ($parsed instanceof QuoteData) {
                    $this->aggregator->applyQuote($parsed);
                }
            });

            $connection->on('close', function ($code = null, $reason = null) use ($provider, $url): void {
                $this->connection = null;
                $this->warn("Connection closed ({$code}). Reconnecting.");
                $this->scheduleReconnect($provider, $url);
            });
        }, function (Throwable $exception) use ($provider, $url): void {
            $this->error("Connection failed: {$exception->getMessage()}");
            $this->scheduleReconnect($provider, $url);
        });
    }

    /**
     * Contract length is measured on the exchange's clock, but settlement runs on
     * this server's, so a drifting clock delays settlement and skews recorded times.
     */
    private function warnAboutClockSkew(BinanceProvider $provider): void
    {
        try {
            $skewMs = $provider->clockSkewMilliseconds();
        } catch (ProviderUnavailable $exception) {
            $this->warn("Could not measure clock skew: {$exception->getMessage()}");

            return;
        }

        if (abs($skewMs) > self::CLOCK_SKEW_WARNING_MS) {
            $message = "Server clock differs from the exchange by about {$skewMs} ms. Synchronize it with NTP: settlement timing and recorded times are affected.";
            $this->warn($message);
            Log::warning($message);
        }
    }

    private function scheduleReconnect(BinanceProvider $provider, string $url): void
    {
        $delay = $this->backoffSeconds;
        $this->backoffSeconds = min($this->backoffSeconds * 2, self::MAX_BACKOFF_SECONDS);

        Loop::addTimer($delay, fn () => $this->connect($provider, $url));
    }

    /**
     * Trades are ignored until a symbol has its daily figures, so they are loaded
     * up front. If this fails, the ticker stream fills them in within a second.
     *
     * @param  list<string>  $symbols
     */
    private function seedDailyFigures(BinanceProvider $provider, array $symbols): void
    {
        try {
            foreach ($provider->fetchQuotes($symbols) as $quote) {
                $this->aggregator->applyQuote($quote);
            }
        } catch (ProviderUnavailable $exception) {
            $this->warn("Could not load daily figures: {$exception->getMessage()}");
        }
    }

    private function broadcast(BinanceProvider $provider, QuoteStore $store): void
    {
        $changes = $this->aggregator->drainForBroadcast();

        if ($changes !== []) {
            $store->broadcast($provider->code(), $changes);
        }
    }

    private function store(BinanceProvider $provider, QuoteStore $store): void
    {
        $quotes = $this->aggregator->drainForStorage();

        if ($quotes === []) {
            return;
        }

        try {
            $store->store($provider->code(), $quotes, announce: false);
        } catch (Throwable $exception) {
            report($exception);
            $this->error("Could not store quotes: {$exception->getMessage()}");
        }
    }

    private function closeIfUnhealthy(): void
    {
        if ($this->connection === null) {
            return;
        }

        $now = microtime(true);

        if ($now - $this->lastMessageAt > self::SILENCE_LIMIT_SECONDS || $now - $this->connectedAt > self::ROTATE_AFTER_SECONDS) {
            $this->connection->close();
        }
    }
}
