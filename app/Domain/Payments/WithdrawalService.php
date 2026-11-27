<?php

namespace App\Domain\Payments;

use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\Data\ProviderTransfer;
use App\Domain\Wallet\InsufficientFunds;
use App\Domain\Wallet\LedgerService;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\LedgerEntryType;
use App\Enums\WithdrawalStatus;
use App\Models\User;
use App\Models\Wallet;
use App\Models\Withdrawal;
use App\Notifications\WithdrawalCompleted;
use App\Support\Receipts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * PIX withdrawals from the real wallet. The amount is reserved on request and
 * only leaves the ledger when the provider reports the transfer as completed;
 * a failed or rejected transfer returns it to the available balance.
 */
class WithdrawalService
{
    public const PIX_KEY_TYPES = ['cpf', 'email', 'phone', 'random'];

    public function __construct(
        private AmploPayClient $client,
        private LedgerService $ledger,
        private AuditLogger $audit,
    ) {}

    /**
     * @throws PaymentRejected
     */
    public function request(User $user, int $amountCents, string $pixKeyType, string $pixKey, ?string $ip, string $idempotencyKey): Withdrawal
    {
        $previous = $user->withdrawals()->where('idempotency_key', $idempotencyKey)->first();

        if ($previous !== null) {
            return $previous;
        }

        $wallet = $this->guardedWallet($user);
        $limits = config('platform.real');
        $pixKey = self::normalizedKey($pixKeyType, $pixKey);

        if ($amountCents < $limits['min_withdrawal_cents'] || $amountCents > $limits['max_withdrawal_cents']) {
            throw new PaymentRejected('amount_out_of_range');
        }

        if ($pixKeyType === 'cpf' && $pixKey !== $user->document_number) {
            throw new PaymentRejected('pix_key_not_owned');
        }

        try {
            $withdrawal = DB::transaction(function () use ($user, $wallet, $amountCents, $pixKeyType, $pixKey, $ip, $idempotencyKey, $limits): Withdrawal {
                Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();

                $lastDay = $user->withdrawals()
                    ->whereNotIn('status', [WithdrawalStatus::Failed, WithdrawalStatus::Rejected, WithdrawalStatus::Canceled])
                    ->where('created_at', '>=', now()->subDay())
                    ->sum('amount_cents');

                if ($lastDay + $amountCents > $limits['daily_withdrawal_limit_cents']) {
                    throw new PaymentRejected('daily_limit_reached');
                }

                $withdrawal = $user->withdrawals()->create([
                    'wallet_id' => $wallet->id,
                    'amount_cents' => $amountCents,
                    'currency' => $wallet->currency,
                    'status' => WithdrawalStatus::Requested,
                    'pix_key_type' => $pixKeyType,
                    'pix_key' => $pixKey,
                    'requested_ip' => $ip,
                    'provider' => AmploPayClient::PROVIDER,
                    'idempotency_key' => $idempotencyKey,
                ]);

                $this->ledger->post(
                    wallet: $wallet,
                    type: LedgerEntryType::WithdrawalReserve,
                    availableDeltaCents: -$amountCents,
                    reservedDeltaCents: $amountCents,
                    idempotencyKey: "withdrawal:{$withdrawal->id}:reserve",
                    reference: $withdrawal,
                    actorId: $user->id,
                    reason: 'Saque PIX solicitado',
                );

                $this->audit->record('payments.withdrawal_requested', $withdrawal, $user->id, ['amount_cents' => $amountCents]);

                return $withdrawal;
            });
        } catch (InsufficientFunds) {
            throw new PaymentRejected('insufficient_funds');
        } catch (UniqueConstraintViolationException) {
            return $user->withdrawals()->where('idempotency_key', $idempotencyKey)->firstOrFail();
        }

        if ($amountCents <= (int) $limits['auto_approve_withdrawal_max_cents']) {
            return $this->approve($withdrawal, null, 'Aprovação automática dentro do limite configurado');
        }

        return $withdrawal;
    }

    /**
     * @throws PaymentRejected
     */
    public function cancel(Withdrawal $withdrawal, int $actorId): Withdrawal
    {
        return $this->release($withdrawal, WithdrawalStatus::Canceled, $actorId, 'Cancelado pelo usuário', 'payments.withdrawal_canceled');
    }

    /**
     * @throws PaymentRejected
     */
    public function reject(Withdrawal $withdrawal, int $actorId, string $note): Withdrawal
    {
        return $this->release($withdrawal, WithdrawalStatus::Rejected, $actorId, $note, 'payments.withdrawal_rejected');
    }

    /**
     * Approve a requested withdrawal and send it to the provider.
     *
     * @throws PaymentRejected
     */
    public function approve(Withdrawal $withdrawal, ?int $actorId, string $note): Withdrawal
    {
        $approved = DB::transaction(function () use ($withdrawal, $actorId, $note): Withdrawal {
            $locked = Withdrawal::query()->whereKey($withdrawal->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== WithdrawalStatus::Requested) {
                throw new PaymentRejected('invalid_state');
            }

            $locked->update([
                'status' => WithdrawalStatus::Sending,
                'reviewed_by' => $actorId,
                'review_note' => mb_substr($note, 0, 250),
                'approved_at' => now(),
            ]);

            $this->audit->record('payments.withdrawal_approved', $locked, $actorId, ['note' => $note]);

            return $locked;
        });

        return $this->send($approved);
    }

    /**
     * Hand an approved withdrawal to the provider. If an earlier attempt ended
     * without an answer, the provider is asked first; when it has no record,
     * sending again is left to an operator (`payments:withdrawals retry`), so
     * a slow provider can never cause the same withdrawal to be paid twice.
     */
    public function send(Withdrawal $withdrawal, bool $resendIfMissing = false): Withdrawal
    {
        if ($withdrawal->status !== WithdrawalStatus::Sending) {
            return $withdrawal;
        }

        try {
            if ($withdrawal->sent_at !== null) {
                $existing = $this->client->findTransfer(identifier: $withdrawal->public_id);

                if ($existing !== null) {
                    $withdrawal->update(['provider_transfer_id' => $existing->id]);

                    return $this->apply($withdrawal, $existing);
                }

                if (! $resendIfMissing) {
                    $withdrawal->update(['last_checked_at' => now()]);

                    return $withdrawal;
                }
            }

            $withdrawal->update(['sent_at' => now()]);

            $user = $withdrawal->user;
            $transfer = $this->client->createTransfer(
                identifier: $withdrawal->public_id,
                amountCents: $withdrawal->amount_cents,
                pix: ['type' => $withdrawal->pix_key_type, 'key' => (string) $withdrawal->pix_key],
                owner: [
                    'ip' => (string) ($withdrawal->requested_ip ?? request()?->ip() ?? '0.0.0.0'),
                    'name' => self::ownerName($user->name),
                    'document_type' => 'cpf',
                    'document_number' => (string) $user->document_number,
                ],
                callbackUrl: PaymentCallback::url(),
                feePaidByReceiver: (bool) config('platform.real.withdrawal_fee_paid_by_user'),
            );
        } catch (PaymentProviderError $error) {
            if ($error->definitive) {
                return $this->fail($withdrawal, $error->getMessage());
            }

            Log::warning('Withdrawal outcome unknown', ['withdrawal' => $withdrawal->id, 'status' => $error->httpStatus]);
            $withdrawal->update(['failure_reason' => 'Sem resposta do provedor; aguardando conferência.']);

            return $withdrawal;
        }

        $withdrawal->update([
            'provider_transfer_id' => $transfer->id,
            'webhook_token_hash' => $transfer->webhookToken === null ? null : hash('sha256', $transfer->webhookToken),
            'fee_cents' => $transfer->feeCents,
            'failure_reason' => null,
        ]);

        return $this->apply($withdrawal, $transfer);
    }

    /**
     * @throws PaymentProviderError
     */
    public function refresh(Withdrawal $withdrawal): Withdrawal
    {
        if ($withdrawal->status === WithdrawalStatus::Sending) {
            return $this->send($withdrawal);
        }

        if ($withdrawal->provider_transfer_id === null || $withdrawal->status->isFinal()) {
            return $withdrawal;
        }

        $transfer = $this->client->findTransfer(transferId: $withdrawal->provider_transfer_id);

        if ($transfer === null) {
            $withdrawal->update(['last_checked_at' => now()]);

            return $withdrawal;
        }

        return $this->apply($withdrawal, $transfer);
    }

    public function apply(Withdrawal $withdrawal, ProviderTransfer $transfer): Withdrawal
    {
        return DB::transaction(function () use ($withdrawal, $transfer): Withdrawal {
            $locked = Withdrawal::query()->whereKey($withdrawal->id)->lockForUpdate()->firstOrFail();

            if ($locked->status->isFinal()) {
                return $locked;
            }

            $locked->forceFill(['provider_status' => $transfer->status, 'last_checked_at' => now()]);

            // A send that ended without an answer learns its provider id from the first notification.
            if ($locked->provider_transfer_id === null && $transfer->identifier === $locked->public_id && $transfer->id !== '') {
                $locked->provider_transfer_id = $transfer->id;
            }

            if ($transfer->id !== $locked->provider_transfer_id) {
                Log::critical('Provider transfer does not match withdrawal', ['withdrawal' => $locked->id]);
                $locked->save();

                return $locked;
            }

            if ($transfer->status === 'COMPLETED') {
                $this->ledger->post(
                    wallet: $locked->wallet,
                    type: LedgerEntryType::WithdrawalPayout,
                    availableDeltaCents: 0,
                    reservedDeltaCents: -$locked->amount_cents,
                    idempotencyKey: "withdrawal:{$locked->id}:payout",
                    reference: $locked,
                    reason: 'Saque PIX concluído pelo provedor',
                );

                $locked->forceFill([
                    'status' => WithdrawalStatus::Completed,
                    'completed_at' => now(),
                    'received_cents' => $transfer->receivedCents,
                    'end_to_end_id' => $transfer->endToEndId,
                    'fee_cents' => $transfer->feeCents ?? $locked->fee_cents,
                ])->save();

                $this->audit->record('payments.withdrawal_completed', $locked);
                Receipts::send($locked->user, new WithdrawalCompleted($locked));

                return $locked;
            }

            if ($transfer->status === 'CANCELED') {
                $locked->save();

                return $this->fail($locked, $transfer->reason ?? 'Transferência cancelada pelo provedor.');
            }

            $locked->status = WithdrawalStatus::Processing;
            $locked->save();

            return $locked;
        });
    }

    private function fail(Withdrawal $withdrawal, string $reason): Withdrawal
    {
        return DB::transaction(function () use ($withdrawal, $reason): Withdrawal {
            $locked = Withdrawal::query()->whereKey($withdrawal->id)->lockForUpdate()->firstOrFail();

            if ($locked->status->isFinal()) {
                return $locked;
            }

            $this->postRelease($locked, 'Saque não concluído; valor devolvido');
            $locked->update(['status' => WithdrawalStatus::Failed, 'failed_at' => now(), 'failure_reason' => mb_substr($reason, 0, 250)]);
            $this->audit->record('payments.withdrawal_failed', $locked, context: ['reason' => $reason]);

            return $locked;
        });
    }

    /**
     * @throws PaymentRejected
     */
    private function release(Withdrawal $withdrawal, WithdrawalStatus $status, int $actorId, string $note, string $action): Withdrawal
    {
        return DB::transaction(function () use ($withdrawal, $status, $actorId, $note, $action): Withdrawal {
            $locked = Withdrawal::query()->whereKey($withdrawal->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== WithdrawalStatus::Requested) {
                throw new PaymentRejected($status === WithdrawalStatus::Canceled ? 'not_cancelable' : 'invalid_state');
            }

            $this->postRelease($locked, $note, $actorId);
            $locked->update([
                'status' => $status,
                'failed_at' => now(),
                'reviewed_by' => $actorId,
                'review_note' => mb_substr($note, 0, 250),
            ]);
            $this->audit->record($action, $locked, $actorId, ['note' => $note]);

            return $locked;
        });
    }

    private function postRelease(Withdrawal $withdrawal, string $reason, ?int $actorId = null): void
    {
        $this->ledger->post(
            wallet: $withdrawal->wallet,
            type: LedgerEntryType::WithdrawalRelease,
            availableDeltaCents: $withdrawal->amount_cents,
            reservedDeltaCents: -$withdrawal->amount_cents,
            idempotencyKey: "withdrawal:{$withdrawal->id}:release",
            reference: $withdrawal,
            actorId: $actorId,
            reason: mb_substr($reason, 0, 250),
        );
    }

    /**
     * @throws PaymentRejected
     */
    public static function normalizedKey(string $type, string $key): string
    {
        $key = trim($key);

        $normalized = match ($type) {
            'cpf' => AmploPayClient::digits($key),
            'phone' => ($digits = AmploPayClient::digits($key)) === null ? null : '+'.(str_starts_with($digits, '55') && strlen($digits) >= 12 ? $digits : '55'.$digits),
            'email' => filter_var($key, FILTER_VALIDATE_EMAIL) === false ? null : mb_strtolower($key),
            'random' => preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $key) === 1 ? mb_strtolower($key) : null,
            default => null,
        };

        if ($normalized === null) {
            throw new PaymentRejected('invalid_pix_key');
        }

        return $normalized;
    }

    /**
     * The provider accepts letters and spaces only, without accents, up to 100 characters.
     */
    public static function ownerName(string $name): string
    {
        $ascii = preg_replace('/[^A-Za-z ]+/', '', Str::ascii($name));

        return mb_substr(trim((string) preg_replace('/\s+/', ' ', (string) $ascii)), 0, 100);
    }

    /**
     * @throws PaymentRejected
     */
    private function guardedWallet(User $user): Wallet
    {
        if (! $this->client->isConfigured()) {
            throw new PaymentRejected('payments_not_configured');
        }

        if (PaymentCallback::url() === null) {
            throw new PaymentRejected('webhook_unavailable');
        }

        $wallet = $user->findRealWallet() ?? throw new PaymentRejected('real_account_missing');

        if ($wallet->account->status !== RealAccountManager::STATUS_ACTIVE) {
            throw new PaymentRejected('account_inactive');
        }

        return $wallet;
    }
}
