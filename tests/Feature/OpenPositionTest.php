<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\MarketQuote;
use App\Models\TradingOrder;
use App\Models\TradingPosition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class OpenPositionTest extends TestCase
{
    use RefreshDatabase;

    private const STAKE = 5_000;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(Asset $asset, array $overrides = []): array
    {
        return [
            'asset_id' => $asset->id,
            'direction' => 'call',
            'stake_cents' => self::STAKE,
            'duration_seconds' => 60,
            'idempotency_key' => (string) Str::uuid(),
            ...$overrides,
        ];
    }

    #[Test]
    public function it_opens_a_position_and_reserves_the_stake(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote('100.5')->create();

        $response = $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset));

        $response->assertCreated()->assertJsonPath('data.direction', 'call')->assertJsonPath('data.result', null);

        $position = TradingPosition::query()->firstOrFail();
        $this->assertSame(0, bccomp('100.5', (string) $position->entry_price, 10));
        $this->assertSame(0, $position->expires_at->micro);
        $this->assertGreaterThanOrEqual(60, $position->opened_at->diffInSeconds($position->expires_at));

        $balance = $user->demoWallet()->balance();
        $this->assertSame(1_000_000 - self::STAKE, $balance->availableCents);
        $this->assertSame(self::STAKE, $balance->reservedCents);
        $this->assertDatabaseHas('trading_executions', ['position_id' => $position->id, 'event' => 'opened']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'trading.position_opened', 'subject_id' => $position->id]);
    }

    #[Test]
    public function the_contract_length_is_measured_on_the_price_sources_clock(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        $exchangeTime = now('UTC')->addSeconds(6)->setMicrosecond(250_000);
        MarketQuote::query()->where('asset_id', $asset->id)->update(['source_at' => $exchangeTime->format('Y-m-d H:i:s.v')]);

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))->assertCreated();

        $this->assertSame(
            $exchangeTime->copy()->addSecond()->startOfSecond()->addSeconds(60)->getTimestamp(),
            TradingPosition::query()->firstOrFail()->expires_at->getTimestamp(),
        );
    }

    #[Test]
    public function prices_and_results_sent_by_the_browser_are_ignored(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote('100')->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset, [
            'entry_price' => '1',
            'result' => 'won',
            'payout_rate_bps' => 100_000,
            'expires_at' => now()->addYear()->toIso8601String(),
        ]))->assertCreated();

        $position = TradingPosition::query()->firstOrFail();
        $this->assertSame(0, bccomp('100', (string) $position->entry_price, 10));
        $this->assertNull($position->result);
        $this->assertSame(8_500, $position->payout_rate_bps);
        $this->assertLessThan(120, now()->diffInSeconds($position->expires_at));
    }

    #[Test]
    public function repeating_the_same_request_opens_only_one_position(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        $payload = $this->payload($asset);

        $first = $this->actingAs($user)->postJson('/api/v1/positions', $payload)->assertCreated();
        $second = $this->actingAs($user)->postJson('/api/v1/positions', $payload)->assertCreated();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, TradingPosition::query()->count());
        $this->assertSame(1_000_000 - self::STAKE, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_stale_quote_is_refused_and_the_rejection_is_recorded(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        MarketQuote::query()->where('asset_id', $asset->id)->update(['received_at' => now('UTC')->subSeconds(30)]);

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'quote_unavailable');

        $this->assertSame(0, TradingPosition::query()->count());
        $this->assertDatabaseHas('trading_orders', ['status' => 'rejected', 'reject_reason' => 'quote_unavailable']);
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function an_asset_without_a_quote_cannot_be_traded(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'quote_unavailable');
    }

    #[Test]
    public function an_asset_without_a_data_provider_cannot_be_traded(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withoutProvider()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'asset_not_tradable');
    }

    #[Test]
    public function polling_only_providers_cannot_be_traded_even_with_a_key_and_a_quote(): void
    {
        config(['market.providers.twelvedata.api_key' => 'key']);
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->state(['provider_code' => 'twelvedata', 'provider_symbol' => 'EUR/USD'])->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'asset_not_tradable');
    }

    #[Test]
    public function a_closed_market_refuses_the_order(): void
    {
        $this->travelTo('2026-11-07 12:00:00');
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->state(['session' => 'us_equities'])->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'market_closed');
    }

    #[Test]
    public function stake_and_duration_limits_are_enforced(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset, ['stake_cents' => 99]))
            ->assertUnprocessable()->assertJsonPath('code', 'stake_out_of_range');
        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset, ['stake_cents' => 100_001]))
            ->assertUnprocessable()->assertJsonPath('code', 'stake_out_of_range');
        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset, ['stake_cents' => -500]))
            ->assertUnprocessable()->assertJsonPath('code', 'stake_out_of_range');
        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset, ['duration_seconds' => 61]))
            ->assertUnprocessable()->assertJsonPath('code', 'duration_not_allowed');
    }

    #[Test]
    public function insufficient_funds_leave_no_position_behind(): void
    {
        config(['platform.demo.initial_balance_cents' => 1_000]);
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_funds');

        $this->assertSame(0, TradingPosition::query()->count());
        $this->assertSame('rejected', TradingOrder::query()->firstOrFail()->status->value);
        $this->assertSame(1_000, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function the_open_position_limit_is_enforced(): void
    {
        config(['platform.trading.max_open_positions' => 1]);
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))->assertCreated();
        $this->actingAs($user)->postJson('/api/v1/positions', $this->payload($asset))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'too_many_open_positions');
    }

    #[Test]
    public function guests_cannot_trade(): void
    {
        $asset = Asset::factory()->withQuote()->create();

        $this->postJson('/api/v1/positions', $this->payload($asset))->assertUnauthorized();
    }

    #[Test]
    public function users_only_see_their_own_positions(): void
    {
        $owner = User::factory()->withDemoWallet()->create();
        $other = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        $this->actingAs($owner)->postJson('/api/v1/positions', $this->payload($asset))->assertCreated();

        $this->actingAs($other)->getJson('/api/v1/positions')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($owner)->getJson('/api/v1/positions')->assertOk()->assertJsonCount(1, 'data');
    }
}
