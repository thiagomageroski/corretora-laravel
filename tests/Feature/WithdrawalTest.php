<?php

namespace Tests\Feature;

use App\Enums\WithdrawalStatus;
use App\Models\User;
use App\Models\Withdrawal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WithdrawalTest extends TestCase
{
    use RefreshDatabase;

    private const TRANSFERS_URL = 'https://app.amplopay.com/api/v1/gateway/transfers*';

    private const WEBHOOK_TOKEN = 'tok_transfer_9';

    private const BALANCE = 50_000;

    /**
     * Answer of the transfer lookup; null means the provider has no such transfer.
     *
     * @var array<string, mixed>|null
     */
    private ?array $lookup = null;

    private bool $createTimesOut = false;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'platform.real_money_enabled' => true,
            'platform.real.auto_approve_withdrawal_max_cents' => 0,
            'services.amplopay.public_key' => 'pk_test',
            'services.amplopay.secret_key' => 'sk_test',
            'services.amplopay.status_lookups' => true,
            'app.url' => 'https://broker.example',
        ]);
    }

    private function fakeProvider(): void
    {
        Http::preventStrayRequests();
        Http::fake([self::TRANSFERS_URL => function (Request $request) {
            if ($request->method() === 'GET') {
                return $this->lookup === null
                    ? Http::response(['statusCode' => 404, 'errorCode' => 'NOT_FOUND', 'message' => 'Not found'], 404)
                    : Http::response($this->lookup);
            }

            if ($this->createTimesOut) {
                return Http::response(['message' => 'Gateway timeout'], 504);
            }

            return Http::response([
                'webhookToken' => self::WEBHOOK_TOKEN,
                'withdraw' => ['id' => 'wd_1', 'amount' => $request['amount'], 'feeAmount' => 1, 'currency' => 'BRL', 'status' => 'PENDING'],
                'sents' => [],
            ]);
        }]);
    }

    private function providerReports(string $status, ?string $reason = null): void
    {
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->lookup = [
            'id' => 'wd_1',
            'clientIdentifier' => $withdrawal->public_id,
            'amount' => $withdrawal->amount_cents / 100,
            'currency' => 'BRL',
            'status' => $status,
            'rejectedReason' => $reason,
            'withdrawSent' => $status === 'COMPLETED' ? [['id' => 's1', 'amount' => $withdrawal->amount_cents / 100 - 1, 'status' => 'COMPLETED', 'endToEndId' => 'E2E123']] : [],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function requestWithdrawal(User $user, array $overrides = []): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/withdrawals', [
            'amount_cents' => 10_000,
            'pix_key_type' => 'email',
            'pix_key' => 'Ana@Example.com',
            'password' => 'password',
            'idempotency_key' => (string) Str::uuid(),
            ...$overrides,
        ]);
    }

    private function approve(Withdrawal $withdrawal, User $operator): void
    {
        $this->artisan('payments:withdrawals', ['action' => 'approve', 'withdrawal' => $withdrawal->public_id, '--operator' => $operator->email, '--note' => 'Conferido'])->assertSuccessful();
    }

    #[Test]
    public function a_request_reserves_the_amount_and_waits_for_an_operator(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();

        $this->requestWithdrawal($user)->assertCreated()->assertJsonPath('data.status', 'requested')->assertJsonPath('data.pix_key_masked', '•••••••••••.com');

        $balance = $user->findRealWallet()->balance();
        $this->assertSame(self::BALANCE - 10_000, $balance->availableCents);
        $this->assertSame(10_000, $balance->reservedCents);
        $this->assertSame('ana@example.com', Withdrawal::query()->firstOrFail()->pix_key);
        $this->assertNotSame('ana@example.com', Withdrawal::query()->firstOrFail()->getRawOriginal('pix_key'));
        Http::assertNothingSent();
    }

    #[Test]
    public function the_password_is_required_again(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        $this->requestWithdrawal($user, ['password' => 'wrong'])->assertJsonValidationErrors(['password' => 'Senha incorreta.']);
        $this->assertDatabaseCount('withdrawals', 0);
    }

    #[Test]
    public function a_cpf_key_must_be_the_account_holders(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        $this->requestWithdrawal($user, ['pix_key_type' => 'cpf', 'pix_key' => '111.444.777-35'])->assertJsonPath('code', 'pix_key_not_owned');
        $this->requestWithdrawal($user, ['pix_key_type' => 'cpf', 'pix_key' => $user->document_number])->assertCreated();
    }

    #[Test]
    public function the_amount_cannot_exceed_the_available_balance_or_the_daily_limit(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        $this->requestWithdrawal($user, ['amount_cents' => self::BALANCE + 100])->assertJsonPath('code', 'insufficient_funds');
        config(['platform.real.daily_withdrawal_limit_cents' => 15_000]);
        $this->requestWithdrawal($user, ['amount_cents' => 10_000])->assertCreated();
        $this->requestWithdrawal($user, ['amount_cents' => 6_000])->assertJsonPath('code', 'daily_limit_reached');
    }

    #[Test]
    public function an_approved_withdrawal_is_sent_but_not_completed_until_the_provider_confirms(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $operator = User::factory()->create();
        $this->fakeProvider();
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();

        $this->approve($withdrawal, $operator);

        $this->assertSame(WithdrawalStatus::Processing, $withdrawal->fresh()->status);
        $this->assertSame(10_000, $user->findRealWallet()->balance()->reservedCents);
        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && $request['identifier'] === $withdrawal->public_id
            && $request['amount'] === 100.0
            && $request['pix'] === ['type' => 'email', 'key' => 'ana@example.com']
            && $request['owner']['document'] === ['type' => 'cpf', 'number' => $user->document_number]
            && $request['callbackUrl'] === 'https://broker.example/webhooks/amplopay');
        $this->assertDatabaseHas('audit_logs', ['action' => 'payments.withdrawal_approved', 'actor_id' => $operator->id]);
    }

    /**
     * A transfer notification as AmploPay sends it.
     *
     * @return array<string, mixed>
     */
    private function transferWebhook(Withdrawal $withdrawal, string $event, string $status, ?string $message = null, string $token = self::WEBHOOK_TOKEN): array
    {
        $completed = $status === 'COMPLETED';

        return [
            'event' => $event,
            'token' => $token,
            'withdraw' => [
                'id' => 'wd_1',
                'clientIdentifier' => $withdrawal->public_id,
                'amount' => $withdrawal->amount_cents / 100,
                'receivedAmount' => $completed ? $withdrawal->amount_cents / 100 - 1 : 0,
                'feeAmount' => 1,
                'currency' => 'BRL',
                'status' => $status,
                'message' => $message,
            ],
            'payoutAccount' => ['ownerDocument' => '123.456.789-00', 'pix' => 'ana@example.com'],
            'sents' => $completed ? [['id' => 's1', 'amount' => $withdrawal->amount_cents / 100 - 1, 'status' => 'COMPLETED', 'endToEndId' => 'E2E123']] : [],
        ];
    }

    #[Test]
    public function the_completion_notification_pays_out_once(): void
    {
        config(['services.amplopay.status_lookups' => false]);
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->approve($withdrawal, User::factory()->create());

        $this->postJson('/webhooks/amplopay', $this->transferWebhook($withdrawal, 'TRANSFER_CREATED', 'PROCESSING'))->assertOk();
        $this->assertSame(WithdrawalStatus::Processing, $withdrawal->fresh()->status);
        $this->assertSame(10_000, $user->findRealWallet()->balance()->reservedCents);

        $this->postJson('/webhooks/amplopay', $this->transferWebhook($withdrawal, 'TRANSFER_COMPLETED', 'COMPLETED'))->assertOk();
        $this->postJson('/webhooks/amplopay', $this->transferWebhook($withdrawal, 'TRANSFER_COMPLETED', 'COMPLETED'))->assertOk();

        $withdrawal->refresh();
        $this->assertSame(WithdrawalStatus::Completed, $withdrawal->status);
        $this->assertSame('E2E123', $withdrawal->end_to_end_id);
        $this->assertSame(9_900, $withdrawal->received_cents);
        $balance = $user->findRealWallet()->balance();
        $this->assertSame(self::BALANCE - 10_000, $balance->availableCents);
        $this->assertSame(0, $balance->reservedCents);
        $this->assertDatabaseCount('wallet_transactions', 3);
        Http::assertNotSent(fn (Request $request) => $request->method() === 'GET');
    }

    #[Test]
    public function a_send_without_an_answer_learns_its_transfer_from_the_notification(): void
    {
        config(['services.amplopay.status_lookups' => false, 'services.amplopay.webhook_token' => 'account-token']);
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();
        $this->createTimesOut = true;
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->approve($withdrawal, User::factory()->create());

        $this->postJson('/webhooks/amplopay', $this->transferWebhook($withdrawal, 'TRANSFER_COMPLETED', 'COMPLETED', token: 'account-token'))->assertOk();

        $withdrawal->refresh();
        $this->assertSame(WithdrawalStatus::Completed, $withdrawal->status);
        $this->assertSame('wd_1', $withdrawal->provider_transfer_id);
    }

    #[Test]
    public function withdrawals_are_refused_without_a_public_address_for_notifications(): void
    {
        config(['app.url' => 'http://localhost:8000']);
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        $this->requestWithdrawal($user)->assertJsonPath('code', 'webhook_unavailable');
        $this->assertSame(self::BALANCE, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_failed_transfer_returns_the_amount(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->approve($withdrawal, User::factory()->create());

        $this->postJson('/webhooks/amplopay', $this->transferWebhook($withdrawal, 'TRANSFER_FAILED', 'CANCELED', 'Chave PIX inválida'))->assertOk();

        $withdrawal->refresh();
        $this->assertSame(WithdrawalStatus::Failed, $withdrawal->status);
        $this->assertSame('Chave PIX inválida', $withdrawal->failure_reason);
        $this->assertSame(self::BALANCE, $user->findRealWallet()->balance()->availableCents);
    }

    #[Test]
    public function a_notification_with_the_wrong_token_changes_nothing(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->approve($withdrawal, User::factory()->create());
        $this->providerReports('COMPLETED');

        $this->postJson('/webhooks/amplopay', ['event' => 'TRANSFER_COMPLETED', 'token' => 'forged', 'withdraw' => ['id' => 'wd_1']])->assertUnauthorized();

        $this->assertSame(WithdrawalStatus::Processing, $withdrawal->fresh()->status);
    }

    #[Test]
    public function a_send_without_an_answer_is_never_repeated_automatically(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $operator = User::factory()->create();
        $this->fakeProvider();
        $this->createTimesOut = true;
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();
        $this->approve($withdrawal, $operator);
        $this->assertSame(WithdrawalStatus::Sending, $withdrawal->fresh()->status);

        $this->travel(2)->minutes();
        $this->artisan('payments:reconcile')->assertSuccessful();

        $this->assertSame(WithdrawalStatus::Sending, $withdrawal->fresh()->status);
        Http::assertSentCount(2);

        $this->createTimesOut = false;
        $this->artisan('payments:withdrawals', ['action' => 'retry', 'withdrawal' => $withdrawal->public_id, '--operator' => $operator->email, '--note' => 'Provedor sem registro'])->assertSuccessful();

        $this->assertSame(WithdrawalStatus::Processing, $withdrawal->fresh()->status);
        $this->assertSame(10_000, $user->findRealWallet()->balance()->reservedCents);
    }

    #[Test]
    public function the_user_can_cancel_only_before_it_is_sent(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();
        $this->requestWithdrawal($user)->assertCreated();
        $first = Withdrawal::query()->firstOrFail();

        $this->actingAs($user)->deleteJson("/api/v1/withdrawals/{$first->public_id}")->assertOk()->assertJsonPath('data.status', 'canceled');
        $this->assertSame(self::BALANCE, $user->findRealWallet()->balance()->availableCents);

        $this->requestWithdrawal($user)->assertCreated();
        $second = Withdrawal::query()->latest('id')->firstOrFail();
        $this->approve($second, User::factory()->create());

        $this->actingAs($user)->deleteJson("/api/v1/withdrawals/{$second->public_id}")->assertJsonPath('code', 'not_cancelable');
    }

    #[Test]
    public function another_user_cannot_cancel_a_withdrawal(): void
    {
        $owner = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->requestWithdrawal($owner)->assertCreated();

        $this->actingAs(User::factory()->withRealAccount()->create())
            ->deleteJson('/api/v1/withdrawals/'.Withdrawal::query()->firstOrFail()->public_id)
            ->assertNotFound();
    }

    #[Test]
    public function small_withdrawals_can_be_sent_without_an_operator(): void
    {
        config(['platform.real.auto_approve_withdrawal_max_cents' => 20_000]);
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $this->fakeProvider();

        $this->requestWithdrawal($user)->assertCreated()->assertJsonPath('data.status', 'processing');
    }

    #[Test]
    public function other_rate_limited_requests_do_not_use_up_the_withdrawal_limit(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        for ($i = 0; $i < 7; $i++) {
            $this->actingAs($user)->putJson('/api/v1/wallet/environment', ['environment' => 'real'])->assertOk();
        }

        $this->requestWithdrawal($user)->assertCreated();
    }

    #[Test]
    public function withdrawals_stay_available_while_real_mode_is_off(): void
    {
        config(['platform.real_money_enabled' => false]);
        $user = User::factory()->withRealAccount(self::BALANCE)->create();

        $this->requestWithdrawal($user)->assertCreated();
    }

    #[Test]
    public function rejecting_requires_a_note_and_returns_the_amount(): void
    {
        $user = User::factory()->withRealAccount(self::BALANCE)->create();
        $operator = User::factory()->create();
        $this->requestWithdrawal($user)->assertCreated();
        $withdrawal = Withdrawal::query()->firstOrFail();

        $this->artisan('payments:withdrawals', ['action' => 'reject', 'withdrawal' => $withdrawal->public_id, '--operator' => $operator->email])->assertFailed();
        $this->artisan('payments:withdrawals', ['action' => 'reject', 'withdrawal' => $withdrawal->public_id, '--operator' => $operator->email, '--note' => 'Dados divergentes'])->assertSuccessful();

        $this->assertSame(WithdrawalStatus::Rejected, $withdrawal->fresh()->status);
        $this->assertSame(self::BALANCE, $user->findRealWallet()->balance()->availableCents);
    }
}
