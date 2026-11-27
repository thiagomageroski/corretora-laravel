<?php

namespace Tests\Feature;

use App\Domain\Wallet\LedgerService;
use App\Enums\DepositStatus;
use App\Enums\LedgerEntryType;
use App\Models\Deposit;
use App\Models\PaymentWebhook;
use App\Models\User;
use App\Models\UserPreference;
use App\Notifications\DepositCredited;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class DepositTest extends TestCase
{
    use RefreshDatabase;

    private const RECEIVE_URL = 'https://app.amplopay.com/api/v1/gateway/pix/receive';

    private const TRANSACTIONS_URL = 'https://app.amplopay.com/api/v1/gateway/transactions*';

    private const WEBHOOK_TOKEN = 'tok_charge_123';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'platform.real_money_enabled' => true,
            'services.amplopay.public_key' => 'pk_test',
            'services.amplopay.secret_key' => 'sk_test',
            'services.amplopay.status_lookups' => true,
            'services.amplopay.webhook_token' => null,
            'app.url' => 'https://broker.example',
        ]);
    }

    /**
     * A deposit request as the form sends it: the payer's CPF (the holder's)
     * and the accepted terms.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withPayer(User $user, array $data): array
    {
        return ['cpf' => $user->document_number ?? '529.982.247-25', 'accept_terms' => true, ...$data];
    }

    private int $charges = 0;

    private function fakeCharge(): void
    {
        Http::preventStrayRequests();
        Http::fake([self::RECEIVE_URL => fn () => Http::response([
            'transactionId' => 'tx_'.++$this->charges,
            'status' => 'OK',
            'transactionStatus' => 'PENDING',
            'webhookToken' => self::WEBHOOK_TOKEN,
            'fee' => 1.5,
            'order' => ['id' => 'ord_1'],
            'pix' => ['code' => '00020101021126580014BR.GOV.BCB.PIX-test', 'image' => null, 'base64' => '', 'expiresAt' => now()->addMinutes(30)->toIso8601ZuluString()],
        ])]);
    }

    /**
     * What the provider answers to a lookup. Fakes registered later do not
     * override earlier ones, so a single fake reads this instead.
     *
     * @var array<string, mixed>|null
     */
    private ?array $providerState = null;

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function fakeLookup(string $status, int $amountCents, array $overrides = []): void
    {
        $registered = $this->providerState !== null;
        $this->providerState = [
            'currency' => 'BRL',
            'amount' => $amountCents / 100,
            'chargeAmount' => $amountCents / 100,
            'status' => $status,
            'payedAt' => $status === 'COMPLETED' ? now()->toIso8601ZuluString() : null,
            'pixMetadata' => null,
            ...$overrides,
        ];

        if (! $registered) {
            Http::fake([self::TRANSACTIONS_URL => fn (Request $request) => Http::response([
                'id' => $request['id'],
                'clientIdentifier' => Deposit::query()->where('provider_transaction_id', $request['id'])->value('public_id'),
                ...$this->providerState,
            ])]);
        }
    }

    private function createDeposit(User $user, int $amountCents = 5_000): Deposit
    {
        $this->fakeCharge();
        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => $amountCents, 'idempotency_key' => (string) Str::uuid()]))->assertCreated();

        return Deposit::query()->latest('id')->firstOrFail();
    }

    /**
     * A notification as AmploPay sends it, with the secret token of the charge.
     *
     * @return array<string, mixed>
     */
    private function paidWebhook(Deposit $deposit, string $token = self::WEBHOOK_TOKEN, string $event = 'TRANSACTION_PAID', string $status = 'COMPLETED', ?int $amountCents = null, ?string $payerDocument = null): array
    {
        return [
            'event' => $event,
            'token' => $token,
            'client' => ['name' => 'Ana', 'cpf' => '123.456.789-10'],
            'transaction' => [
                'id' => $deposit->provider_transaction_id,
                'identifier' => $deposit->public_id,
                'status' => $status,
                'paymentMethod' => 'PIX',
                'amount' => ($amountCents ?? $deposit->amount_cents) / 100,
                'currency' => 'BRL',
                'payedAt' => now()->toIso8601ZuluString(),
                'pixMetadata' => $payerDocument === null ? null : ['payerDocument' => $payerDocument],
            ],
        ];
    }

    private function assertNoLookup(): void
    {
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/gateway/transactions'));
    }

    #[Test]
    public function creating_a_deposit_issues_a_pix_charge_without_moving_the_balance(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $this->fakeCharge();

        $response = $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_050, 'idempotency_key' => (string) Str::uuid()]));

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.pix_code', '00020101021126580014BR.GOV.BCB.PIX-test');
        $this->assertStringContainsString('<svg', (string) $response->json('data.pix_qr_svg'));

        $deposit = Deposit::query()->firstOrFail();
        Http::assertSent(fn (Request $request) => $request->url() === self::RECEIVE_URL
            && $request->hasHeader('x-public-key', 'pk_test')
            && $request->hasHeader('x-secret-key', 'sk_test')
            && $request['identifier'] === $deposit->public_id
            && $request['amount'] === 50.5
            && $request['client']['document'] === $user->document_number
            && $request['callbackUrl'] === 'https://broker.example/webhooks/amplopay');
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
        $this->assertNotSame(self::WEBHOOK_TOKEN, $deposit->getRawOriginal('webhook_token_hash'));
    }

    #[Test]
    public function deposits_are_refused_without_a_public_address_for_notifications(): void
    {
        config(['app.url' => 'http://localhost:8000']);
        $user = User::factory()->withRealAccount()->create();
        Http::preventStrayRequests();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'webhook_unavailable');
        $this->assertDatabaseCount('deposits', 0);
    }

    #[Test]
    public function replaying_the_idempotency_key_returns_the_same_charge(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $this->fakeCharge();
        $payload = ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()];

        $first = $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, $payload))->json('data.id');
        $second = $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, $payload))->json('data.id');

        $this->assertSame($first, $second);
        Http::assertSentCount(1);
    }

    #[Test]
    public function deposits_are_refused_while_real_mode_is_off(): void
    {
        config(['platform.real_money_enabled' => false]);
        $user = User::factory()->withRealAccount()->create();
        Http::preventStrayRequests();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'real_money_disabled');
    }

    #[Test]
    public function deposits_need_the_real_account_and_the_configured_keys(): void
    {
        Http::preventStrayRequests();
        $withoutAccount = User::factory()->withDemoWallet()->create();

        $this->actingAs($withoutAccount)->postJson('/api/v1/deposits', $this->withPayer($withoutAccount, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertJsonPath('code', 'real_account_missing');

        config(['services.amplopay.secret_key' => null]);
        $unconfigured = User::factory()->withRealAccount()->create();
        $this->actingAs($unconfigured)->postJson('/api/v1/deposits', $this->withPayer($unconfigured, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertJsonPath('code', 'payments_not_configured');
    }

    #[Test]
    public function the_amount_must_be_within_the_limits(): void
    {
        Http::preventStrayRequests();
        $user = User::factory()->withRealAccount()->create();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 1_999, 'idempotency_key' => (string) Str::uuid()]))
            ->assertJsonPath('code', 'amount_out_of_range');
    }

    #[Test]
    public function a_provider_refusal_is_reported_and_the_deposit_marked_failed(): void
    {
        $user = User::factory()->withRealAccount()->create();
        Http::preventStrayRequests();
        Http::fake([self::RECEIVE_URL => Http::response(['statusCode' => 400, 'errorCode' => 'GATEWAY_INVALID_DATA', 'message' => 'Dados inválidos', 'details' => [['code' => 'invalid_union', 'unionErrors' => [['issues' => [['path' => ['client', 'phone'], 'message' => 'Required']]]]]]], 400)]);
        Log::spy();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'provider_rejected')
            ->assertJsonPath('message', 'O provedor de pagamentos recusou a solicitação.');

        $this->assertSame(DepositStatus::Failed, Deposit::query()->firstOrFail()->status);
        Log::shouldHaveReceived('warning')->with('PIX charge failed', Mockery::on(fn (array $context): bool => $context['fields'] === ['client.phone']));
    }

    #[Test]
    public function the_charge_always_carries_the_payers_phone_and_document(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $this->fakeCharge();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))->assertCreated();

        Http::assertSent(fn (Request $request) => $request['client']['phone'] === '11999999999' && $request['client']['document'] === $user->document_number);
    }

    #[Test]
    public function without_a_phone_no_charge_is_requested(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $user->forceFill(['phone' => null])->save();
        Http::preventStrayRequests();

        $this->actingAs($user)->postJson('/api/v1/deposits', $this->withPayer($user, ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'payer_data_missing');

        $this->assertSame(0, Deposit::query()->count());
    }

    #[Test]
    public function a_paid_notification_with_the_charge_token_credits_the_wallet_once(): void
    {
        config(['services.amplopay.status_lookups' => false]);
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();

        $this->assertSame(DepositStatus::Completed, $deposit->fresh()->status);
        $this->assertSame(5_000, $user->findRealWallet()->balance()->availableCents);
        $this->assertDatabaseCount('wallet_transactions', 1);
        $this->assertDatabaseHas('payment_webhooks', ['event' => 'TRANSACTION_PAID', 'status' => 'processed', 'token_valid' => true]);
        $this->assertStringNotContainsString(self::WEBHOOK_TOKEN, (string) json_encode(PaymentWebhook::query()->first()->payload));
        $this->assertNoLookup();
    }

    #[Test]
    public function a_notification_with_the_wrong_token_is_rejected(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, 'forged'))->assertUnauthorized();

        $this->assertSame(DepositStatus::Pending, $deposit->fresh()->status);
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
        $this->assertNoLookup();
    }

    #[Test]
    public function a_notification_for_another_charge_never_credits_this_one(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $payload = $this->paidWebhook($deposit);
        $payload['transaction']['identifier'] = 'someone-elses-deposit';

        $this->postJson('/webhooks/amplopay', $payload)->assertOk();

        $this->assertSame(DepositStatus::Pending, $deposit->fresh()->status);
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function without_any_token_to_check_a_notification_only_triggers_a_lookup(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $deposit->update(['webhook_token_hash' => null]);
        $this->fakeLookup('PENDING', 5_000);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, 'anything'))->assertOk();

        $this->assertSame(DepositStatus::Pending, $deposit->fresh()->status);
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_payment_below_the_charged_amount_is_held_for_review(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, amountCents: 4_999))->assertOk();

        $this->assertSame(DepositStatus::Review, $deposit->fresh()->status);
        $this->assertSame('amount_mismatch', $deposit->fresh()->review_reason);
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_payment_from_someone_elses_cpf_is_held_until_an_operator_credits_it(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $operator = User::factory()->create();
        $deposit = $this->createDeposit($user);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, payerDocument: '111.444.777-35'))->assertOk();
        $this->assertSame('payer_mismatch', $deposit->fresh()->review_reason);

        $this->artisan('payments:deposits', ['action' => 'credit', 'deposit' => $deposit->public_id, '--operator' => $operator->email, '--note' => 'Pagador confirmado'])->assertSuccessful();

        $this->assertSame(5_000, $user->findRealWallet()->balance()->availableCents);
        $this->assertDatabaseHas('audit_logs', ['action' => 'payments.deposit_credited', 'actor_id' => $operator->id]);
    }

    #[Test]
    public function an_operator_can_confirm_a_paid_charge_whose_notification_never_arrived(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $operator = User::factory()->create();
        $deposit = $this->createDeposit($user);

        $this->artisan('payments:deposits', ['action' => 'confirm', 'deposit' => $deposit->public_id, '--operator' => $operator->email])->assertExitCode(2);
        $this->artisan('payments:deposits', ['action' => 'confirm', 'deposit' => $deposit->public_id, '--operator' => $operator->email, '--note' => 'Pago no painel AmploPay'])->assertSuccessful();
        $this->artisan('payments:deposits', ['action' => 'confirm', 'deposit' => $deposit->public_id, '--operator' => $operator->email, '--note' => 'Pago no painel AmploPay'])->assertFailed();

        $this->assertSame(DepositStatus::Completed, $deposit->fresh()->status);
        $this->assertSame(5_000, $user->findRealWallet()->balance()->availableCents);
        $this->assertDatabaseHas('audit_logs', ['action' => 'payments.deposit_confirmed_manually', 'actor_id' => $operator->id]);
    }

    #[Test]
    public function the_check_button_asks_the_provider_when_lookups_are_enabled(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $this->fakeLookup('COMPLETED', 5_000);

        $this->actingAs($user)->getJson("/api/v1/deposits/{$deposit->public_id}?check=1")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.pix_code', null);

        $this->assertSame(5_000, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function with_lookups_disabled_nothing_polls_the_provider(): void
    {
        config(['services.amplopay.status_lookups' => false]);
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $this->fakeLookup('COMPLETED', 5_000);

        $this->actingAs($user)->getJson("/api/v1/deposits/{$deposit->public_id}?check=1")->assertJsonPath('data.status', 'pending');
        $this->artisan('payments:reconcile')->assertSuccessful();

        $this->assertNoLookup();
    }

    #[Test]
    public function routine_status_polling_never_reaches_the_provider(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $this->fakeLookup('COMPLETED', 5_000);

        $this->actingAs($user)->getJson("/api/v1/deposits/{$deposit->public_id}")->assertJsonPath('data.status', 'pending');

        $this->assertNoLookup();
    }

    #[Test]
    public function a_polling_block_pauses_every_lookup_until_it_expires(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $first = $this->createDeposit($user);
        $second = $this->createDeposit($user);
        Http::fake([self::TRANSACTIONS_URL => Http::response(['success' => false, 'error' => ['statusCode' => 429, 'errorCode' => 'TOO_MANY_REQUESTS', 'message' => 'Tentativa de polling bloqueada. Receba atualizações via webhook.', 'retryAfterSeconds' => 300]], 429)]);

        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->actingAs($user)->getJson("/api/v1/deposits/{$second->public_id}?check=1")->assertOk()->assertJsonPath('data.status', 'pending');

        $lookups = Http::recorded(fn (Request $request) => str_contains($request->url(), '/gateway/transactions'));
        $this->assertCount(1, $lookups);
        $this->assertSame(DepositStatus::Pending, $first->fresh()->status);
    }

    #[Test]
    public function another_users_deposit_is_not_found(): void
    {
        $deposit = $this->createDeposit(User::factory()->withRealAccount()->create());

        $this->actingAs(User::factory()->withRealAccount()->create())->getJson("/api/v1/deposits/{$deposit->public_id}")->assertNotFound();
    }

    #[Test]
    public function a_payment_notified_after_real_mode_is_switched_off_is_still_credited(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        config(['platform.real_money_enabled' => false]);

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();

        $this->assertSame(5_000, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_refund_takes_the_credit_back(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, event: 'TRANSACTION_REFUNDED', status: 'REFUNDED'))->assertOk();

        $this->assertSame(DepositStatus::Refunded, $deposit->fresh()->status);
        $this->assertSame(0, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_chargeback_on_spent_funds_takes_what_is_left_and_freezes_the_account(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $deposit = $this->createDeposit($user);
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();
        app(LedgerService::class)->post($user->findRealWallet(), LedgerEntryType::PositionReserve, -3_000, 3_000, 'spent');

        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit, event: 'TRANSACTION_CHARGED_BACK', status: 'CHARGED_BACK'))->assertOk();

        $wallet = $user->findRealWallet();
        $this->assertSame(0, $wallet->balance()->availableCents);
        $this->assertSame('frozen', $wallet->account->status);
        $this->assertDatabaseHas('audit_logs', ['action' => 'payments.deposit_reversal_shortfall']);
    }

    #[Test]
    public function a_credited_deposit_sends_a_receipt_unless_the_user_turned_it_off(): void
    {
        Notification::fake();
        $user = User::factory()->withRealAccount()->create();
        $quiet = User::factory()->withRealAccount()->create();
        $quiet->preference()->create([...UserPreference::DEFAULTS, 'email_transactions' => false]);

        $deposit = $this->createDeposit($user);
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($deposit))->assertOk();
        $quietDeposit = $this->createDeposit($quiet);
        $this->postJson('/webhooks/amplopay', $this->paidWebhook($quietDeposit, token: self::WEBHOOK_TOKEN))->assertOk();

        Notification::assertSentToTimes($user, DepositCredited::class, 1);
        Notification::assertNotSentTo($quiet, DepositCredited::class);
    }

    #[Test]
    public function the_cpf_typed_must_be_the_account_holders(): void
    {
        $user = User::factory()->withRealAccount()->create();
        Http::preventStrayRequests();

        $this->actingAs($user)->postJson('/api/v1/deposits', ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid(), 'cpf' => '529.982.247-25', 'accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cpf' => 'Use o CPF do titular da conta']);

        $this->assertSame(0, Deposit::query()->count());
    }

    #[Test]
    public function the_cpf_and_the_deposit_terms_are_required(): void
    {
        $user = User::factory()->withRealAccount()->create();
        Http::preventStrayRequests();

        $this->actingAs($user)->postJson('/api/v1/deposits', ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid()])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cpf', 'accept_terms']);

        $this->actingAs($user)->postJson('/api/v1/deposits', ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid(), 'cpf' => '111.111.111-11', 'accept_terms' => true])
            ->assertJsonValidationErrors('cpf');
    }

    #[Test]
    public function the_masked_cpf_of_the_holder_is_accepted(): void
    {
        $user = User::factory()->withRealAccount()->create();
        $this->fakeCharge();
        $digits = $user->document_number;
        $masked = substr($digits, 0, 3).'.'.substr($digits, 3, 3).'.'.substr($digits, 6, 3).'-'.substr($digits, 9, 2);

        $this->actingAs($user)->postJson('/api/v1/deposits', ['amount_cents' => 5_000, 'idempotency_key' => (string) Str::uuid(), 'cpf' => $masked, 'accept_terms' => true])
            ->assertCreated();
    }
}
