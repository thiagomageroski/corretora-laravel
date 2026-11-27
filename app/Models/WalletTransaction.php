<?php

namespace App\Models;

use App\Enums\LedgerEntryType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use LogicException;

#[Fillable([
    'wallet_id', 'seq', 'type', 'available_delta_cents', 'reserved_delta_cents',
    'available_after_cents', 'reserved_after_cents', 'idempotency_key',
    'reference_type', 'reference_id', 'actor_id', 'reason', 'created_at',
])]
class WalletTransaction extends Model
{
    public const UPDATED_AT = null;

    protected static function booted(): void
    {
        $forbid = fn () => throw new LogicException('Ledger entries are immutable.');

        static::updating($forbid);
        static::deleting($forbid);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => LedgerEntryType::class,
            'seq' => 'integer',
            'available_delta_cents' => 'integer',
            'reserved_delta_cents' => 'integer',
            'available_after_cents' => 'integer',
            'reserved_after_cents' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Wallet, $this>
     */
    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function reference(): MorphTo
    {
        return $this->morphTo();
    }
}
