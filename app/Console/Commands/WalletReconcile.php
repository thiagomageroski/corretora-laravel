<?php

namespace App\Console\Commands;

use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

#[Signature('wallet:reconcile')]
#[Description('Verify that every wallet ledger has an unbroken sequence and consistent running balances')]
class WalletReconcile extends Command
{
    public function handle(): int
    {
        $broken = 0;

        Wallet::query()->select('id')->chunkById(500, function ($wallets) use (&$broken): void {
            foreach ($wallets as $wallet) {
                $problem = $this->findProblem($wallet->id);

                if ($problem !== null) {
                    $broken++;
                    Log::critical('Ledger inconsistency', ['wallet_id' => $wallet->id, 'problem' => $problem]);
                    $this->error("Wallet {$wallet->id}: {$problem}");
                }
            }
        });

        if ($broken > 0) {
            return self::FAILURE;
        }

        $this->info('All ledgers are consistent.');

        return self::SUCCESS;
    }

    private function findProblem(int $walletId): ?string
    {
        $expectedSeq = 1;
        $available = 0;
        $reserved = 0;

        foreach (WalletTransaction::query()->where('wallet_id', $walletId)->orderBy('seq')->cursor() as $entry) {
            $available += $entry->available_delta_cents;
            $reserved += $entry->reserved_delta_cents;

            if ($entry->seq !== $expectedSeq) {
                return "expected seq {$expectedSeq}, found {$entry->seq}";
            }

            if ($entry->available_after_cents !== $available || $entry->reserved_after_cents !== $reserved) {
                return "running balance mismatch at seq {$entry->seq}";
            }

            $expectedSeq++;
        }

        return null;
    }
}
