<?php

namespace Tests\Feature;

use App\Domain\Trading\OpenPosition;
use App\Domain\Trading\PerformanceSummary;
use App\Domain\Trading\SettlePosition;
use App\Enums\TradeDirection;
use App\Models\Asset;
use App\Models\TradingPosition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PerformanceSummaryTest extends TestCase
{
    use RefreshDatabase;

    private string $closePrice = '100';

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();

        Http::fake(['*/api/v3/klines*' => function (Request $request) {
            $openTime = (int) $request['startTime'];
            $close = $this->closePrice;

            return Http::response([[$openTime, $close, $close, $close, $close, '1', $openTime + 999, '1', 1, '1', '1', '0']]);
        }]);
    }

    private function settled(User $user, TradeDirection $direction, string $close, int $stakeCents): TradingPosition
    {
        $position = $this->open($user, $direction, $stakeCents);
        $this->closePrice = $close;

        app(SettlePosition::class)->handle($position, $position->expires_at->addSecond());

        return $position->fresh();
    }

    private function open(User $user, TradeDirection $direction, int $stakeCents): TradingPosition
    {
        $asset = Asset::factory()->withQuote('100')->create();

        return app(OpenPosition::class)->handle($user, $asset->load('quote'), $direction, $stakeCents, 60, (string) Str::uuid());
    }

    #[Test]
    public function the_net_result_adds_every_settled_outcome(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $this->settled($user, TradeDirection::Call, '50', 2_500);
        $this->settled($user, TradeDirection::Call, '50', 2_500);

        $summary = app(PerformanceSummary::class)->for($user);

        $this->assertSame(-5_000, $summary['net_result_cents']);
        $this->assertSame(2, $summary['lost']);
        $this->assertSame(2, $summary['total']);
    }

    #[Test]
    public function wins_losses_and_neutral_results_combine_and_match_the_ledger(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $this->settled($user, TradeDirection::Call, '150', 10_000);
        $this->settled($user, TradeDirection::Call, '50', 2_000);
        $this->settled($user, TradeDirection::Call, '100', 3_000);

        $summary = app(PerformanceSummary::class)->for($user);

        $this->assertSame(8_500 - 2_000, $summary['net_result_cents']);
        $this->assertSame(1, $summary['won']);
        $this->assertSame(1, $summary['lost']);
        $this->assertSame(1, $summary['neutral']);
        $this->assertSame(1_000_000 + $summary['net_result_cents'], $user->demoWallet()->balance()->availableCents);
        $this->assertSame($summary['net_result_cents'], end($summary['equity_curve'])['value']);
    }

    #[Test]
    public function open_positions_are_counted_but_do_not_affect_the_result(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $this->settled($user, TradeDirection::Call, '50', 2_000);
        $this->open($user, TradeDirection::Call, 7_000);

        $summary = app(PerformanceSummary::class)->for($user);

        $this->assertSame(-2_000, $summary['net_result_cents']);
        $this->assertSame(1, $summary['open']);
        $this->assertSame(2, $summary['total']);
    }

    #[Test]
    public function one_users_results_do_not_leak_into_anothers(): void
    {
        $owner = User::factory()->withDemoWallet()->create();
        $other = User::factory()->withDemoWallet()->create();
        $this->settled($owner, TradeDirection::Call, '50', 2_000);

        $this->assertSame(0, app(PerformanceSummary::class)->for($other)['net_result_cents']);
        $this->assertSame(0, app(PerformanceSummary::class)->for($other)['total']);
    }
}
