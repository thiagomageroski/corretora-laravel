<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PagesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function publicPages(): array
    {
        return [
            'landing' => ['/', 'Landing'],
            'terms' => ['/termos', 'Legal/Terms'],
            'risks' => ['/riscos', 'Legal/Risks'],
            'privacy' => ['/privacidade', 'Legal/Privacy'],
            'cookies' => ['/cookies', 'Legal/Cookies'],
            'anti-money laundering' => ['/pld', 'Legal/AntiMoneyLaundering'],
            'login' => ['/login', 'Auth/Login'],
            'register' => ['/register', 'Auth/Register'],
            'forgot password' => ['/forgot-password', 'Auth/ForgotPassword'],
        ];
    }

    #[Test]
    #[DataProvider('publicPages')]
    public function public_pages_render_for_guests(string $url, string $component): void
    {
        $this->get($url)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component($component));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function privatePages(): array
    {
        return [
            'dashboard' => ['/dashboard', 'Dashboard'],
            'negociar' => ['/negociar', 'Terminal'],
            'catalog' => ['/ativos', 'Assets/Index'],
            'wallet' => ['/carteira', 'Wallet'],
            'history' => ['/operacoes', 'History'],
        ];
    }

    #[Test]
    public function the_cookie_policy_lists_the_cookies_the_browser_really_receives(): void
    {
        config(['session.cookie' => 'nivora-session', 'session.lifetime' => 120]);

        $this->get('/cookies')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->where('cookies.session_name', 'nivora-session')
            ->where('cookies.session_minutes', 120)
            ->where('cookies.remember_name', fn (string $name): bool => str_starts_with($name, 'remember_web_'))
            ->where('cookies.remember_days', 400));
    }

    #[Test]
    public function legal_pages_show_only_the_company_details_that_were_filled_in(): void
    {
        config(['platform.legal.company_name' => 'Nivora Tecnologia Ltda.', 'platform.legal.contact_email' => 'atendimento@example.com', 'platform.legal.privacy_email' => '']);

        $this->get('/privacidade')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->where('company.name', 'Nivora Tecnologia Ltda.')
            ->where('company.contact_email', 'atendimento@example.com')
            ->where('company.privacy_email', null)
            ->where('company.document', null));
    }

    #[Test]
    #[DataProvider('privatePages')]
    public function private_pages_render_for_verified_users(string $url, string $component): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->get($url)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component($component));
    }

    #[Test]
    #[DataProvider('privatePages')]
    public function private_pages_redirect_guests_to_login(string $url): void
    {
        $this->get($url)->assertRedirect('/login');
    }

    #[Test]
    #[DataProvider('privatePages')]
    public function private_pages_open_without_confirming_the_email(string $url, string $component): void
    {
        $user = User::factory()->unverified()->withDemoWallet()->create();

        $this->actingAs($user)->get($url)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component($component));
    }

    #[Test]
    public function the_trading_page_moved_from_terminal_to_negociar(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->get('/terminal')->assertNotFound();
        $this->actingAs($user)->get('/negociar')->assertOk();
    }

    #[Test]
    public function an_unknown_address_shows_the_not_found_page_with_a_404_status(): void
    {
        $this->get('/pagina-que-nao-existe')
            ->assertNotFound()
            ->assertInertia(fn (AssertableInertia $page) => $page->component('ErrorPage')->where('status', 404));
    }

    #[Test]
    public function a_missing_record_behind_a_page_also_shows_the_not_found_page(): void
    {
        $user = User::factory()->withDemoWallet()->create();

        $this->actingAs($user)->get('/ativos/999999')
            ->assertNotFound()
            ->assertInertia(fn (AssertableInertia $page) => $page->component('ErrorPage')->where('status', 404));
    }

    #[Test]
    public function api_and_webhook_errors_stay_json(): void
    {
        $this->getJson('/api/v1/rota-inexistente')->assertNotFound()->assertJsonStructure(['message']);
        $this->get('/api/v1/rota-inexistente')->assertNotFound()->assertHeader('Content-Type', 'application/json');
    }

    #[Test]
    public function the_landing_page_shows_the_configured_limits(): void
    {
        config(['platform.real.min_deposit_cents' => 3_000, 'platform.trading.default_payout_bps' => 8_700]);

        $this->get('/')->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Landing')
            ->where('figures.min_deposit_cents', 3_000)
            ->where('figures.payout_percent', 87)
            ->where('figures.payout_bps', 8_700));
    }

    #[Test]
    public function the_landing_page_tells_tradable_assets_from_those_only_shown(): void
    {
        Asset::factory()->count(2)->create();
        Asset::factory()->withoutProvider()->create();
        Asset::factory()->state(['is_active' => false])->create();

        $this->get('/')->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Landing')
            ->where('categories.0.code', 'crypto')
            ->where('categories.0.assets_count', 3)
            ->where('categories.0.tradable_count', 2));
    }

    #[Test]
    public function the_asset_page_shows_real_status_and_hides_inactive_assets(): void
    {
        $user = User::factory()->create();
        $asset = Asset::factory()->withoutProvider()->create();
        $inactive = Asset::factory()->state(['is_active' => false])->create();

        $this->actingAs($user)->get("/ativos/{$asset->id}")->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Assets/Show')
            ->where('asset.data.data_status', 'unavailable')
            ->where('asset.data.quote', null));

        $this->actingAs($user)->get("/ativos/{$inactive->id}")->assertNotFound();
    }

    #[Test]
    public function no_secret_reaches_the_trading_page_props(): void
    {
        config(['market.providers.twelvedata.api_key' => 'super-secret-key']);
        $user = User::factory()->withDemoWallet()->create();
        Asset::factory()->withQuote()->create();

        $html = $this->actingAs($user)->get('/negociar')->assertOk()->getContent();

        $this->assertStringNotContainsString('super-secret-key', (string) $html);
    }
}
