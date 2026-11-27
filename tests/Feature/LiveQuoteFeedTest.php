<?php

namespace Tests\Feature;

use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\Data\TradeData;
use App\Domain\Market\LiveQuoteAggregator;
use App\Domain\Market\Providers\BinanceProvider;
use App\Domain\Market\QuoteStore;
use App\Enums\QuoteDelivery;
use App\Events\QuotesUpdated;
use App\Models\Asset;
use App\Models\MarketQuote;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class LiveQuoteFeedTest extends TestCase
{
    use RefreshDatabase;

    private const SYMBOL = 'BTCUSDT';

    private const NOW_MS = 1_794_009_124_000;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();
    }

    private function ticker(string $price = '100', int $atMs = self::NOW_MS): QuoteData
    {
        return new QuoteData(self::SYMBOL, $price, '90', '110', '80', '1000', CarbonImmutable::createFromTimestampMsUTC($atMs), QuoteDelivery::Stream);
    }

    private function trade(string $price, string $quantity = '0.5', int $atMs = self::NOW_MS + 100): TradeData
    {
        return new TradeData(self::SYMBOL, $price, $quantity, CarbonImmutable::createFromTimestampMsUTC($atMs));
    }

    #[Test]
    public function the_stream_subscribes_to_trades_and_tickers_and_parses_trades(): void
    {
        $provider = app(BinanceProvider::class);

        $url = $provider->streamUrl([self::SYMBOL]);
        $this->assertStringContainsString('btcusdt@aggTrade', $url);
        $this->assertStringContainsString('btcusdt@miniTicker', $url);

        $trade = $provider->parseStreamMessage((string) json_encode(['stream' => 'btcusdt@aggTrade', 'data' => ['e' => 'aggTrade', 'E' => self::NOW_MS + 5, 's' => self::SYMBOL, 'p' => '76000.10', 'q' => '0.125', 'T' => self::NOW_MS]]));

        $this->assertInstanceOf(TradeData::class, $trade);
        $this->assertSame('76000.10', $trade->price);
        $this->assertSame('0.125', $trade->quantity);
        $this->assertSame(self::NOW_MS, $trade->tradedAt->getTimestampMs());
    }

    #[Test]
    public function a_trade_moves_the_price_and_keeps_the_daily_open(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());
        $aggregator->drainForBroadcast();

        $aggregator->applyTrade($this->trade('101.5'));

        $change = $aggregator->drainForBroadcast()[0];
        $this->assertSame('101.5', $change['quote']->price);
        $this->assertSame('90', $change['quote']->open);
        $this->assertSame(self::NOW_MS + 100, $change['quote']->sourceAt->getTimestampMs());
    }

    #[Test]
    public function trades_extend_the_daily_range(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());

        $aggregator->applyTrade($this->trade('120'));
        $aggregator->applyTrade($this->trade('70', atMs: self::NOW_MS + 200));

        $quote = $aggregator->drainForStorage()[0];
        $this->assertSame('120', $quote->high);
        $this->assertSame('70', $quote->low);
    }

    #[Test]
    public function traded_quantity_accumulates_between_broadcasts_and_then_restarts(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());
        $aggregator->drainForBroadcast();

        $aggregator->applyTrade($this->trade('101', '0.1'));
        $aggregator->applyTrade($this->trade('102', '0.2', self::NOW_MS + 150));

        $this->assertSame(0, bccomp('0.3', $aggregator->drainForBroadcast()[0]['traded'], 10));

        $aggregator->applyTrade($this->trade('103', '0.4', self::NOW_MS + 200));

        $this->assertSame(0, bccomp('0.4', $aggregator->drainForBroadcast()[0]['traded'], 10));
    }

    #[Test]
    public function a_late_trade_counts_toward_volume_but_cannot_move_the_price_back(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());
        $aggregator->applyTrade($this->trade('105', '0.1', self::NOW_MS + 500));
        $aggregator->drainForBroadcast();

        $aggregator->applyTrade($this->trade('50', '0.2', self::NOW_MS + 100));

        $change = $aggregator->drainForBroadcast()[0];
        $this->assertSame('105', $change['quote']->price);
        $this->assertSame(0, bccomp('0.2', $change['traded'], 10));
    }

    #[Test]
    public function an_older_ticker_updates_daily_figures_without_rewinding_the_price(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());
        $aggregator->applyTrade($this->trade('105', atMs: self::NOW_MS + 500));

        $aggregator->applyQuote(new QuoteData(self::SYMBOL, '99', '91', '111', '81', '1001', CarbonImmutable::createFromTimestampMsUTC(self::NOW_MS + 200), QuoteDelivery::Stream));

        $quote = $aggregator->drainForStorage()[0];
        $this->assertSame('105', $quote->price);
        $this->assertSame('91', $quote->open);
    }

    #[Test]
    public function trades_before_the_first_ticker_are_dropped(): void
    {
        $aggregator = new LiveQuoteAggregator;

        $aggregator->applyTrade($this->trade('101'));

        $this->assertSame([], $aggregator->drainForBroadcast());
        $this->assertSame([], $aggregator->drainForStorage());
    }

    #[Test]
    public function draining_for_one_destination_does_not_empty_the_other(): void
    {
        $aggregator = new LiveQuoteAggregator;
        $aggregator->applyQuote($this->ticker());

        $this->assertCount(1, $aggregator->drainForBroadcast());
        $this->assertCount(1, $aggregator->drainForStorage());
        $this->assertSame([], $aggregator->drainForBroadcast());
        $this->assertSame([], $aggregator->drainForStorage());
    }

    #[Test]
    public function broadcasting_sends_the_traded_quantity_and_writes_nothing(): void
    {
        $asset = Asset::factory()->state(['provider_symbol' => self::SYMBOL])->create();

        app(QuoteStore::class)->broadcast('binance', [['quote' => $this->ticker('101'), 'traded' => '0.75']]);

        $this->assertSame(0, MarketQuote::query()->count());
        Event::assertDispatched(QuotesUpdated::class, fn (QuotesUpdated $event): bool => $event->quotes[0]['asset_id'] === $asset->id
            && $event->quotes[0]['price'] === '101'
            && $event->quotes[0]['traded'] === '0.75');
    }

    #[Test]
    public function large_broadcasts_are_split_to_stay_under_the_size_limit(): void
    {
        $changes = [];

        foreach (range(1, 60) as $number) {
            $symbol = "S{$number}USDT";
            Asset::factory()->state(['provider_symbol' => $symbol])->create();
            $changes[] = ['quote' => new QuoteData($symbol, '1', '1', '1', '1', '1', CarbonImmutable::createFromTimestampMsUTC(self::NOW_MS), QuoteDelivery::Stream), 'traded' => '1'];
        }

        app(QuoteStore::class)->broadcast('binance', $changes);

        Event::assertDispatchedTimes(QuotesUpdated::class, 3);
    }

    #[Test]
    public function storing_without_announcing_saves_quotes_silently(): void
    {
        $asset = Asset::factory()->state(['provider_symbol' => self::SYMBOL])->create();

        app(QuoteStore::class)->store('binance', [$this->ticker('101')], announce: false);

        $this->assertDatabaseHas('market_quotes', ['asset_id' => $asset->id]);
        Event::assertNotDispatched(QuotesUpdated::class);
    }

    #[Test]
    public function symbols_outside_the_catalog_are_not_broadcast(): void
    {
        app(QuoteStore::class)->broadcast('binance', [['quote' => $this->ticker(), 'traded' => '1']]);

        Event::assertNotDispatched(QuotesUpdated::class);
    }
}
