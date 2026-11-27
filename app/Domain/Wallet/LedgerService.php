<?php

namespace App\Domain\Wallet;

use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * The only way to move a balance. Each call appends one immutable entry, and
 * replaying an idempotency key returns the original entry instead of moving
 * money twice.
 */
class LedgerService
{
    public function post(
        Wallet $wallet,
        LedgerEntryType $type,
        int $availableDeltaCents,
        int $reservedDeltaCents,
        string $idempotencyKey,
        ?Model $reference = null,
        ?int $actorId = null,
        ?string $reason = null,
    ): WalletTransaction {
        $this->assertEnvironmentAllowed($wallet, $type);

        return DB::transaction(function () use ($wallet, $type, $availableDeltaCents, $reservedDeltaCents, $idempotencyKey, $reference, $actorId, $reason) {
            Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();

            $existing = WalletTransaction::query()
                ->where('wallet_id', $wallet->id)
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($existing !== null) {
                if ($existing->available_delta_cents !== $availableDeltaCents || $existing->reserved_delta_cents !== $reservedDeltaCents) {
                    throw new LogicException("Idempotency key [{$idempotencyKey}] was reused with different amounts.");
                }

                return $existing;
            }

            $latest = $wallet->transactions()->orderByDesc('seq')->first();
            $availableAfter = ($latest?->available_after_cents ?? 0) + $availableDeltaCents;
            $reservedAfter = ($latest?->reserved_after_cents ?? 0) + $reservedDeltaCents;

            if ($availableAfter < 0 || $reservedAfter < 0) {
                throw new InsufficientFunds("Wallet [{$wallet->id}] cannot cover this movement.");
            }

            return WalletTransaction::query()->create([
                'wallet_id' => $wallet->id,
                'seq' => ($latest?->seq ?? 0) + 1,
                'type' => $type,
                'available_delta_cents' => $availableDeltaCents,
                'reserved_delta_cents' => $reservedDeltaCents,
                'available_after_cents' => $availableAfter,
                'reserved_after_cents' => $reservedAfter,
                'idempotency_key' => $idempotencyKey,
                'reference_type' => $reference?->getMorphClass(),
                'reference_id' => $reference?->getKey(),
                'actor_id' => $actorId,
                'reason' => $reason,
            ]);
        }, 3);
    }

    /**
     * Switching real mode off stops new exposure only: settlements, deposits
     * already paid and withdrawals still go through so no balance is stranded.
     */
    private function assertEnvironmentAllowed(Wallet $wallet, LedgerEntryType $type): void
    {
        $environment = $wallet->account->environment;

        if ($environment === Environment::Real && $type->opensExposure() && ! config('platform.real_money_enabled')) {
            throw new LogicException('Real-money trading is disabled on this platform.');
        }

        $realOnly = in_array($type, [
            LedgerEntryType::DepositCredit, LedgerEntryType::DepositReversal, LedgerEntryType::WithdrawalReserve,
            LedgerEntryType::WithdrawalPayout, LedgerEntryType::WithdrawalRelease,
        ], true);

        if ($realOnly && $environment !== Environment::Real) {
            throw new LogicException("Entry type [{$type->value}] is only valid on real wallets.");
        }

        if (in_array($type, [LedgerEntryType::DemoGrant, LedgerEntryType::DemoReset], true) && $environment !== Environment::Demo) {
            throw new LogicException("Entry type [{$type->value}] is only valid on demo wallets.");
        }
    }
}
