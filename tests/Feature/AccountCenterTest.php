<?php

namespace Tests\Feature;

use App\Domain\Wallet\LedgerService;
use App\Enums\LedgerEntryType;
use App\Models\Asset;
use App\Models\User;
use App\Models\UserPreference;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AccountCenterTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A valid PNG built without the GD extension, which this environment lacks.
     */
    private function png(string $name, int $size): UploadedFile
    {
        $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
        $rows = str_repeat("\0".str_repeat("\x2a\x80\xc0", $size), $size);
        $bytes = "\x89PNG\r\n\x1a\n"
            .$chunk('IHDR', pack('NNCCCCC', $size, $size, 8, 2, 0, 0, 0))
            .$chunk('IDAT', gzcompress($rows))
            .$chunk('IEND', '');

        return UploadedFile::fake()->createWithContent($name, $bytes);
    }

    #[Test]
    public function a_profile_photo_is_stored_privately_and_served_only_to_its_owner(): void
    {
        Storage::fake('local');
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->post('/api/v1/account/avatar', ['photo' => $this->png('me.png', 200)], ['Accept' => 'application/json'])->assertOk();

        $path = $user->fresh()->getRawOriginal('avatar_path');
        Storage::disk('local')->assertExists($path);
        $this->actingAs($user)->get('/conta/foto')->assertOk();
        $this->actingAs(User::factory()->create())->get('/conta/foto')->assertNotFound();

        $this->actingAs($user)->post('/api/v1/account/avatar', ['photo' => $this->png('new.png', 300)], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('local')->assertMissing($path);

        $this->actingAs($user)->deleteJson('/api/v1/account/avatar')->assertOk();
        $this->assertNull($user->fresh()->getRawOriginal('avatar_path'));
    }

    #[Test]
    public function only_images_are_accepted_as_profile_photos(): void
    {
        Storage::fake('local');

        $this->actingAs(User::factory()->create())
            ->post('/api/v1/account/avatar', ['photo' => UploadedFile::fake()->create('doc.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors(['photo' => 'Envie uma imagem.']);
    }

    #[Test]
    public function the_monthly_statement_lists_that_months_entries_as_csv(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 15));
        $user = User::factory()->withDemoWallet()->create();
        $this->travelTo(now()->setDate(2026, 11, 5));
        app(LedgerService::class)->post($user->demoWallet(), LedgerEntryType::DemoReset, -500_000, 0, 'reset-nov', reason: 'Novembro');

        $november = $this->actingAs($user)->get('/conta/extrato?mes=2026-11&conta=demo');
        $november->assertOk()->assertDownload('extrato-demo-2026-11.csv');
        $content = $november->streamedContent();
        $this->assertStringContainsString('Reinício do saldo demo', $content);
        $this->assertStringContainsString('-5.000,00', $content);
        $this->assertStringNotContainsString('Saldo virtual inicial', $content);

        $this->actingAs($user)->get('/conta/extrato?mes=2026-11&conta=real')->assertNotFound();
    }

    #[Test]
    public function new_trading_preferences_are_validated_and_can_be_reset(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/v1/account/preferences', ['interface_scale' => 95])->assertJsonValidationErrors('interface_scale');
        $this->actingAs($user)->patchJson('/api/v1/account/preferences', ['interface_scale' => 110, 'keyboard_shortcuts' => true, 'email_promotions' => true])
            ->assertOk()
            ->assertJsonPath('preferences.interface_scale', 110)
            ->assertJsonPath('preferences.keyboard_shortcuts', true);

        $this->actingAs($user)->postJson('/api/v1/account/preferences/reset')
            ->assertOk()
            ->assertJsonPath('preferences.interface_scale', 100)
            ->assertJsonPath('preferences.keyboard_shortcuts', false)
            ->assertJsonPath('preferences.email_promotions', UserPreference::DEFAULTS['email_promotions']);
    }

    #[Test]
    public function closing_the_account_signs_out_and_blocks_new_sign_ins(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->postJson('/api/v1/account/close', ['password' => 'wrong'])->assertJsonValidationErrors(['password' => 'Senha incorreta.']);
        $this->actingAs($user)->postJson('/api/v1/account/close', ['password' => 'password'])->assertOk();

        $this->assertGuest();
        $this->assertSame('closed', $user->fresh()->status);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasErrors(['email' => 'Esta conta está fechada. Fale com o suporte para reabri-la.']);
        $this->assertGuest();
    }

    #[Test]
    public function an_account_with_an_open_position_cannot_be_closed(): void
    {
        Event::fake();
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();
        $this->actingAs($user)->postJson('/api/v1/positions', ['asset_id' => $asset->id, 'direction' => 'call', 'stake_cents' => 1_000, 'duration_seconds' => 60, 'idempotency_key' => (string) Str::uuid()])->assertCreated();

        $this->actingAs($user)->postJson('/api/v1/account/close', ['password' => 'password'])->assertJsonPath('code', 'open_positions');
        $this->assertSame('active', $user->fresh()->status);
    }

    #[Test]
    public function deletion_is_requested_only_after_the_real_balance_is_withdrawn(): void
    {
        config(['platform.real_money_enabled' => true]);
        $user = User::factory()->withRealAccount(5_000)->create();

        $this->actingAs($user)->postJson('/api/v1/account/deletion-request', ['password' => 'password'])->assertJsonPath('code', 'balance_remaining');
        $this->assertNull($user->fresh()->deletion_requested_at);

        $empty = User::factory()->withDemoWallet()->create();
        $this->actingAs($empty)->postJson('/api/v1/account/deletion-request', ['password' => 'password'])->assertOk();
        $this->assertNotNull($empty->fresh()->deletion_requested_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'account.deletion_requested', 'actor_id' => $empty->id]);
    }

    #[Test]
    public function pix_keys_are_saved_normalized_once_and_only_for_their_owner(): void
    {
        config(['platform.real_money_enabled' => true]);
        $user = User::factory()->withRealAccount()->create();

        $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'email', 'key' => 'Ana@Example.com', 'label' => 'Nubank'])
            ->assertCreated()
            ->assertJsonPath('data.key', 'ana@example.com');
        $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'email', 'key' => 'ana@example.com'])->assertJsonPath('code', 'pix_key_exists');
        $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'cpf', 'key' => '111.444.777-35'])->assertJsonPath('code', 'pix_key_not_owned');
        $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'email', 'key' => 'not-an-email'])->assertJsonPath('code', 'invalid_pix_key');

        $key = $user->pixKeys()->firstOrFail();
        $this->assertNotSame('ana@example.com', $key->getRawOriginal('key'));
        $this->actingAs(User::factory()->create())->deleteJson("/api/v1/pix-keys/{$key->id}")->assertNotFound();
        $this->actingAs($user)->deleteJson("/api/v1/pix-keys/{$key->id}")->assertOk();
        $this->assertDatabaseCount('pix_keys', 0);
    }

    #[Test]
    public function at_most_five_pix_keys_can_be_saved(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 5) as $index) {
            $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'email', 'key' => "user{$index}@example.com"])->assertCreated();
        }

        $this->actingAs($user)->postJson('/api/v1/pix-keys', ['type' => 'email', 'key' => 'user6@example.com'])->assertJsonPath('code', 'pix_key_limit');
    }

    #[Test]
    public function the_first_steps_progress_follows_what_the_user_did(): void
    {
        $this->withoutVite();
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page
            ->where('onboarding.progress', 20)
            ->has('onboarding.steps', 5)
            ->where('onboarding.steps.0.done', true)
            ->where('onboarding.steps.2.key', 'trade')
            ->where('onboarding.steps.2.done', false)
            ->where('auth.user.profile_id', (string) (100_000_000 + $user->id)));
    }

    #[Test]
    public function a_first_trade_also_completes_choosing_an_asset(): void
    {
        $this->withoutVite();
        Event::fake();
        $user = User::factory()->withDemoWallet()->create();
        $asset = Asset::factory()->withQuote()->create();

        $this->actingAs($user)->postJson('/api/v1/positions', [
            'asset_id' => $asset->id,
            'direction' => 'call',
            'stake_cents' => 1_000,
            'duration_seconds' => 60,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertCreated();

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page
            ->where('onboarding.steps.1.key', 'asset')
            ->where('onboarding.steps.1.done', true)
            ->where('onboarding.steps.2.done', true)
            ->where('onboarding.done', 3)
            ->where('onboarding.total', 5)
            ->where('onboarding.progress', 60));
    }

    #[Test]
    public function opening_an_asset_from_the_catalog_completes_choosing_an_asset(): void
    {
        $this->withoutVite();
        $asset = Asset::factory()->withQuote()->create();
        $fromAssetPage = User::factory()->withDemoWallet()->create();
        $fromTradeLink = User::factory()->withDemoWallet()->create();

        $this->actingAs($fromAssetPage)->get("/ativos/{$asset->id}")->assertOk();
        $this->actingAs($fromAssetPage)->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page->where('onboarding.steps.1.done', true)->where('onboarding.progress', 40));

        $this->actingAs($fromTradeLink)->get("/negociar?asset={$asset->id}")->assertOk();
        $this->actingAs($fromTradeLink)->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page->where('onboarding.steps.1.done', true));
    }

    #[Test]
    public function an_unknown_asset_in_the_trade_link_is_not_recorded(): void
    {
        $this->withoutVite();
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->get('/negociar?asset=999999')->assertOk();

        $this->assertDatabaseMissing('asset_views', ['user_id' => $user->id]);
    }
}
