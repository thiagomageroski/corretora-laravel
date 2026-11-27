<?php

namespace Tests\Feature;

use App\Domain\Trading\OpenPosition;
use App\Domain\Trading\SettlePosition;
use App\Enums\Environment;
use App\Enums\TradeDirection;
use App\Enums\TradeResult;
use App\Models\Asset;
use App\Models\TradingPosition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class RealAccountTest extends TestCase
{
    use RefreshDatabase;

    private const REAL_BALANCE = 20_000;

    protected function setUp(): void
    {
        parent::setUp();

        config(['platform.real_money_enabled' => true]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function opening(array $overrides = []): array
    {
        return [
            'cpf' => '529.982.247-25',
            'birth_date' => now()->subYears(25)->toDateString(),
            'phone' => '(11) 98888-7777',
            'accept_real_terms' => true,
            ...$overrides,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function order(Asset $asset, array $overrides = []): array
    {
        return [
            'asset_id' => $asset->id,
            'direction' => 'call',
            'stake_cents' => 5_000,
            'duration_seconds' => 60,
            'idempotency_key' => (string) Str::uuid(),
            'environment' => 'real',
            ...$overrides,
        ];
    }

    #[Test]
    public function opening_creates_a_separate_real_wallet_and_selects_it(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/real-account', $this->opening())->assertCreated();

        $user->refresh();
        $this->assertSame('52998224725', $user->document_number);
        $this->assertNotSame('52998224725', $user->getRawOriginal('document_number'));
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
        $this->assertDatabaseHas('audit_logs', ['action' => 'account.real_opened']);
        $this->actingAs($user)->getJson('/api/v1/wallet')->assertJsonPath('environment', 'real');
    }

    #[Test]
    public function opening_validates_the_cpf_and_the_risk_acceptance(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/real-account', $this->opening(['cpf' => '529.982.247-24', 'accept_real_terms' => false]))
            ->assertJsonValidationErrors([
                'cpf' => 'Informe um CPF válido.',
                'accept_real_terms' => 'Confirme que leu e aceita os riscos da conta real.',
            ]);
        $this->assertNull($user->findRealWallet());
    }

    #[Test]
    public function minors_cannot_open_a_real_account(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/real-account', $this->opening(['birth_date' => now()->subYears(17)->toDateString()]))
            ->assertJsonPath('code', 'underage');
    }

    #[Test]
    public function one_cpf_opens_one_account(): void
    {
        $this->actingAs(User::factory()->withDemoWallet()->create())->postJson('/api/v1/real-account', $this->opening())->assertCreated();

        $this->actingAs(User::factory()->withDemoWallet()->create())->postJson('/api/v1/real-account', $this->opening(['cpf' => '52998224725']))
            ->assertJsonPath('code', 'document_in_use');
    }

    #[Test]
    public function the_real_account_cannot_be_opened_while_real_mode_is_off(): void
    {
        config(['platform.real_money_enabled' => false]);

        $this->actingAs(User::factory()->withDemoWallet()->create())->postJson('/api/v1/real-account', $this->opening())
            ->assertJsonPath('code', 'real_money_disabled');
    }

    #[Test]
    public function the_real_account_can_only_be_selected_once_opened(): void
    {
        $this->actingAs(User::factory()->withDemoWallet()->create())->putJson('/api/v1/wallet/environment', ['environment' => 'real'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'real_account_missing');
    }

    #[Test]
    public function a_real_order_uses_only_the_real_balance(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->withRealAccount(self::REAL_BALANCE)->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset))->assertCreated();

        $this->assertSame(self::REAL_BALANCE - 5_000, $user->findRealWallet()->balance()->availableCents);
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
        $this->assertSame($user->findRealWallet()->id, TradingPosition::query()->firstOrFail()->wallet_id);
    }

    #[Test]
    public function a_real_order_beyond_the_real_balance_is_refused_even_with_demo_money(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->withRealAccount(1_000)->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset))->assertJsonPath('code', 'insufficient_funds');
    }

    #[Test]
    public function real_orders_are_refused_while_real_mode_is_off_or_the_account_is_frozen(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->withRealAccount(self::REAL_BALANCE)->create();
        $asset = Asset::factory()->withQuote()->create();

        config(['platform.real_money_enabled' => false]);
        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset))->assertJsonPath('code', 'real_money_disabled');

        config(['platform.real_money_enabled' => true]);
        $user->findRealWallet()->account->update(['status' => 'frozen']);
        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset))->assertJsonPath('code', 'account_inactive');
    }

    #[Test]
    public function a_real_order_without_a_real_account_is_refused(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset))->assertJsonPath('code', 'real_account_missing');
    }

    #[Test]
    public function position_lists_show_only_the_selected_account(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->withRealAccount(self::REAL_BALANCE)->create();
        $asset = Asset::factory()->withQuote()->create();
        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset, ['environment' => 'demo']))->assertCreated();
        $this->actingAs($user)->postJson('/api/v1/positions', $this->order($asset, ['stake_cents' => 2_500]))->assertCreated();

        $this->actingAs($user)->getJson('/api/v1/positions')->assertJsonCount(1, 'data')->assertJsonPath('data.0.stake_cents', 5_000);

        $this->actingAs($user)->putJson('/api/v1/wallet/environment', ['environment' => 'real'])->assertOk();
        $this->actingAs($user)->getJson('/api/v1/positions')->assertJsonCount(1, 'data')->assertJsonPath('data.0.stake_cents', 2_500);
    }

    #[Test]
    public function a_winning_real_position_pays_into_the_real_wallet_even_after_real_mode_is_switched_off(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->withRealAccount(self::REAL_BALANCE)->create();
        $asset = Asset::factory()->withQuote('100')->create();
        $position = app(OpenPosition::class)->handle($user, $asset->load('quote'), TradeDirection::Call, 10_000, 60, (string) Str::uuid(), Environment::Real);
        $openTime = $position->expires_at->getTimestampMs() - 1000;
        Http::fake(['*/api/v3/klines*' => Http::response([[$openTime, '101', '101', '101', '101', '0.5', $openTime + 999, '1', 3, '0.1', '0.1', '0']])]);
        config(['platform.real_money_enabled' => false]);

        app(SettlePosition::class)->handle($position->fresh(), $position->expires_at->addSecond());

        $this->assertSame(TradeResult::Won, $position->fresh()->result);
        $this->assertSame(self::REAL_BALANCE + 8_500, $user->findRealWallet()->balance()->availableCents);
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
    }
}
