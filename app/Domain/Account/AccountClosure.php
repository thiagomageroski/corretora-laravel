<?php

namespace App\Domain\Account;

use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\PaymentRejected;
use App\Enums\WithdrawalStatus;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Closing an account and asking for its data to be erased. Both refuse while
 * money is still moving, so nothing is left half-settled.
 */
class AccountClosure
{
    public const STATUS_CLOSED = 'closed';

    public function __construct(private AuditLogger $audit) {}

    /**
     * Blocks sign-in until support reopens the account. Balances are kept.
     *
     * @throws PaymentRejected
     */
    public function close(User $user): void
    {
        $this->assertNothingInFlight($user);

        DB::transaction(function () use ($user): void {
            $user->forceFill(['status' => self::STATUS_CLOSED, 'closed_at' => now()])->save();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            $this->audit->record('account.closed', $user, $user->id);
        });
    }

    /**
     * Records the request; erasure itself is done by an operator, because
     * financial records must be kept for the period the law requires.
     *
     * @throws PaymentRejected
     */
    public function requestDeletion(User $user): void
    {
        $this->assertNothingInFlight($user);

        $realBalance = $user->findRealWallet()?->balance();

        if ($realBalance !== null && $realBalance->availableCents + $realBalance->reservedCents > 0) {
            throw new PaymentRejected('balance_remaining');
        }

        if ($user->deletion_requested_at === null) {
            $user->forceFill(['deletion_requested_at' => now()])->save();
            $this->audit->record('account.deletion_requested', $user, $user->id);
        }
    }

    /**
     * @throws PaymentRejected
     */
    private function assertNothingInFlight(User $user): void
    {
        if ($user->positions()->open()->exists()) {
            throw new PaymentRejected('open_positions');
        }

        if ($user->withdrawals()->whereIn('status', [WithdrawalStatus::Requested, WithdrawalStatus::Sending, WithdrawalStatus::Processing])->exists()) {
            throw new PaymentRejected('withdrawal_in_progress');
        }
    }
}
