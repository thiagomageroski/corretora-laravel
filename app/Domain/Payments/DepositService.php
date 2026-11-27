<?php

namespace App\Domain\Payments;

use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\Data\ProviderTransaction;
use App\Domain\Wallet\InsufficientFunds;
use App\Domain\Wallet\LedgerService;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\DepositStatus;
use App\Enums\LedgerEntryType;
use App\Models\Deposit;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\DepositCredited;
use App\Rules\BrazilianPhone;
use App\Support\Receipts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * PIX deposits into the real wallet. A deposit becomes balance only when the
 * provider, queried directly with our credentials, reports it as paid: neither
 * the browser nor the content of a notification is trusted for that.
 */
class DepositService
{
    public function __construct(
        private AmploPayClient $client,
        private LedgerService $ledger,
        private RealAccountManager $accounts,
        private AuditLogger $audit,
    ) {}

    /**
     * @throws PaymentRejected
     */
    public function create(User $user, int $amountCents, string $idempotencyKey): Deposit
    {
        $previous = $user->deposits()->where('idempotency_key', $idempotencyKey)->first();

        if ($previous !== null) {
            return $previous;
        }

        $wallet = $this->guardedWallet($user);
        $limits = config('platform.real');

        // AmploPay refuses a PIX charge without the payer's phone and document.
        if (blank($user->phone) || blank($user->document_number)) {
            throw new PaymentRejected('payer_data_missing');
        }

        if ($amountCents < $limits['min_deposit_cents'] || $amountCents > $limits['max_deposit_cents']) {
            throw new PaymentRejected('amount_out_of_range');
        }

        $pending = $user->deposits()->where('status', DepositStatus::Pending)->where('expires_at', '>', now())->count();

        if ($pending >= $limits['max_pending_deposits']) {
            throw new PaymentRejected('too_many_pending_deposits');
        }

        try {
            $deposit = $user->deposits()->create([
                'wallet_id' => $wallet->id,
                'amount_cents' => $amountCents,
                'currency' => $wallet->currency,
                'status' => DepositStatus::Pending,
                'provider' => AmploPayClient::PROVIDER,
                'idempotency_key' => $idempotencyKey,
                'expires_at' => now()->addMinutes((int) $limits['deposit_expiry_minutes']),
            ]);
        } catch (UniqueConstraintViolationException) {
            return $user->deposits()->where('idempotency_key', $idempotencyKey)->firstOrFail();
        }

        try {
            $charge = $this->client->createPixCharge(
                identifier: $deposit->public_id,
                amountCents: $amountCents,
                client: [
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => BrazilianPhone::digits((string) $user->phone),
                    'document' => $user->document_number,
                ],
                callbackUrl: PaymentCallback::url(),
                productName: 'Depósito em conta '.config('app.name'),
            );
        } catch (PaymentProviderError $error) {
            $deposit->update(['status' => DepositStatus::Failed, 'failure_reason' => mb_substr($error->getMessage(), 0, 250)]);
            Log::warning('PIX charge failed', ['deposit' => $deposit->id, 'code' => $error->providerCode, 'status' => $error->httpStatus, 'fields' => $error->fields]);

            // A validation error describes our request, not something the payer can fix.
            $detail = $error->definitive && $error->providerCode !== 'GATEWAY_INVALID_DATA' ? $error->getMessage() : null;

            throw new PaymentRejected($error->definitive ? 'provider_rejected' : 'provider_unavailable', $detail);
        }

        $deposit->update([
            'provider_transaction_id' => $charge->transactionId,
            'provider_status' => $charge->status,
            'webhook_token_hash' => $charge->webhookToken === null ? null : hash('sha256', $charge->webhookToken),
            'pix_code' => $charge->pixCode,
            'pix_image_url' => $charge->pixImageUrl,
            'fee_cents' => $charge->feeCents,
            'expires_at' => $charge->expiresAt ?? $deposit->expires_at,
        ]);

        $this->audit->record('payments.deposit_created', $deposit, $user->id, ['amount_cents' => $amountCents]);

        return $deposit;
    }

    /**
     * Ask the provider for the current state and apply it.
     *
     * @throws PaymentProviderError
     */
    public function refresh(Deposit $deposit): Deposit
    {
        if ($deposit->provider_transaction_id === null) {
            return $deposit;
        }

        $transaction = $this->client->findTransaction($deposit->provider_transaction_id);

        return $this->apply($deposit, $transaction);
    }

    public function apply(Deposit $deposit, ProviderTransaction $transaction): Deposit
    {
        return DB::transaction(function () use ($deposit, $transaction): Deposit {
            $locked = Deposit::query()->whereKey($deposit->id)->lockForUpdate()->firstOrFail();
            $locked->forceFill(['provider_status' => $transaction->status, 'last_checked_at' => now()]);

            if ($transaction->id !== $locked->provider_transaction_id || ($transaction->identifier !== null && $transaction->identifier !== $locked->public_id)) {
                Log::critical('Provider transaction does not match deposit', ['deposit' => $locked->id]);
                $locked->save();

                return $locked;
            }

            match ($transaction->status) {
                'COMPLETED' => $this->settlePaid($locked, $transaction),
                'FAILED' => $this->close($locked, DepositStatus::Failed, $transaction->description),
                'EXPIRED' => $this->close($locked, DepositStatus::Expired),
                'REFUNDED' => $this->reverse($locked, DepositStatus::Refunded),
                'CHARGED_BACK' => $this->reverse($locked, DepositStatus::ChargedBack),
                default => null,
            };

            $locked->save();

            return $locked;
        });
    }

    /**
     * Credit a deposit held for review, after an operator checked it.
     */
    public function approveReview(Deposit $deposit, int $actorId, string $note): Deposit
    {
        return DB::transaction(function () use ($deposit, $actorId, $note): Deposit {
            $locked = Deposit::query()->whereKey($deposit->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== DepositStatus::Review) {
                throw new PaymentRejected('invalid_state');
            }

            $this->credit($locked, $actorId, $note);
            $locked->save();

            return $locked;
        });
    }

    /**
     * Credit a charge whose payment an operator saw in the provider's panel,
     * for when its notification never arrived. Requires a justification and is
     * audited like any manual adjustment.
     */
    public function confirmManually(Deposit $deposit, int $actorId, string $note): Deposit
    {
        return DB::transaction(function () use ($deposit, $actorId, $note): Deposit {
            $locked = Deposit::query()->whereKey($deposit->id)->lockForUpdate()->firstOrFail();

            if (! in_array($locked->status, [DepositStatus::Pending, DepositStatus::Expired], true) || $locked->provider_transaction_id === null) {
                throw new PaymentRejected('invalid_state');
            }

            $locked->paid_at ??= now();
            $this->credit($locked, $actorId, "Confirmado manualmente: {$note}");
            $locked->save();
            $this->audit->record('payments.deposit_confirmed_manually', $locked, $actorId, ['note' => $note]);

            return $locked;
        });
    }

    /**
     * Refuse a deposit held for review. Nothing was credited; returning the
     * money to the payer is done in the provider's panel.
     */
    public function dismissReview(Deposit $deposit, int $actorId, string $note): Deposit
    {
        return DB::transaction(function () use ($deposit, $actorId, $note): Deposit {
            $locked = Deposit::query()->whereKey($deposit->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== DepositStatus::Review) {
                throw new PaymentRejected('invalid_state');
            }

            $locked->update(['status' => DepositStatus::Failed, 'failure_reason' => 'Recusado na análise; devolução pelo painel do provedor.']);
            $this->audit->record('payments.deposit_dismissed', $locked, $actorId, ['note' => $note]);

            return $locked;
        });
    }

    private function settlePaid(Deposit $deposit, ProviderTransaction $transaction): void
    {
        if ($deposit->status !== DepositStatus::Pending) {
            return;
        }

        $deposit->paid_at = $transaction->paidAt ?? now();

        $reviewReason = match (true) {
            $transaction->currency !== $deposit->currency => 'currency_mismatch',
            $transaction->amountCents < $deposit->amount_cents => 'amount_mismatch',
            config('platform.real.require_payer_match') && $this->payerDiffers($deposit, $transaction) => 'payer_mismatch',
            default => null,
        };

        if ($reviewReason !== null) {
            $deposit->status = DepositStatus::Review;
            $deposit->review_reason = $reviewReason;
            $this->audit->record('payments.deposit_held', $deposit, context: ['reason' => $reviewReason]);
            Log::warning('Deposit held for review', ['deposit' => $deposit->id, 'reason' => $reviewReason]);

            return;
        }

        $this->credit($deposit);
    }

    private function credit(Deposit $deposit, ?int $actorId = null, ?string $note = null): void
    {
        $entry = $this->ledger->post(
            wallet: $deposit->wallet,
            type: LedgerEntryType::DepositCredit,
            availableDeltaCents: $deposit->amount_cents,
            reservedDeltaCents: 0,
            idempotencyKey: "deposit:{$deposit->id}:credit",
            reference: $deposit,
            actorId: $actorId,
            reason: $note ?? 'Depósito PIX confirmado pelo provedor',
        );

        $deposit->status = DepositStatus::Completed;
        $deposit->credited_at = now();

        $this->audit->record('payments.deposit_credited', $deposit, $actorId, ['entry_id' => $entry->id, 'note' => $note]);
        Receipts::send($deposit->user, new DepositCredited($deposit));
    }

    private function close(Deposit $deposit, DepositStatus $status, ?string $reason = null): void
    {
        if ($deposit->status === DepositStatus::Pending) {
            $deposit->status = $status;
            $deposit->failure_reason = $reason === null ? null : mb_substr($reason, 0, 250);
        }
    }

    /**
     * A refund or chargeback takes the credited amount back. If part of it was
     * already traded or withdrawn, whatever is available is taken and the real
     * account is frozen for an operator to settle the difference.
     */
    private function reverse(Deposit $deposit, DepositStatus $status): void
    {
        if ($deposit->reversed_at !== null || in_array($deposit->status, [DepositStatus::Refunded, DepositStatus::ChargedBack], true)) {
            return;
        }

        $wasCredited = $deposit->status === DepositStatus::Completed;
        $deposit->status = $status;
        $deposit->reversed_at = now();

        if (! $wasCredited) {
            return;
        }

        $wallet = $deposit->wallet;
        Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();

        try {
            $this->postReversal($deposit, $deposit->amount_cents);
        } catch (InsufficientFunds) {
            $available = $wallet->balance()->availableCents;

            if ($available > 0) {
                $this->postReversal($deposit, $available);
            }

            $this->accounts->freeze($wallet->account, "deposit_reversal_shortfall:{$deposit->id}");
            $this->audit->record('payments.deposit_reversal_shortfall', $deposit, context: [
                'outstanding_cents' => $deposit->amount_cents - $available,
            ]);
        }

        $this->audit->record('payments.deposit_reversed', $deposit, context: ['status' => $status->value]);
    }

    private function postReversal(Deposit $deposit, int $amountCents): void
    {
        $this->ledger->post(
            wallet: $deposit->wallet,
            type: LedgerEntryType::DepositReversal,
            availableDeltaCents: -$amountCents,
            reservedDeltaCents: 0,
            idempotencyKey: "deposit:{$deposit->id}:reversal",
            reference: $deposit,
            reason: 'Estorno ou contestação do depósito PIX',
        );
    }

    private function payerDiffers(Deposit $deposit, ProviderTransaction $transaction): bool
    {
        $holder = $deposit->user->document_number;

        return $transaction->payerDocument !== null && $holder !== null && $transaction->payerDocument !== $holder;
    }

    /**
     * @throws PaymentRejected
     */
    private function guardedWallet(User $user): Wallet
    {
        if (! config('platform.real_money_enabled')) {
            throw new PaymentRejected('real_money_disabled');
        }

        if (! $this->client->isConfigured()) {
            throw new PaymentRejected('payments_not_configured');
        }

        // The provider only reports payments by notification, so a charge it cannot notify could never be credited.
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
