<?php

namespace Tests\Feature;

use App\Domain\Trading\OpenPosition;
use App\Enums\TradeDirection;
use App\Models\Asset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function registration(array $overrides = []): array
    {
        return [
            'first_name' => 'Ana',
            'last_name' => 'Silva',
            'email' => 'ana@example.com',
            'phone' => '+55 11 99999-0000',
            'password' => 'Str0ng!Passw0rd#2026',
            'password_confirmation' => 'Str0ng!Passw0rd#2026',
            'accept_terms' => '1',
            ...$overrides,
        ];
    }

    #[Test]
    public function registering_creates_a_user_with_a_funded_demo_wallet_only(): void
    {
        $this->post('/register', $this->registration())->assertRedirect();

        $user = User::query()->where('email', 'ana@example.com')->firstOrFail();

        $this->assertSame('Ana Silva', $user->name);
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
        $this->assertSame(['demo'], $user->accounts()->pluck('environment')->map->value->all());
        $this->assertDatabaseHas('audit_logs', ['action' => 'user.registered', 'subject_id' => $user->id]);
    }

    #[Test]
    public function registration_requires_accepting_the_terms(): void
    {
        $this->post('/register', $this->registration(['accept_terms' => '']))->assertSessionHasErrors('accept_terms');

        $this->assertDatabaseCount('users', 0);
    }

    #[Test]
    public function an_autocorrected_accent_in_the_email_is_refused_with_the_likely_address(): void
    {
        $this->post('/register', $this->registration(['email' => 'linguiçajr8@gmail.com']))
            ->assertSessionHasErrors(['email' => 'O e-mail não pode ter acentos, ç ou espaços. Você quis dizer linguicajr8@gmail.com?']);

        $this->assertDatabaseCount('users', 0);
    }

    #[Test]
    public function the_email_is_stored_trimmed_and_in_lower_case_so_any_capitalisation_signs_in(): void
    {
        $this->post('/register', $this->registration(['email' => '  Ana.Silva@Example.COM ']))->assertRedirect('/negociar');
        $this->post('/logout');

        $this->assertDatabaseHas('users', ['email' => 'ana.silva@example.com']);

        $this->post('/login', ['email' => 'ANA.SILVA@example.com ', 'password' => 'Str0ng!Passw0rd#2026'])->assertRedirect('/negociar');
        $this->assertAuthenticated();
    }

    #[Test]
    public function an_account_saved_with_capitals_before_normalisation_can_still_sign_in(): void
    {
        $user = User::factory()->create(['email' => 'Legado.Cliente@Example.com', 'password' => 'Str0ng!Passw0rd#2026']);

        $this->post('/login', ['email' => 'legado.cliente@example.com', 'password' => 'Str0ng!Passw0rd#2026'])->assertRedirect('/negociar');

        $this->assertAuthenticatedAs($user);
    }

    #[Test]
    public function an_email_already_registered_in_other_capitals_is_refused(): void
    {
        $this->post('/register', $this->registration());
        $this->post('/logout');

        $this->post('/register', $this->registration(['email' => 'ANA@example.com']))->assertSessionHasErrors('email');

        $this->assertDatabaseCount('users', 1);
    }

    #[Test]
    public function the_masked_phone_is_accepted_with_10_or_11_digits(): void
    {
        $this->post('/register', $this->registration(['phone' => '(47) 99201-2732']))->assertRedirect('/negociar');

        $this->assertDatabaseHas('users', ['email' => 'ana@example.com', 'phone' => '(47) 99201-2732']);
    }

    #[Test]
    public function a_phone_without_area_code_or_with_too_many_digits_is_refused(): void
    {
        foreach (['99201-2732', '(47) 99201-27329', 'abc'] as $phone) {
            $this->post('/register', $this->registration(['phone' => $phone]))
                ->assertSessionHasErrors(['phone' => 'Informe o telefone com DDD, como (11) 99999-9999.']);
        }

        $this->assertDatabaseCount('users', 0);
    }

    #[Test]
    public function the_profile_refuses_an_accented_email_too(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/user/profile-information', ['first_name' => 'Ana', 'last_name' => 'Silva', 'email' => 'joão@example.com'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    #[Test]
    public function login_is_rate_limited(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 5) as $attempt) {
            $this->post('/login', ['email' => $user->email, 'password' => 'wrong'])->assertSessionHasErrors();
        }

        $this->post('/login', ['email' => $user->email, 'password' => 'wrong'])->assertTooManyRequests();
    }

    #[Test]
    public function argon2id_is_the_configured_password_hash(): void
    {
        config(['hashing.driver' => 'argon2id']);
        Hash::forgetDrivers();

        $this->assertStringStartsWith('$argon2id$', Hash::make('secret-value'));
    }

    #[Test]
    public function resetting_is_blocked_while_positions_are_open(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        $open = app(OpenPosition::class)->handle($user, $asset->load('quote'), TradeDirection::Call, 5_000, 60, (string) Str::uuid());

        $this->actingAs($user)->postJson('/api/v1/wallet/demo/reset')->assertConflict()->assertJsonPath('code', 'open_positions');

        $this->assertSame(1_000_000 - 5_000, $user->demoWallet()->balance()->availableCents);
        $this->assertNull($open->fresh()->result);
    }

    #[Test]
    public function reset_is_recorded_as_a_new_ledger_entry(): void
    {
        $user = User::factory()->withDemoWallet()->create();
        $entriesBefore = $user->demoWallet()->transactions()->count();

        $this->actingAs($user)->postJson('/api/v1/wallet/demo/reset')->assertOk()->assertJsonPath('available_cents', 1_000_000);

        $this->assertSame($entriesBefore + 1, $user->demoWallet()->transactions()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'wallet.demo_reset', 'actor_id' => $user->id]);
    }

    #[Test]
    public function the_wallet_endpoint_exposes_only_the_demo_environment(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->getJson('/api/v1/wallet')->assertOk()->assertExactJson([
            'environment' => 'demo',
            'currency' => 'BRL',
            'available_cents' => 1_000_000,
            'reserved_cents' => 0,
        ]);
    }

    #[Test]
    public function no_route_lets_a_client_set_a_balance(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/wallet', ['available_cents' => 999_999_999])->assertMethodNotAllowed();
        $this->actingAs($user)->putJson('/api/v1/wallet', ['available_cents' => 999_999_999])->assertMethodNotAllowed();
        $this->assertSame(1_000_000, $user->demoWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_new_account_goes_straight_to_the_dashboard_without_a_confirmation_email(): void
    {
        Notification::fake();
        $this->withoutVite();

        $this->post('/register', $this->registration())->assertRedirect('/negociar');
        $this->get('/dashboard')->assertOk();

        Notification::assertNothingSent();
    }
}
