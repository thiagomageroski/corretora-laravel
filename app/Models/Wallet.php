<?php

namespace App\Models;

use App\Domain\Wallet\Balance;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A wallet holds no balance of its own: the balance is the state left by the
 * latest entry of its append-only ledger.
 */
#[Fillable(['account_id', 'currency'])]
class Wallet extends Model
{
    /**
     * @return BelongsTo<Account, $this>
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /**
     * @return HasMany<WalletTransaction, $this>
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(WalletTransaction::class);
    }

    public function balance(): Balance
    {
        $latest = $this->transactions()->orderByDesc('seq')->first();

        return new Balance(
            availableCents: $latest?->available_after_cents ?? 0,
            reservedCents: $latest?->reserved_after_cents ?? 0,
        );
    }
}
