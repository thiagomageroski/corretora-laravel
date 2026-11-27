<?php

namespace Tests\Feature;

use App\Domain\Market\CandleService;
use App\Domain\Market\Providers\TwelveDataProvider;
use App\Domain\Market\ProviderUnavailable;
use App\Enums\CandleInterval;
use App\Models\Asset;
use App\Models\LoginEvent;
use App\Models\User;
use App\Models\UserPreference;
use App\Support\UserAgentLabel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AccountSettingsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function new_users_get_default_preferences_without_a_stored_row(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/account')->assertOk()
            ->assertJsonPath('preferences.chart_type', 'candles')
            ->assertJsonPath('preferences.chart_interval', '1m')
            ->assertJsonPath('preferences.chart_indicators', [])
            ->assertJsonPath('preferences.chart_animations', true)
            ->assertJsonPath('profile.email', $user->email)
            ->assertJsonPath('two_factor.enabled', false);

        $this->assertDatabaseCount('user_preferences', 0);
    }

    #[Test]
    public function preferences_are_saved_partially_and_shared_with_every_page(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->patchJson('/api/v1/account/preferences', [
            'chart_type' => 'area',
            'chart_interval' => '1s',
            'chart_indicators' => ['rsi', 'macd'],
            'chart_animations' => false,
            'default_stake_cents' => 2_500,
            'default_duration_seconds' => 300,
            'timezone' => 'America/Sao_Paulo',
        ])->assertOk()->assertJsonPath('preferences.chart_type', 'area');

        $this->actingAs($user)->patchJson('/api/v1/account/preferences', ['hide_balance' => true])
            ->assertOk()
            ->assertJsonPath('preferences.chart_type', 'area')
            ->assertJsonPath('preferences.hide_balance', true);

        $this->assertDatabaseCount('user_preferences', 1);

        $this->withoutVite()->actingAs($user->fresh())->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page
            ->where('preferences.chart_interval', '1s')
            ->where('preferences.chart_indicators', ['rsi', 'macd'])
            ->where('preferences.default_stake_cents', 2_500));
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalidPreferences(): array
    {
        return [
            'unknown chart type' => [['chart_type' => 'pie'], 'chart_type'],
            'unknown interval' => [['chart_interval' => '7m'], 'chart_interval'],
            'unknown indicator' => [['chart_indicators' => ['rsi', 'magic']], 'chart_indicators.1'],
            'stake too small' => [['default_stake_cents' => 99], 'default_stake_cents'],
            'stake too large' => [['default_stake_cents' => 100_001], 'default_stake_cents'],
            'duration not offered' => [['default_duration_seconds' => 61], 'default_duration_seconds'],
            'bad timezone' => [['timezone' => 'Marte/Base'], 'timezone'],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[Test]
    #[DataProvider('invalidPreferences')]
    public function invalid_preferences_are_refused(array $payload, string $field): void
    {
        $this->actingAs(User::factory()->create())
            ->patchJson('/api/v1/account/preferences', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertDatabaseCount('user_preferences', 0);
    }

    #[Test]
    public function a_browser_cannot_change_another_users_preferences_or_unknown_columns(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/v1/account/preferences', ['user_id' => $other->id, 'hide_balance' => true])->assertOk();

        $this->assertSame($user->id, UserPreference::query()->sole()->user_id);
    }

    #[Test]
    public function guests_cannot_reach_the_account_api(): void
    {
        $this->getJson('/api/v1/account')->assertUnauthorized();
    }

    #[Test]
    public function profile_updates_are_audited_without_storing_the_values(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/user/profile-information', [
            'first_name' => 'Novo',
            'last_name' => 'Nome',
            'phone' => '+55 11 98888-7777',
            'email' => $user->email,
        ])->assertOk();

        $user->refresh();
        $this->assertSame('Novo Nome', $user->name);
        $this->assertSame('+55 11 98888-7777', $user->phone);
        $this->assertDatabaseHas('audit_logs', ['action' => 'account.profile_updated', 'subject_id' => $user->id]);
        $this->assertStringNotContainsString('98888', (string) DB::table('audit_logs')->where('action', 'account.profile_updated')->value('context'));
    }

    #[Test]
    public function a_real_account_holder_cannot_remove_the_phone_used_for_pix(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $profile = ['first_name' => 'Ana', 'last_name' => 'Souza', 'phone' => '', 'email' => $user->email];

        $this->actingAs($user)->putJson('/user/profile-information', $profile)->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->assertSame('(11) 99999-9999', $user->refresh()->phone);

        $demoOnly = User::factory()->create(['phone' => '(11) 98888-7777']);
        $this->actingAs($demoOnly)->putJson('/user/profile-information', [...$profile, 'email' => $demoOnly->email])->assertOk();
        $this->assertNull($demoOnly->refresh()->phone);
    }

    #[Test]
    public function logins_logouts_and_failures_are_recorded_for_the_owner(): void
    {
        $user = User::factory()->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'wrong']);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect();
        $this->post('/logout');

        $this->assertSame(['failed', 'login', 'logout'], LoginEvent::query()->where('user_id', $user->id)->orderBy('id')->pluck('event')->all());
    }

    #[Test]
    public function a_failed_login_for_an_unknown_email_records_nothing(): void
    {
        $this->post('/login', ['email' => 'nobody@example.com', 'password' => 'wrong']);

        $this->assertDatabaseCount('login_events', 0);
    }

    /**
     * @return array{User, string}
     */
    private function userWithOtherSession(): array
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();

        DB::table('sessions')->insert([
            ['id' => 'other-session-1', 'user_id' => $user->id, 'ip_address' => '10.0.0.1', 'user_agent' => 'Mozilla Firefox/120 Windows', 'payload' => '', 'last_activity' => time()],
            ['id' => 'other-session-2', 'user_id' => $user->id, 'ip_address' => '10.0.0.2', 'user_agent' => null, 'payload' => '', 'last_activity' => time()],
        ]);

        return [$user, hash('sha256', 'other-session-1')];
    }

    #[Test]
    public function session_ids_never_reach_the_client(): void
    {
        [$user, $publicId] = $this->userWithOtherSession();

        $response = $this->actingAs($user)->getJson('/api/v1/account')->assertOk();

        $this->assertStringNotContainsString('other-session-1', (string) $response->getContent());
        $this->assertContains($publicId, array_column($response->json('sessions'), 'id'));
    }

    #[Test]
    public function revoking_sessions_needs_the_password_and_can_target_one_or_all(): void
    {
        [$user, $publicId] = $this->userWithOtherSession();
        $strangerSession = User::factory()->create();
        DB::table('sessions')->insert(['id' => 'stranger', 'user_id' => $strangerSession->id, 'payload' => '', 'last_activity' => time()]);

        $this->actingAs($user)->postJson('/api/v1/account/sessions/revoke', ['password' => 'wrong'])->assertUnprocessable();
        $this->assertDatabaseHas('sessions', ['id' => 'other-session-1']);
        $this->assertDatabaseHas('sessions', ['id' => 'other-session-2']);

        $this->actingAs($user)->postJson('/api/v1/account/sessions/revoke', ['password' => 'password', 'session_id' => $publicId])
            ->assertOk()->assertJsonPath('revoked', 1);
        $this->assertDatabaseMissing('sessions', ['id' => 'other-session-1']);
        $this->assertDatabaseHas('sessions', ['id' => 'other-session-2']);

        $this->actingAs($user)->postJson('/api/v1/account/sessions/revoke', ['password' => 'password'])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'other-session-2']);
        $this->assertDatabaseHas('sessions', ['id' => 'stranger']);
    }

    #[Test]
    public function one_user_cannot_revoke_another_users_session_by_its_hash(): void
    {
        [$user] = $this->userWithOtherSession();
        $attacker = User::factory()->create();

        $this->actingAs($attacker)->postJson('/api/v1/account/sessions/revoke', [
            'password' => 'password',
            'session_id' => hash('sha256', 'other-session-1'),
        ])->assertOk()->assertJsonPath('revoked', 0);

        $this->assertSame(2, DB::table('sessions')->where('user_id', $user->id)->count());
    }

    #[Test]
    public function two_factor_can_be_enabled_after_confirming_the_password(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/user/two-factor-authentication')->assertStatus(423);

        $this->actingAs($user)->postJson('/user/confirm-password', ['password' => 'password'])->assertCreated();
        $this->actingAs($user)->postJson('/user/two-factor-authentication')->assertOk();

        $this->assertNotNull($user->fresh()->two_factor_secret);
        $this->actingAs($user)->getJson('/user/two-factor-qr-code')->assertOk()->assertJsonStructure(['svg', 'url']);
        $this->actingAs($user)->getJson('/api/v1/account')->assertJsonPath('two_factor.enabled', true)->assertJsonPath('two_factor.confirmed', false);
    }

    #[Test]
    public function the_demo_balance_can_be_reset_only_to_offered_amounts(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/wallet/demo/reset', ['amount_cents' => 5_000_000])
            ->assertOk()->assertJsonPath('available_cents', 5_000_000);
        $this->assertSame(5_000_000, $user->demoWallet()->balance()->availableCents);

        $this->actingAs($user)->postJson('/api/v1/wallet/demo/reset', ['amount_cents' => 999_999_999])->assertUnprocessable();
        $this->assertSame(5_000_000, $user->demoWallet()->balance()->availableCents);

        $this->artisan('wallet:reconcile')->assertSuccessful();
    }

    #[Test]
    public function the_account_page_renders(): void
    {
        $this->withoutVite()->actingAs(User::factory()->create())->get('/conta')
            ->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component('Account'));
    }

    #[Test]
    public function one_second_candles_come_from_binance_and_are_not_stored(): void
    {
        $asset = Asset::factory()->create();
        Http::fake(['*/klines*' => Http::response([[1_794_000_000_000, '1', '3', '0.5', '2', '10', 1_794_000_000_999, '20', 5, '1', '1', '0']])]);

        $result = app(CandleService::class)->history($asset, CandleInterval::OneSecond, 5);

        $this->assertSame('ok', $result['status']);
        $this->assertSame(1_794_000_000, $result['candles'][0]['time']);
        $this->assertDatabaseCount('market_candles', 0);
        Http::assertSent(fn ($request): bool => $request['interval'] === '1s');
    }

    #[Test]
    public function providers_without_second_bars_report_that_instead_of_inventing_them(): void
    {
        config(['market.providers.twelvedata.api_key' => 'key']);
        Http::fake();

        $this->expectException(ProviderUnavailable::class);

        try {
            app(TwelveDataProvider::class)->fetchCandles('EUR/USD', CandleInterval::OneSecond, 5);
        } finally {
            Http::assertNothingSent();
        }
    }

    #[Test]
    public function the_history_page_filters_by_result(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->withoutVite()->actingAs($user)->get('/operacoes?result=won')->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->where('filter', 'won')->has('performance'));
        $this->actingAs($user)->get('/operacoes?result=hacked')->assertSessionHasErrors('result');
    }

    /**
     * @return array<string, array{?string, string}>
     */
    public static function userAgents(): array
    {
        return [
            'chrome on windows' => ['Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'Chrome em Windows'],
            'edge is not chrome' => ['Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0', 'Edge em Windows'],
            'safari on iphone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari/604.1', 'Safari em iPhone'],
            'missing' => [null, 'Dispositivo desconhecido'],
        ];
    }

    #[Test]
    #[DataProvider('userAgents')]
    public function devices_get_readable_labels(?string $userAgent, string $expected): void
    {
        $this->assertSame($expected, UserAgentLabel::describe($userAgent));
    }
}
