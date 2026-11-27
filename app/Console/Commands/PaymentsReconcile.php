<?php

namespace App\Console\Commands;

use App\Domain\Payments\AmploPayClient;
use App\Domain\Payments\DepositService;
use App\Domain\Payments\PaymentProviderError;
use App\Domain\Payments\WithdrawalService;
use App\Enums\DepositStatus;
use App\Enums\WithdrawalStatus;
use App\Models\Deposit;
use App\Models\Withdrawal;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('payments:reconcile {--limit=10 : Maximum provider lookups per kind}')]
#[Description('Ask the payment provider about open deposits and withdrawals, in case a notification was missed')]
class PaymentsReconcile extends Command
{
    /**
     * Each item is looked up at most this often, to stay well inside the
     * provider's polling limits.
     */
    private const RECHECK_AFTER_SECONDS = 600;

    /**
     * Pending charges are followed this long after they expire, since a payment
     * can be confirmed late.
     */
    private const FOLLOW_EXPIRED_FOR_HOURS = 24;

    public function handle(DepositService $deposits, WithdrawalService $withdrawals, AmploPayClient $client): int
    {
        $this->expireAbandoned();

        if (! $client->lookupsEnabled()) {
            $this->info('Provider lookups are disabled (AMPLOPAY_STATUS_LOOKUPS); payments are confirmed by webhook.');

            return self::SUCCESS;
        }

        if (($paused = $client->lookupsBlockedFor()) > 0) {
            $this->warn("Provider lookups paused for {$paused} s after a rate limit; waiting for webhooks.");

            return self::SUCCESS;
        }

        $limit = (int) $this->option('limit');
        $staleBefore = now()->subSeconds(self::RECHECK_AFTER_SECONDS);

        $openDeposits = Deposit::query()
            ->where('status', DepositStatus::Pending)
            ->whereNotNull('provider_transaction_id')
            ->where('created_at', '>=', now()->subHours(self::FOLLOW_EXPIRED_FOR_HOURS))
            ->where(fn ($query) => $query->whereNull('last_checked_at')->orWhere('last_checked_at', '<', $staleBefore))
            ->orderBy('last_checked_at')
            ->limit($limit)
            ->get();

        foreach ($openDeposits as $deposit) {
            $this->attempt("Deposit {$deposit->public_id}", fn () => $deposits->refresh($deposit), fn () => $deposit->update(['last_checked_at' => now()]));
        }

        $openWithdrawals = Withdrawal::query()
            ->whereIn('status', [WithdrawalStatus::Sending, WithdrawalStatus::Processing])
            ->where(fn ($query) => $query->whereNull('last_checked_at')->orWhere('last_checked_at', '<', $staleBefore))
            ->where(fn ($query) => $query->whereNull('sent_at')->orWhere('sent_at', '<', now()->subMinute()))
            ->orderBy('last_checked_at')
            ->limit($limit)
            ->get();

        foreach ($openWithdrawals as $withdrawal) {
            $this->attempt("Withdrawal {$withdrawal->public_id}", fn () => $withdrawals->refresh($withdrawal), fn () => $withdrawal->update(['last_checked_at' => now()]));
        }

        $this->info("Checked {$openDeposits->count()} deposits and {$openWithdrawals->count()} withdrawals.");

        return self::SUCCESS;
    }

    /**
     * Charges never registered at the provider, or past the follow-up window,
     * cannot be paid any more.
     */
    private function expireAbandoned(): void
    {
        Deposit::query()
            ->where('status', DepositStatus::Pending)
            ->where('expires_at', '<', now()->subHours(self::FOLLOW_EXPIRED_FOR_HOURS))
            ->update(['status' => DepositStatus::Expired, 'updated_at' => now()]);
    }

    private function attempt(string $label, callable $refresh, callable $markChecked): void
    {
        try {
            $refresh();
        } catch (PaymentProviderError $error) {
            $markChecked();
            $this->warn("{$label}: {$error->getMessage()}");
        } catch (Throwable $exception) {
            report($exception);
            $this->error("{$label}: {$exception->getMessage()}");
        }
    }
}
