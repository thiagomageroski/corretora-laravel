<?php

namespace Tests\Feature;

use App\Domain\Trading\OpenPosition;
use App\Domain\Trading\SettlePosition;
use App\Enums\TradeDirection;
use App\Enums\TradeResult;
use App\Models\Asset;
use App\Models\TradingPosition;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SettlePositionTest extends TestCase
{
    use RefreshDatabase;

    private const STAKE = 10_000;

    private const INITIAL = 1_000_000;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();
    }

    private function open(User $user, TradeDirection $direction, string $entryPrice = '100'): TradingPosition
    {
        $asset = Asset::factory()->withQuote($entryPrice)->create();

        return app(OpenPosition::class)->handle($user, $asset->load('quote'), $direction, self::STAKE, 60, (string) Str::uuid());
    }

    private function fakeClose(string $price, TradingPosition $position): void
    {
        $openTime = $position->expires_at->getTimestampMs() - 1000;

        Http::fake(['*/api/v3/klines*' => Http::response([[
            $openTime, $price, $price, $price, $price, '0.5', $openTime + 999, '1', 3, '0.1', '0.1', '0',
        ]])]);
    }

    /**
     * @return array<string, array{TradeDirection, string, TradeResult, int}>
     */
    public static function outcomes(): array
    {
        $won = self::INITIAL + intdiv(self::STAKE * 8_500, 10_000);
        $lost = self::INITIAL - self::STAKE;

        return [
            'call above entry wins' => [TradeDirection::Call, '100.0000000001', TradeResult::Won, $won],
            'call below entry loses' => [TradeDirection::Call, '99.9999999999', TradeResult::Lost, $lost],
            'put below entry wins' => [TradeDirection::Put, '99.9', TradeResult::Won, $won],
            'put above entry loses' => [TradeDirection::Put, '100.1', TradeResult::Lost, $lost],
            'equal price on call is neutral' => [TradeDirection::Call, '100.0000000000', TradeResult::Neutral, self::INITIAL],
            'equal price on put is neutral' => [TradeDirection::Put, '100', TradeResult::Neutral, self::INITIAL],
        ];
    }

    #[Test]
    #[DataProvider('outcomes')]
    public function settlement_applies_the_published_rules(TradeDirection $direction, string $close, TradeResult $expected, int $expectedAvailable): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, $direction);
        $this->fakeClose($close, $position);

        $settled = app(SettlePosition::class)->handle($position, $position->expires_at->addSecond());

        $this->assertTrue($settled);
        $position->refresh();
        $this->assertSame($expected, $position->result);
        $this->assertSame(0, bccomp($close, (string) $position->close_price, 10));
        $this->assertSame('binance', $position->close_source);

        $balance = $user->demoWallet()->balance();
        $this->assertSame($expectedAvailable, $balance->availableCents);
        $this->assertSame(0, $balance->reservedCents);
        $this->assertDatabaseHas('trading_executions', ['position_id' => $position->id, 'event' => 'settled']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'trading.position_settled', 'subject_id' => $position->id]);
    }

    #[Test]
    public function the_close_price_comes_from_the_second_right_before_expiry(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        $this->fakeClose('101', $position);

        app(SettlePosition::class)->handle($position, $position->expires_at->addSecond());

        $expected = (string) ($position->expires_at->getTimestampMs() - 1000);
        Http::assertSent(fn (Request $request): bool => $request['interval'] === '1s'
            && (string) $request['startTime'] === $expected
            && (string) $request['endTime'] === $expected);
    }

    #[Test]
    public function a_position_is_not_settled_before_it_expires(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        Http::fake();

        $this->assertFalse(app(SettlePosition::class)->handle($position, $position->expires_at->subSecond()));

        Http::assertNothingSent();
        $this->assertNull($position->fresh()->result);
    }

    #[Test]
    public function settling_twice_pays_once(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        $this->fakeClose('150', $position);
        $settle = app(SettlePosition::class);

        $settle->handle($position, $position->expires_at->addSecond());
        $settle->handle(TradingPosition::query()->findOrFail($position->id), $position->expires_at->addSeconds(2));

        $this->assertSame(self::INITIAL + 8_500, $user->demoWallet()->balance()->availableCents);
        $this->assertSame(1, DB::table('trading_executions')->where('event', 'settled')->count());
    }

    #[Test]
    public function a_stale_in_memory_copy_cannot_settle_again(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        $staleCopy = TradingPosition::query()->findOrFail($position->id);
        $this->fakeClose('150', $position);
        $settle = app(SettlePosition::class);

        $settle->handle($position, $position->expires_at->addSecond());
        $this->fakeClose('50', $position);
        $settle->handle($staleCopy, $position->expires_at->addSeconds(2));

        $this->assertSame(TradeResult::Won, $position->fresh()->result);
        $this->assertSame(self::INITIAL + 8_500, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_missing_price_waits_during_the_grace_period_and_then_voids_with_refund(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        Http::fake(['*/api/v3/klines*' => Http::response([])]);
        $settle = app(SettlePosition::class);
        $grace = (int) config('platform.trading.settlement_grace_seconds');

        $this->assertFalse($settle->handle($position, $position->expires_at->addSeconds($grace - 1)));
        $this->assertNull($position->fresh()->result);
        $this->assertSame(self::STAKE, $user->demoWallet()->balance()->reservedCents);

        $this->assertTrue($settle->handle($position, $position->expires_at->addSeconds($grace)));

        $position->refresh();
        $this->assertSame(TradeResult::Voided, $position->result);
        $this->assertSame('no_reference_price', $position->void_reason);
        $this->assertNull($position->close_price);
        $this->assertSame(self::INITIAL, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_provider_outage_never_decides_a_result_on_its_own(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        Http::fake(['*' => Http::response('down', 503)]);

        $this->assertFalse(app(SettlePosition::class)->handle($position, $position->expires_at->addSeconds(5)));
        $this->assertNull($position->fresh()->result);
    }

    #[Test]
    public function a_kline_for_a_different_second_is_not_accepted_as_the_close(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        $wrongOpen = $position->expires_at->getTimestampMs() - 5000;
        Http::fake(['*/api/v3/klines*' => Http::response([[$wrongOpen, '500', '500', '500', '500', '1', $wrongOpen + 999, '1', 1, '1', '1', '0']])]);

        $this->assertFalse(app(SettlePosition::class)->handle($position, $position->expires_at->addSecond()));
        $this->assertNull($position->fresh()->result);
    }

    #[Test]
    public function the_database_rejects_changing_a_settled_result(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);
        $this->fakeClose('50', $position);
        app(SettlePosition::class)->handle($position, $position->expires_at->addSecond());

        $this->expectException(QueryException::class);
        DB::table('trading_positions')->where('id', $position->id)->update(['result' => 'won']);
    }

    #[Test]
    public function the_database_rejects_changing_the_terms_of_an_open_contract(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);

        $this->expectException(QueryException::class);
        DB::table('trading_positions')->where('id', $position->id)->update(['entry_price' => '1']);
    }

    #[Test]
    public function the_database_rejects_deleting_a_position(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $position = $this->open($user, TradeDirection::Call);

        $this->expectException(QueryException::class);
        DB::table('trading_positions')->where('id', $position->id)->delete();
    }

    #[Test]
    public function the_settle_command_processes_only_due_positions(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $due = $this->open($user, TradeDirection::Call);
        $this->fakeClose('150', $due);

        $this->travelTo(CarbonImmutable::parse($due->expires_at)->addSecond());
        $future = Asset::factory()->withQuote()->create();
        $notDue = app(OpenPosition::class)->handle($user, $future->load('quote'), TradeDirection::Call, self::STAKE, 300, (string) Str::uuid());

        $this->artisan('trading:settle --once')->assertSuccessful();

        $this->assertSame(TradeResult::Won, $due->fresh()->result);
        $this->assertNull($notDue->fresh()->result);
    }
}
