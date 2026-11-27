<?php

namespace App\Models;

use App\Enums\DepositStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A PIX charge for the real wallet. It only turns into balance after the
 * provider itself confirms payment; see App\Domain\Payments\DepositService.
 */
#[Fillable([
    'user_id', 'wallet_id', 'amount_cents', 'currency', 'status', 'provider',
    'provider_transaction_id', 'provider_status', 'webhook_token_hash', 'pix_code',
    'pix_image_url', 'fee_cents', 'review_reason', 'failure_reason', 'idempotency_key',
    'expires_at', 'paid_at', 'credited_at', 'reversed_at', 'last_checked_at',
])]
#[Hidden(['webhook_token_hash'])]
class Deposit extends Model
{
    use HasUlids;

    /**
     * @return list<string>
     */
    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => DepositStatus::class,
            'amount_cents' => 'integer',
            'fee_cents' => 'integer',
            'expires_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'credited_at' => 'immutable_datetime',
            'reversed_at' => 'immutable_datetime',
            'last_checked_at' => 'immutable_datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Wallet, $this>
     */
    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
