<?php

namespace App\Domain\Payments;

use App\Domain\Payments\Data\ProviderTransaction;
use App\Domain\Payments\Data\ProviderTransfer;
use App\Models\Deposit;
use App\Models\PaymentWebhook;
use App\Models\Withdrawal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Receives AmploPay notifications.
 *
 * AmploPay blocks status lookups ("polling") and authenticates notifications
 * with a secret token returned only to us when each charge or transfer is
 * created. A notification carrying that token, or the account-wide token, is
 * applied as the provider's answer; its ids and amount must still match our
 * record. Without any token to check, the notification only triggers a lookup.
 */
class AmploPayWebhookHandler
{
    public const ACCEPTED = 'processed';

    public const REJECTED = 'rejected';

    /**
     * Fields that carry tokens or personal data and are not stored.
     */
    private const DISCARDED = ['token', 'client', 'payoutAccount', 'trackProps', 'checkoutUrl', 'transaction.pixMetadata', 'transaction.trackProps', 'transaction.pixInformation.qrCode'];

    public function __construct(
        private DepositService $deposits,
        private WithdrawalService $withdrawals,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @return string One of the class constants: whether the notification was accepted.
     */
    public function handle(array $payload, ?string $ip): string
    {
        $event = is_string($payload['event'] ?? null) ? $payload['event'] : null;
        $token = is_string($payload['token'] ?? null) ? $payload['token'] : null;
        $target = $this->target($event, $payload);

        $webhook = PaymentWebhook::query()->create([
            'provider' => AmploPayClient::PROVIDER,
            'event' => $event === null ? null : mb_substr($event, 0, 48),
            'entity_id' => $target === null ? null : mb_substr((string) $target->getAttribute($target instanceof Deposit ? 'provider_transaction_id' : 'provider_transfer_id'), 0, 64),
            'payload' => $this->stored($payload),
            'status' => 'received',
            'ip_address' => $ip,
            'received_at' => now(),
        ]);

        if ($target === null) {
            $webhook->update(['status' => 'ignored', 'processed_at' => now()]);

            return self::ACCEPTED;
        }

        $authenticated = $this->authenticated($target->getAttribute('webhook_token_hash'), $token);

        if ($authenticated === false) {
            $webhook->update(['status' => self::REJECTED, 'error' => 'invalid_token', 'processed_at' => now()]);
            Log::warning('Payment webhook with invalid token', ['webhook' => $webhook->id, 'event' => $event]);

            return self::REJECTED;
        }

        $webhook->token_valid = $authenticated === true;

        try {
            if ($authenticated === true) {
                $target instanceof Deposit
                    ? $this->deposits->apply($target, $this->transactionFrom($payload))
                    : $this->withdrawals->apply($target, $this->transferFrom($payload));
            } else {
                $target instanceof Deposit ? $this->deposits->refresh($target) : $this->withdrawals->refresh($target);
            }

            $webhook->status = 'processed';
        } catch (PaymentProviderError $error) {
            $webhook->status = 'deferred';
            $webhook->error = mb_substr($error->getMessage(), 0, 250);
        } catch (Throwable $exception) {
            report($exception);
            $webhook->status = 'failed';
            $webhook->error = mb_substr($exception->getMessage(), 0, 250);
            $webhook->processed_at = now();
            $webhook->save();

            // A server error makes the provider retry the notification later.
            throw $exception;
        }

        $webhook->processed_at = now();
        $webhook->save();

        return self::ACCEPTED;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function transactionFrom(array $payload): ProviderTransaction
    {
        $transaction = (array) ($payload['transaction'] ?? []);
        $paidAt = $transaction['payedAt'] ?? null;

        return new ProviderTransaction(
            id: (string) ($transaction['id'] ?? ''),
            identifier: isset($transaction['identifier']) ? (string) $transaction['identifier'] : null,
            status: (string) ($transaction['status'] ?? ''),
            amountCents: AmploPayClient::cents($transaction['amount'] ?? 0),
            currency: (string) ($transaction['currency'] ?? 'BRL'),
            payerDocument: AmploPayClient::digits(Arr::get($transaction, 'pixMetadata.payerDocument')),
            paidAt: is_string($paidAt) ? CarbonImmutable::parse($paidAt)->utc() : null,
            description: null,
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function transferFrom(array $payload): ProviderTransfer
    {
        $withdraw = (array) ($payload['withdraw'] ?? []);
        $completedSend = collect($payload['sents'] ?? [])->firstWhere('status', 'COMPLETED');
        $received = AmploPayClient::cents($withdraw['receivedAmount'] ?? 0);

        return new ProviderTransfer(
            id: (string) ($withdraw['id'] ?? ''),
            identifier: isset($withdraw['clientIdentifier']) ? (string) $withdraw['clientIdentifier'] : null,
            status: (string) ($withdraw['status'] ?? ''),
            amountCents: AmploPayClient::cents($withdraw['amount'] ?? 0),
            feeCents: isset($withdraw['feeAmount']) ? AmploPayClient::cents($withdraw['feeAmount']) : null,
            receivedCents: $received > 0 ? $received : (is_array($completedSend) ? AmploPayClient::cents($completedSend['amount'] ?? 0) : null),
            endToEndId: is_array($completedSend) ? ($completedSend['endToEndId'] ?? null) : null,
            reason: isset($withdraw['message']) ? (string) $withdraw['message'] : null,
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function target(?string $event, array $payload): Deposit|Withdrawal|null
    {
        if ($event === null) {
            return null;
        }

        if (str_starts_with($event, 'TRANSFER_')) {
            return $this->findWithdrawal(Arr::get($payload, 'withdraw.id'), Arr::get($payload, 'withdraw.clientIdentifier'));
        }

        if (str_starts_with($event, 'TRANSACTION_') || str_starts_with($event, 'CHARGEBACK_') || str_starts_with($event, 'MED_')) {
            return $this->findDeposit(Arr::get($payload, 'transaction.id'), Arr::get($payload, 'transaction.identifier'));
        }

        return null;
    }

    private function findDeposit(mixed $providerId, mixed $identifier): ?Deposit
    {
        if (is_string($providerId) && $providerId !== '') {
            $deposit = Deposit::query()->where('provider_transaction_id', $providerId)->first();

            if ($deposit !== null) {
                return $deposit;
            }
        }

        return is_string($identifier) && $identifier !== ''
            ? Deposit::query()->where('public_id', $identifier)->whereNotNull('provider_transaction_id')->first()
            : null;
    }

    private function findWithdrawal(mixed $providerId, mixed $identifier): ?Withdrawal
    {
        if (is_string($providerId) && $providerId !== '') {
            $withdrawal = Withdrawal::query()->where('provider_transfer_id', $providerId)->first();

            if ($withdrawal !== null) {
                return $withdrawal;
            }
        }

        return is_string($identifier) && $identifier !== ''
            ? Withdrawal::query()->where('public_id', $identifier)->first()
            : null;
    }

    /**
     * true: the token is the secret of this charge or transfer, or the account
     * token. false: a secret exists and the token does not match it. null:
     * there is no secret to check, so only a provider lookup can be trusted.
     */
    private function authenticated(?string $expectedHash, ?string $token): ?bool
    {
        $global = (string) config('services.amplopay.webhook_token');

        if ($expectedHash === null && $global === '') {
            return null;
        }

        if ($token === null) {
            return false;
        }

        return ($expectedHash !== null && hash_equals($expectedHash, hash('sha256', $token)))
            || ($global !== '' && hash_equals($global, $token));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function stored(array $payload): array
    {
        Arr::forget($payload, self::DISCARDED);

        foreach (array_keys((array) ($payload['sents'] ?? [])) as $index) {
            Arr::forget($payload, "sents.{$index}.pixMetadata");
        }

        return $payload;
    }
}
