<?php

namespace Tests\Feature;

use App\Domain\Platform\PlatformSettings;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Enums\WithdrawalStatus;
use App\Models\Asset;
use App\Models\User;
use App\Models\Withdrawal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    /**
     * An administrator who already confirmed the password in this session.
     */
    private function admin(): User
    {
        $admin = User::factory()->admin()->withDemoWallet()->create();
        $this->actingAs($admin)->withSession(['auth.password_confirmed_at' => time()]);

        return $admin;
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function pages(): array
    {
        return [
            'overview' => ['/admin', 'Admin/Dashboard'],
            'clients' => ['/admin/clientes', 'Admin/Users/Index'],
            'deposits' => ['/admin/depositos', 'Admin/Deposits'],
            'withdrawals' => ['/admin/saques', 'Admin/Withdrawals'],
            'positions' => ['/admin/operacoes', 'Admin/Positions'],
            'assets' => ['/admin/ativos', 'Admin/Assets'],
            'settings' => ['/admin/configuracoes', 'Admin/Settings'],
            'audit' => ['/admin/auditoria', 'Admin/Audit'],
            'webhooks' => ['/admin/auditoria?aba=webhooks', 'Admin/Audit'],
        ];
    }

    #[Test]
    #[DataProvider('pages')]
    public function every_admin_page_opens_for_an_administrator(string $url, string $component): void
    {
        $this->admin();

        $this->get($url)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component($component));
    }

    #[Test]
    #[DataProvider('pages')]
    public function clients_and_guests_never_reach_the_admin_panel(string $url): void
    {
        $this->get($url)->assertRedirect('/login');

        $client = User::factory()->withDemoWallet()->create();
        $this->actingAs($client)->withSession(['auth.password_confirmed_at' => time()])->get($url)->assertForbidden();
    }

    #[Test]
    public function the_password_is_asked_again_before_entering(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->get('/admin')->assertRedirect('/user/confirm-password');
    }

    #[Test]
    public function a_suspended_administrator_loses_access(): void
    {
        $admin = User::factory()->admin()->create(['status' => 'suspended']);

        $this->actingAs($admin)->withSession(['auth.password_confirmed_at' => time()])->get('/admin')->assertForbidden();
    }

    #[Test]
    public function the_admin_flag_is_shared_with_the_interface(): void
    {
        $this->admin();

        $this->get('/dashboard')->assertInertia(fn (AssertableInertia $page) => $page->where('auth.user.is_admin', true));
    }

    #[Test]
    public function a_client_can_be_found_by_email_and_by_profile_id(): void
    {
        $this->admin();
        $client = User::factory()->withDemoWallet()->create(['email' => 'procurado@example.com']);

        $this->get('/admin/clientes?q=procurado')->assertInertia(fn (AssertableInertia $page) => $page->has('users.data', 1)->where('users.data.0.id', $client->id));
        $this->get('/admin/clientes?q='.(100_000_000 + $client->id))->assertInertia(fn (AssertableInertia $page) => $page->where('users.data.0.id', $client->id));
    }

    #[Test]
    public function the_client_page_masks_the_cpf(): void
    {
        $this->admin();
        $client = User::factory()->withRealAccount()->create();
        $digits = $client->document_number;

        $this->get("/admin/clientes/{$client->id}")->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/Users/Show')
            ->where('user.cpf', '***.'.substr($digits, 3, 3).'.'.substr($digits, 6, 3).'-**')
            ->has('wallets', 1));
    }

    #[Test]
    public function a_balance_adjustment_is_a_ledger_entry_with_reason_and_audit(): void
    {
        $admin = $this->admin();
        $client = User::factory()->withRealAccount(5_000)->create();

        $this->post("/admin/clientes/{$client->id}/saldo", [
            'environment' => 'real',
            'direction' => 'credit',
            'amount_cents' => 2_500,
            'reason' => 'Bônus de boas-vindas',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect()->assertSessionHas('status');

        $this->assertSame(7_500, $client->findRealWallet()->balance()->availableCents);
        $this->assertDatabaseHas('wallet_transactions', ['type' => LedgerEntryType::AdminAdjustment->value, 'available_delta_cents' => 2_500, 'actor_id' => $admin->id, 'reason' => 'Bônus de boas-vindas']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'admin.balance_adjusted', 'actor_id' => $admin->id]);
    }

    #[Test]
    public function a_debit_larger_than_the_balance_is_refused(): void
    {
        $this->admin();
        $client = User::factory()->withRealAccount(1_000)->create();

        $this->post("/admin/clientes/{$client->id}/saldo", [
            'environment' => 'real',
            'direction' => 'debit',
            'amount_cents' => 5_000,
            'reason' => 'Correção de lançamento',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHas('error');

        $this->assertSame(1_000, $client->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function an_adjustment_needs_a_reason(): void
    {
        $this->admin();
        $client = User::factory()->withRealAccount()->create();

        $this->post("/admin/clientes/{$client->id}/saldo", ['environment' => 'real', 'direction' => 'credit', 'amount_cents' => 100, 'reason' => '', 'idempotency_key' => (string) Str::uuid()])
            ->assertSessionHasErrors('reason');
    }

    #[Test]
    public function the_real_account_can_be_frozen_and_released(): void
    {
        $this->admin();
        $client = User::factory()->withRealAccount()->create();
        $account = $client->accounts()->where('environment', Environment::Real)->firstOrFail();

        $this->post("/admin/clientes/{$client->id}/conta-real", ['status' => 'frozen', 'reason' => 'Análise de fraude'])->assertSessionHas('status');
        $this->assertSame(RealAccountManager::STATUS_FROZEN, $account->refresh()->status);

        $this->post("/admin/clientes/{$client->id}/conta-real", ['status' => 'active', 'reason' => 'Análise concluída'])->assertSessionHas('status');
        $this->assertSame(RealAccountManager::STATUS_ACTIVE, $account->refresh()->status);
    }

    #[Test]
    public function a_suspended_client_is_signed_out_and_cannot_sign_in(): void
    {
        $admin = $this->admin();
        $client = User::factory()->withDemoWallet()->create();
        DB::table('sessions')->insert(['id' => Str::random(40), 'user_id' => $client->id, 'payload' => '', 'last_activity' => time()]);

        $this->post("/admin/clientes/{$client->id}/acesso", ['status' => 'suspended', 'reason' => 'Uso indevido da plataforma'])->assertSessionHas('status');

        $this->assertSame('suspended', $client->refresh()->status);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $client->id)->count());

        $this->post('/logout');
        $this->post('/login', ['email' => $client->email, 'password' => 'password'])->assertSessionHasErrors(['email' => 'Esta conta está suspensa. Fale com o suporte.']);
        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['action' => 'admin.user_suspended', 'actor_id' => $admin->id]);
    }

    #[Test]
    public function administrators_cannot_lock_themselves_out(): void
    {
        $admin = $this->admin();

        $this->post("/admin/clientes/{$admin->id}/acesso", ['status' => 'suspended', 'reason' => 'Teste de bloqueio'])->assertSessionHas('error');
        $this->post("/admin/clientes/{$admin->id}/admin", ['is_admin' => false])->assertSessionHas('error');

        $this->assertSame('active', $admin->refresh()->status);
        $this->assertTrue($admin->is_admin);
    }

    #[Test]
    public function client_details_can_be_corrected(): void
    {
        $this->admin();
        $client = User::factory()->withDemoWallet()->create();

        $this->put("/admin/clientes/{$client->id}", ['first_name' => 'Maria', 'last_name' => 'Souza', 'email' => 'Maria.Souza@Example.com', 'phone' => '(11) 98888-7777'])->assertSessionHas('status');

        $this->assertSame('maria.souza@example.com', $client->refresh()->email);
        $this->assertSame('Maria Souza', $client->name);
    }

    #[Test]
    public function settings_saved_in_the_panel_apply_to_the_whole_site(): void
    {
        $admin = $this->admin();
        $values = [...app(PlatformSettings::class)->current(), 'min_deposit_cents' => 5_000, 'default_payout_bps' => 9_000, 'durations_seconds' => [60, 120]];

        $this->put('/admin/configuracoes', $values)->assertSessionHas('status');

        $this->assertSame(5_000, config('platform.real.min_deposit_cents'));
        $this->assertSame([60, 120], config('platform.trading.durations_seconds'));
        $this->assertDatabaseHas('platform_settings', ['key' => 'min_deposit_cents', 'updated_by' => $admin->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.settings_updated', 'actor_id' => $admin->id]);

        // A fresh request reads the stored values back over the defaults.
        config(['platform.real.min_deposit_cents' => 2_000]);
        app(PlatformSettings::class)->apply();
        $this->assertSame(5_000, config('platform.real.min_deposit_cents'));
    }

    #[Test]
    public function company_details_saved_in_the_panel_appear_in_the_policies(): void
    {
        $this->admin();
        $values = [...app(PlatformSettings::class)->current(), 'legal_company_name' => '  Nivora Tecnologia Ltda. ', 'legal_privacy_email' => 'privacidade@example.com', 'legal_address' => ''];

        $this->put('/admin/configuracoes', $values)->assertSessionHasNoErrors();

        $this->assertSame('Nivora Tecnologia Ltda.', config('platform.legal.company_name'));
        $this->assertNull(config('platform.legal.address'));
        $this->get('/termos')->assertInertia(fn (AssertableInertia $page) => $page
            ->where('company.name', 'Nivora Tecnologia Ltda.')
            ->where('company.privacy_email', 'privacidade@example.com'));

        $this->put('/admin/configuracoes', [...$values, 'legal_contact_email' => 'não é e-mail'])->assertSessionHasErrors('legal_contact_email');
    }

    #[Test]
    public function inconsistent_settings_are_refused(): void
    {
        $this->admin();
        $values = [...app(PlatformSettings::class)->current(), 'min_deposit_cents' => 10_000, 'max_deposit_cents' => 5_000, 'default_payout_bps' => 20_000, 'durations_seconds' => [45]];

        $this->put('/admin/configuracoes', $values)->assertSessionHasErrors(['max_deposit_cents', 'default_payout_bps', 'durations_seconds.0']);

        $this->assertDatabaseCount('platform_settings', 0);
    }

    #[Test]
    public function assets_can_be_switched_off_and_repriced(): void
    {
        $this->admin();
        $asset = Asset::factory()->create(['payout_rate_bps' => 8_500, 'is_active' => true]);
        $other = Asset::factory()->create(['payout_rate_bps' => 8_500]);

        $this->put("/admin/ativos/{$asset->id}", ['name' => $asset->name, 'payout_rate_bps' => 8_000, 'is_active' => false])->assertSessionHas('status');
        $this->assertFalse($asset->refresh()->is_active);
        $this->assertSame(8_000, $asset->payout_rate_bps);

        $this->post('/admin/ativos/retorno', ['payout_rate_bps' => 9_000])->assertSessionHas('status');
        $this->assertSame(9_000, $other->refresh()->payout_rate_bps);

        // Switching on by hand an asset the sync had delisted makes it the administrator's call from then on.
        $delisted = Asset::factory()->create(['is_active' => false, 'delisted_at' => now()]);
        $this->put("/admin/ativos/{$delisted->id}", ['name' => $delisted->name, 'payout_rate_bps' => 8_500, 'is_active' => true])->assertSessionHas('status');
        $this->assertTrue($delisted->refresh()->is_active);
        $this->assertNull($delisted->delisted_at);
    }

    #[Test]
    public function a_withdrawal_rejected_in_the_panel_returns_the_money(): void
    {
        config([
            'platform.real_money_enabled' => true,
            'platform.real.auto_approve_withdrawal_max_cents' => 0,
            'services.amplopay.public_key' => 'pk_test',
            'services.amplopay.secret_key' => 'sk_test',
            'app.url' => 'https://broker.example',
        ]);
        $client = User::factory()->withRealAccount(20_000)->create();
        $this->actingAs($client)->postJson('/api/v1/withdrawals', [
            'amount_cents' => 10_000, 'pix_key_type' => 'email', 'pix_key' => 'ana@example.com', 'password' => 'password', 'idempotency_key' => (string) Str::uuid(),
        ])->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();

        $admin = $this->admin();
        $this->post("/admin/saques/{$withdrawal->public_id}/recusar", ['note' => 'Chave PIX de terceiro'])->assertSessionHas('status');

        $this->assertSame(WithdrawalStatus::Rejected, $withdrawal->refresh()->status);
        $this->assertSame($admin->id, $withdrawal->reviewed_by);
        $this->assertSame(20_000, $client->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function the_grant_command_creates_the_first_administrator(): void
    {
        $user = User::factory()->create(['email' => 'dono@example.com']);

        $this->artisan('admin:grant', ['email' => 'DONO@example.com'])->assertSuccessful();
        $this->assertTrue($user->refresh()->is_admin);

        $this->artisan('admin:grant', ['email' => 'dono@example.com', '--revoke' => true])->assertSuccessful();
        $this->assertFalse($user->refresh()->is_admin);

        $this->artisan('admin:grant', ['email' => 'ninguem@example.com'])->assertFailed();
    }
}
