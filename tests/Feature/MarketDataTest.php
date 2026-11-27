<?php

namespace Tests\Feature;

use App\Domain\Market\CandleService;
use App\Domain\Market\MarketHours;
use App\Domain\Market\Providers\BinanceProvider;
use App\Domain\Market\Providers\TwelveDataProvider;
use App\Domain\Market\ProviderUnavailable;
use App\Domain\Market\QuoteStore;
use App\Enums\CandleInterval;
use App\Enums\QuoteDelivery;
use App\Models\Asset;
use App\Models\AssetCategory;
use App\Models\MarketCandle;
use App\Models\MarketQuote;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;
use Illuminate\Support\Str;
use App\Enums\TradeDirection;
use App\Domain\Trading\OpenPosition;

class MarketDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();
    }

    #[Test]
    public function the_catalog_meets_the_requested_size_per_category(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $counts = AssetCategory::query()->withCount('assets')->pluck('assets_count', 'code');

        $this->assertGreaterThan(200, Asset::query()->count());
        $this->assertGreaterThan(60, $counts['forex']);
        $this->assertGreaterThan(50, $counts['crypto']);
        $this->assertGreaterThan(100, $counts['stocks']);
        $this->assertSame(10, $counts['indices']);
        $this->assertSame(13, $counts['commodities']);
        $this->assertSame(10, $counts['etfs']);
        $this->assertSame(0, MarketQuote::query()->count(), 'Seeding must never create prices.');
    }

    #[Test]
    public function binance_stream_messages_become_quotes(): void
    {
        $quote = app(BinanceProvider::class)->parseStreamMessage((string) json_encode([
            'stream' => 'btcusdt@miniTicker',
            'data' => ['e' => '24hrMiniTicker', 'E' => 1_794_009_124_000, 's' => 'BTCUSDT', 'c' => '75982.15', 'o' => '75000', 'h' => '76000', 'l' => '74000', 'v' => '10', 'q' => '750000'],
        ]));

        $this->assertSame('BTCUSDT', $quote?->providerSymbol);
        $this->assertSame('75982.15', $quote->price);
        $this->assertSame(QuoteDelivery::Stream, $quote->delivery);
        $this->assertSame(1_794_009_124_000, $quote->sourceAt->getTimestampMs());
    }

    #[Test]
    public function other_stream_messages_are_ignored(): void
    {
        $this->assertNull(app(BinanceProvider::class)->parseStreamMessage('{"result":null,"id":1}'));
        $this->assertNull(app(BinanceProvider::class)->parseStreamMessage('not json'));
    }

    #[Test]
    public function quotes_for_unknown_symbols_are_discarded(): void
    {
        $asset = Asset::factory()->state(['provider_symbol' => 'BTCUSDT'])->create();
        Http::fake(['*/ticker/24hr*' => Http::response([
            ['symbol' => 'BTCUSDT', 'lastPrice' => '76000', 'openPrice' => '75000', 'highPrice' => '77000', 'lowPrice' => '74000', 'volume' => '5', 'closeTime' => 1_794_009_124_000],
            ['symbol' => 'NOPEUSDT', 'lastPrice' => '1', 'openPrice' => '1', 'highPrice' => '1', 'lowPrice' => '1', 'volume' => '1', 'closeTime' => 1_794_009_124_000],
        ])]);

        $stored = app(QuoteStore::class)->store('binance', app(BinanceProvider::class)->fetchQuotes(['BTCUSDT', 'NOPEUSDT']));

        $this->assertSame(1, $stored);
        $this->assertSame(0, bccomp('76000', (string) MarketQuote::query()->where('asset_id', $asset->id)->value('price'), 10));
    }

    #[Test]
    public function candles_fall_back_to_stored_history_and_flag_it_when_the_provider_fails(): void
    {
        $asset = Asset::factory()->create();
        MarketCandle::query()->create(['asset_id' => $asset->id, 'interval' => '1m', 'open_time' => now()->subMinute(), 'open' => '1', 'high' => '2', 'low' => '1', 'close' => '2', 'source' => 'binance']);
        Http::fake(['*' => Http::response('down', 503)]);

        $result = app(CandleService::class)->history($asset, CandleInterval::OneMinute, 10);

        $this->assertSame('stale', $result['status']);
        $this->assertCount(1, $result['candles']);
    }

    #[Test]
    public function no_candles_are_invented_when_there_is_no_data(): void
    {
        $withProvider = Asset::factory()->create();
        $withoutProvider = Asset::factory()->withoutProvider()->create();
        Http::fake(['*' => Http::response('down', 503)]);
        $service = app(CandleService::class);

        foreach ([$withProvider, $withoutProvider] as $asset) {
            $result = $service->history($asset, CandleInterval::OneMinute, 10);
            $this->assertSame('unavailable', $result['status']);
            $this->assertSame([], $result['candles']);
        }
    }

    #[Test]
    public function candles_are_cached_and_persisted(): void
    {
        $asset = Asset::factory()->create();
        Http::fake(['*/klines*' => Http::response([[1_794_000_000_000, '1', '3', '0.5', '2', '10', 1_794_000_059_999, '20', 5, '1', '1', '0']])]);
        $service = app(CandleService::class);

        $first = $service->history($asset, CandleInterval::OneMinute, 10);
        $service->history($asset, CandleInterval::OneMinute, 10);

        $this->assertSame('ok', $first['status']);
        $this->assertSame(1_794_000_000, $first['candles'][0]['time']);
        Http::assertSentCount(1);
        $this->assertSame(1, MarketCandle::query()->count());
    }

    #[Test]
    public function older_history_is_asked_before_the_oldest_candle_the_chart_has(): void
    {
        $asset = Asset::factory()->create();
        $oldest = 1_794_000_000;
        Http::fake(['*/klines*' => Http::response([
            [($oldest - 120) * 1000, '1', '3', '0.5', '2', '10', ($oldest - 61) * 1000, '20', 5, '1', '1', '0'],
            [($oldest - 60) * 1000, '2', '4', '1.5', '3', '10', ($oldest - 1) * 1000, '20', 5, '1', '1', '0'],
            // A provider rounding its end time must not hand back the candle the client already has.
            [$oldest * 1000, '3', '5', '2.5', '4', '10', ($oldest + 59) * 1000, '20', 5, '1', '1', '0'],
        ])]);

        $result = app(CandleService::class)->history($asset, CandleInterval::OneMinute, 500, $oldest);

        $this->assertSame([$oldest - 120, $oldest - 60], array_column($result['candles'], 'time'));
        Http::assertSent(fn ($request) => str_contains($request->url(), 'endTime='.($oldest * 1000 - 1)));
    }

    #[Test]
    public function the_candles_endpoint_accepts_a_before_cursor(): void
    {
        $asset = Asset::factory()->create();
        Http::fake(['*/klines*' => Http::response([[1_793_999_940_000, '1', '3', '0.5', '2', '10', 1_793_999_999_999, '20', 5, '1', '1', '0']])]);

        $this->actingAs(User::factory()->create())
            ->getJson("/api/v1/assets/{$asset->id}/candles?interval=1m&limit=500&before=1794000000")
            ->assertOk()
            ->assertJsonPath('candles.0.time', 1_793_999_940);
    }

    #[Test]
    public function twelve_data_is_unavailable_without_a_key_and_makes_no_requests(): void
    {
        config(['market.providers.twelvedata.api_key' => null]);
        Http::fake();

        $provider = app(TwelveDataProvider::class);
        $this->assertFalse($provider->isConfigured());
        $this->assertFalse($provider->supportsSimulatedTrading());

        try {
            $provider->fetchQuotes(['EUR/USD']);
            $this->fail('Expected ProviderUnavailable.');
        } catch (ProviderUnavailable) {
            Http::assertNothingSent();
        }
    }

    #[Test]
    public function twelve_data_responses_are_mapped_and_the_key_stays_on_the_server(): void
    {
        config(['market.providers.twelvedata.api_key' => 'secret']);
        Http::fake([
            '*/quote*' => Http::response(['symbol' => 'EUR/USD', 'close' => '1.08', 'open' => '1.07', 'high' => '1.09', 'low' => '1.06', 'timestamp' => 1_794_000_000, 'last_quote_at' => 1_794_000_060]),
            '*/time_series*' => Http::response(['status' => 'ok', 'values' => [['datetime' => '2026-11-06 12:00:00', 'open' => '1', 'high' => '2', 'low' => '0.5', 'close' => '1.5']]]),
        ]);
        $provider = app(TwelveDataProvider::class);

        $quote = $provider->fetchQuotes(['EUR/USD'])[0];
        $candle = $provider->fetchCandles('EUR/USD', CandleInterval::OneDay, 5)[0];

        $this->assertSame('1.08', $quote->price);
        $this->assertSame(1_794_000_060, $quote->sourceAt->getTimestamp());
        $this->assertNull($candle->volume);
        $this->assertSame('2026-11-06T12:00:00+00:00', $candle->openTime->toIso8601String());
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/time_series') ? $request['interval'] === '1day' && $request['timezone'] === 'UTC' : true);
    }

    #[Test]
    public function twelve_data_errors_and_the_credit_budget_stop_requests(): void
    {
        config(['market.providers.twelvedata.api_key' => 'secret', 'market.providers.twelvedata.credits_per_minute' => 1]);
        Cache::flush();
        Http::fake(['*' => Http::response(['status' => 'error', 'code' => 429, 'message' => 'limit'], 429)]);
        $provider = app(TwelveDataProvider::class);

        try {
            $provider->fetchQuotes(['EUR/USD']);
            $this->fail('Expected ProviderUnavailable.');
        } catch (ProviderUnavailable $exception) {
            $this->assertStringContainsString('limit', $exception->getMessage());
        }

        try {
            $provider->fetchQuotes(['EUR/USD']);
            $this->fail('Expected the credit budget to stop the second call.');
        } catch (ProviderUnavailable $exception) {
            $this->assertStringContainsString('budget', $exception->getMessage());
        }

        Http::assertSentCount(1);
    }

    /**
     * @return array<string, array{string, string, bool}>
     */
    public static function sessions(): array
    {
        return [
            'crypto on a sunday' => ['always', '2026-11-08 03:00:00', true],
            'NY stocks at open, in UTC' => ['us_equities', '2026-11-06 14:30:00', true],
            'NY stocks just before open' => ['us_equities', '2026-11-06 14:29:59', false],
            'NY stocks at the close' => ['us_equities', '2026-11-06 21:00:00', false],
            'NY stocks on saturday' => ['us_equities', '2026-11-07 15:00:00', false],
            'forex on saturday' => ['fx', '2026-11-07 12:00:00', false],
            'forex on sunday before open' => ['fx', '2026-11-08 21:59:00', false],
            'forex on sunday after open' => ['fx', '2026-11-08 22:01:00', true],
            'forex on wednesday' => ['fx', '2026-11-04 12:00:00', true],
            'forex on friday after close' => ['fx', '2026-11-06 22:01:00', false],
            'unknown session stays closed' => ['nope', '2026-11-04 12:00:00', false],
        ];
    }

    #[Test]
    #[DataProvider('sessions')]
    public function market_hours_follow_each_session(string $session, string $utc, bool $expected): void
    {
        $this->assertSame($expected, app(MarketHours::class)->isOpen($session, CarbonImmutable::parse($utc, 'UTC')));
    }

    #[Test]
    public function the_poll_command_stores_real_provider_quotes(): void
    {
        $asset = Asset::factory()->state(['provider_symbol' => 'ETHUSDT'])->create();
        Http::fake(['*/ticker/24hr*' => Http::response([['symbol' => 'ETHUSDT', 'lastPrice' => '3000', 'openPrice' => '2900', 'highPrice' => '3100', 'lowPrice' => '2800', 'volume' => '5', 'closeTime' => 1_794_009_124_000]])]);

        $this->artisan('market:poll binance')->assertSuccessful();

        $this->assertDatabaseHas('market_quotes', ['asset_id' => $asset->id, 'source' => 'binance', 'delivery' => 'polling']);
    }

    #[Test]
    public function the_poll_command_rotates_through_the_catalog_within_its_limit(): void
    {
        Asset::factory()->state(['provider_symbol' => 'AAAUSDT'])->create();
        Asset::factory()->state(['provider_symbol' => 'BBBUSDT'])->create();
        Asset::factory()->state(['provider_symbol' => 'CCCUSDT'])->create();
        Http::fake(['*' => Http::response([])]);

        $this->artisan('market:poll binance --limit=2')->assertSuccessful();
        $this->artisan('market:poll binance --limit=2')->assertSuccessful();

        $requested = [];
        Http::assertSent(function (Request $request) use (&$requested): bool {
            $requested = [...$requested, ...json_decode($request['symbols'], true)];

            return true;
        });
        $this->assertSame(['AAAUSDT', 'BBBUSDT', 'CCCUSDT', 'AAAUSDT'], $requested);
    }

    #[Test]
    public function catalog_sync_disables_delisted_assets_and_refuses_empty_listings(): void
    {
        $listed = Asset::factory()->state(['provider_symbol' => 'BTCUSDT'])->create();
        // Priced in reais, with USDT as the base: still a listed pair.
        $digitalDollar = Asset::factory()->state(['symbol' => 'USDT/BRL', 'provider_symbol' => 'USDTBRL', 'price_basis' => 'BRL'])->create();
        $delisted = Asset::factory()->state(['provider_symbol' => 'OLDUSDT'])->create();

        Http::fake(['*/exchangeInfo*' => Http::sequence()
            ->push(['symbols' => [
                ['symbol' => 'BTCUSDT', 'baseAsset' => 'BTC', 'quoteAsset' => 'USDT', 'status' => 'TRADING'],
                ['symbol' => 'USDTBRL', 'baseAsset' => 'USDT', 'quoteAsset' => 'BRL', 'status' => 'TRADING'],
            ]])
            ->push(['symbols' => []])]);

        $this->artisan('market:sync-catalog')->assertSuccessful();
        $this->assertTrue($listed->fresh()->is_active);
        $this->assertTrue($digitalDollar->fresh()->is_active);
        $this->assertFalse($delisted->fresh()->is_active);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.availability_changed', 'subject_id' => $delisted->id]);

        $this->artisan('market:sync-catalog')->assertFailed();
        $this->assertTrue($listed->fresh()->is_active);
    }

    #[Test]
    public function binance_carries_only_crypto(): void
    {
        $this->seed(DatabaseSeeder::class);

        $categories = Asset::query()->where('provider_code', 'binance')->with('category')->get()->pluck('category.code')->unique()->values()->all();

        $this->assertSame(['crypto'], $categories);
        $this->assertFalse(Asset::query()->whereIn('symbol', ['EUR/USDT', 'USDT/BRL', 'XAUT/USD', 'PAXG/USD'])->exists());
    }

    #[Test]
    public function retiring_the_currency_pairs_keeps_traded_ones_for_history_and_settlement(): void
    {
        $this->seed(DatabaseSeeder::class);
        (require database_path('migrations/2026_11_10_134111_add_binance_currency_pairs_and_gold.php'))->up();
        $untraded = Asset::query()->where('symbol', 'EUR/USDT')->firstOrFail();
        $traded = Asset::query()->where('symbol', 'USDT/BRL')->firstOrFail();
        MarketQuote::query()->create(['asset_id' => $untraded->id, 'price' => '1.1200000000', 'source' => 'binance', 'delivery' => QuoteDelivery::Stream->value, 'source_at' => now(), 'received_at' => now()]);
        MarketQuote::query()->create(['asset_id' => $traded->id, 'price' => '5.5550000000', 'source' => 'binance', 'delivery' => QuoteDelivery::Stream->value, 'source_at' => now(), 'received_at' => now()]);
        $user = User::factory()->withDemoWallet()->create();
        $open = app(OpenPosition::class)->handle($user, $traded->load('quote'), TradeDirection::Call, 5_000, 60, (string) Str::uuid());

        (require database_path('migrations/2026_11_27_014627_retire_binance_currency_pairs_and_gold.php'))->up();

        $this->assertNull($untraded->fresh());
        $this->assertFalse($traded->fresh()->is_active);
        $this->assertSame('binance', $traded->fresh()->provider_code, 'An open trade still settles on its provider.');
        $this->assertNull($open->fresh()->result);

        // Still listed on Binance, but switched off on purpose: the daily sync leaves it off.
        Http::fake(['*/exchangeInfo*' => Http::response(['symbols' => [['symbol' => 'USDTBRL', 'baseAsset' => 'USDT', 'quoteAsset' => 'BRL', 'status' => 'TRADING']]])]);
        $this->artisan('market:sync-catalog')->assertSuccessful();
        $this->assertFalse($traded->fresh()->is_active);
    }

    #[Test]
    public function the_sync_brings_back_only_what_it_switched_off_itself(): void
    {
        $delisted = Asset::factory()->state(['provider_symbol' => 'AAAUSDT'])->create();
        $switchedOffByAdmin = Asset::factory()->state(['provider_symbol' => 'BBBUSDT', 'is_active' => false])->create();
        $listing = fn (array $symbols) => ['symbols' => array_map(fn (string $symbol) => ['symbol' => $symbol, 'baseAsset' => substr($symbol, 0, 3), 'quoteAsset' => 'USDT', 'status' => 'TRADING'], $symbols)];

        Http::fake(['*/exchangeInfo*' => Http::sequence()->push($listing(['BBBUSDT']))->push($listing(['AAAUSDT', 'BBBUSDT']))]);

        $this->artisan('market:sync-catalog')->assertSuccessful();
        $this->assertFalse($delisted->fresh()->is_active);
        $this->assertNotNull($delisted->fresh()->delisted_at);
        $this->assertFalse($switchedOffByAdmin->fresh()->is_active);

        $this->artisan('market:sync-catalog')->assertSuccessful();
        $this->assertTrue($delisted->fresh()->is_active, 'Listed again: it comes back.');
        $this->assertNull($delisted->fresh()->delisted_at);
        $this->assertFalse($switchedOffByAdmin->fresh()->is_active, 'Switched off in the panel: it stays off.');
    }

    #[Test]
    public function the_catalog_api_filters_and_labels_data_honestly(): void
    {
        $user = User::factory()->create();
        $live = Asset::factory()->state(['symbol' => 'BTC/USD', 'name' => 'Bitcoin'])->withQuote('76000')->create();
        $none = Asset::factory()->state(['symbol' => 'SPX', 'name' => 'S&P 500'])->withoutProvider()->create();

        $response = $this->actingAs($user)->getJson('/api/v1/assets?q=bitcoin')->assertOk()->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.id', $live->id)
            ->assertJsonPath('data.0.data_status', 'live')
            ->assertJsonPath('data.0.tradable', true)
            ->assertJsonPath('data.0.price_basis', 'USDT');

        $this->actingAs($user)->getJson('/api/v1/assets?q=S%26P')->assertOk()
            ->assertJsonPath('data.0.id', $none->id)
            ->assertJsonPath('data.0.data_status', 'unavailable')
            ->assertJsonPath('data.0.quote', null)
            ->assertJsonPath('data.0.tradable', false);
    }

    #[Test]
    public function favorites_belong_to_each_user(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $asset = Asset::factory()->create();
        Asset::factory()->create();

        $this->actingAs($user)->putJson("/api/v1/assets/{$asset->id}/favorite")->assertNoContent();
        $this->actingAs($user)->putJson("/api/v1/assets/{$asset->id}/favorite")->assertNoContent();

        $this->actingAs($user)->getJson('/api/v1/assets?favorites=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_favorite', true);
        $this->actingAs($other)->getJson('/api/v1/assets?favorites=1')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($user)->deleteJson("/api/v1/assets/{$asset->id}/favorite")->assertNoContent();
        $this->actingAs($user)->getJson('/api/v1/assets?favorites=1')->assertOk()->assertJsonCount(0, 'data');
    }
}
