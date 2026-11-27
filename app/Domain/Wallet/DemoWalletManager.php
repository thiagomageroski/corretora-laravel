<?php

namespace App\Domain\Wallet;

use App\Domain\Audit\AuditLogger;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Models\Account;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DemoWalletManager
{
    public function __construct(
        private LedgerService $ledger,
        private AuditLogger $audit,
    ) {}

    public function provisionFor(User $user): Wallet
    {
        return DB::transaction(function () use ($user) {
            $account = Account::query()->firstOrCreate(
                ['user_id' => $user->id, 'environment' => Environment::Demo],
            );
            $wallet = Wallet::query()->firstOrCreate(
                ['account_id' => $account->id],
                ['currency' => config('platform.demo.currency')],
            );

            $this->ledger->post(
                wallet: $wallet,
                type: LedgerEntryType::DemoGrant,
                availableDeltaCents: (int) config('platform.demo.initial_balance_cents'),
                reservedDeltaCents: 0,
                idempotencyKey: 'demo-grant',
                reason: 'Saldo virtual inicial',
            );

            return $wallet;
        });
    }

    /**
     * Set the virtual balance to the given amount, or to the initial one. History
     * stays intact: a reset is one more ledger entry.
     */
    public function reset(User $user, ?int $amountCents = null): WalletTransaction
    {
        $targetCents = $amountCents ?? (int) config('platform.demo.initial_balance_cents');

        return DB::transaction(function () use ($user, $targetCents) {
            $wallet = $user->demoWallet();
            Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();

            $balance = $wallet->balance();

            if ($balance->reservedCents > 0) {
                throw new OpenPositionsBlockReset('Encerre as operações abertas antes de reiniciar o saldo.');
            }

            $entry = $this->ledger->post(
                wallet: $wallet,
                type: LedgerEntryType::DemoReset,
                availableDeltaCents: $targetCents - $balance->availableCents,
                reservedDeltaCents: 0,
                idempotencyKey: 'demo-reset:'.Str::uuid()->toString(),
                actorId: $user->id,
                reason: 'Reinício solicitado pelo usuário',
            );

            $this->audit->record('wallet.demo_reset', $wallet, $user->id, ['entry_id' => $entry->id]);

            return $entry;
        });
    }
}
