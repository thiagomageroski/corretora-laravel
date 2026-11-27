<?php

namespace Tests\Feature;

use App\Domain\Wallet\InsufficientFunds;
use App\Domain\Wallet\LedgerService;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Models\Account;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class LedgerTest extends TestCase
{
    use RefreshDatabase;

    private function wallet(): Wallet
    {
        return User::factory()->withDemoWallet()->create()->demoWallet();
    }

    private function postEntry(Wallet $wallet, int $available, int $reserved, string $key): WalletTransaction
    {
        return app(LedgerService::class)->post($wallet, LedgerEntryType::PositionReserve, $available, $reserved, $key);
    }

    #[Test]
    public function balance_is_the_state_left_by_the_latest_entry(): void
    {
        $wallet = $this->wallet();

        $this->postEntry($wallet, -2_500, 2_500, 'a');

        $balance = $wallet->balance();
        $this->assertSame(1_000_000 - 2_500, $balance->availableCents);
        $this->assertSame(2_500, $balance->reservedCents);
    }

    #[Test]
    public function replaying_an_idempotency_key_does_not_move_money_twice(): void
    {
        $wallet = $this->wallet();

        $first = $this->postEntry($wallet, -1_000, 1_000, 'same-key');
        $second = $this->postEntry($wallet, -1_000, 1_000, 'same-key');

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1_000_000 - 1_000, $wallet->balance()->availableCents);
    }

    #[Test]
    public function reusing_a_key_with_different_amounts_is_refused(): void
    {
        $wallet = $this->wallet();
        $this->postEntry($wallet, -1_000, 1_000, 'same-key');

        $this->expectException(LogicException::class);
        $this->postEntry($wallet, -2_000, 2_000, 'same-key');
    }

    #[Test]
    public function a_movement_that_would_go_negative_is_refused(): void
    {
        $wallet = $this->wallet();

        $this->expectException(InsufficientFunds::class);
        $this->postEntry($wallet, -1_000_001, 1_000_001, 'too-much');
    }

    #[Test]
    public function the_database_rejects_a_negative_balance_even_without_the_service(): void
    {
        $wallet = $this->wallet();

        $this->expectException(QueryException::class);
        DB::table('wallet_transactions')->insert([
            'wallet_id' => $wallet->id,
            'seq' => 99,
            'type' => 'position_reserve',
            'available_delta_cents' => -1,
            'reserved_delta_cents' => 0,
            'available_after_cents' => -1,
            'reserved_after_cents' => 0,
            'idempotency_key' => 'raw',
            'created_at' => now(),
        ]);
    }

    #[Test]
    public function the_database_rejects_updating_a_ledger_entry(): void
    {
        $this->wallet();

        $this->expectException(QueryException::class);
        DB::table('wallet_transactions')->update(['available_after_cents' => 999_999_999]);
    }

    #[Test]
    public function the_database_rejects_deleting_a_ledger_entry(): void
    {
        $this->wallet();

        $this->expectException(QueryException::class);
        DB::table('wallet_transactions')->delete();
    }

    #[Test]
    public function the_model_refuses_to_change_a_saved_entry(): void
    {
        $entry = $this->wallet()->transactions()->firstOrFail();

        $this->expectException(LogicException::class);
        $entry->update(['reason' => 'changed']);
    }

    #[Test]
    public function real_wallets_cannot_move_money_while_real_mode_is_disabled(): void
    {
        $user = User::factory()->create();
        $account = Account::query()->create(['user_id' => $user->id, 'environment' => Environment::Real]);
        $wallet = Wallet::query()->create(['account_id' => $account->id, 'currency' => 'BRL']);

        $this->expectException(LogicException::class);
        $this->postEntry($wallet, 1_000, 0, 'real');
    }

    #[Test]
    public function deposit_entries_cannot_add_money_to_a_demo_wallet(): void
    {
        $this->expectException(LogicException::class);
        app(LedgerService::class)->post($this->wallet(), LedgerEntryType::DepositCredit, 1_000, 0, 'fake-deposit');
    }

    #[Test]
    public function demo_grants_cannot_add_money_to_a_real_wallet(): void
    {
        config(['platform.real_money_enabled' => true]);
        $user = User::factory()->withRealAccount()->create();

        $this->expectException(LogicException::class);
        app(LedgerService::class)->post($user->findRealWallet(), LedgerEntryType::DemoGrant, 1_000, 0, 'free-money');
    }

    #[Test]
    public function reconcile_passes_on_a_healthy_ledger(): void
    {
        $wallet = $this->wallet();
        $this->postEntry($wallet, -500, 500, 'a');

        $this->artisan('wallet:reconcile')->assertSuccessful();
    }
}
