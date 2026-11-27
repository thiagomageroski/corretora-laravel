<?php

namespace App\Models;

use App\Enums\WithdrawalStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A PIX payout from the real wallet. It is only marked completed when the
 * provider reports the transfer as completed.
 */
#[Fillable([
    'user_id', 'wallet_id', 'amount_cents', 'currency', 'status', 'pix_key_type', 'pix_key',
    'requested_ip', 'provider', 'provider_transfer_id', 'provider_status', 'webhook_token_hash',
    'fee_cents', 'received_cents', 'end_to_end_id', 'failure_reason', 'reviewed_by', 'review_note',
    'idempotency_key', 'approved_at', 'sent_at', 'completed_at', 'failed_at', 'last_checked_at',
])]
#[Hidden(['webhook_token_hash', 'pix_key'])]
class Withdrawal extends Model
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
            'status' => WithdrawalStatus::class,
            'pix_key' => 'encrypted',
            'amount_cents' => 'integer',
            'fee_cents' => 'integer',
            'received_cents' => 'integer',
            'approved_at' => 'immutable_datetime',
            'sent_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'failed_at' => 'immutable_datetime',
            'last_checked_at' => 'immutable_datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * The key with most characters hidden, safe to show back to the user.
     */
    public function maskedPixKey(): string
    {
        $key = (string) $this->pix_key;
        $length = mb_strlen($key);
        $visible = $length > 8 ? 4 : min(2, $length);

        return str_repeat('•', max($length - $visible, 3)).mb_substr($key, $length - $visible);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The administrator who approved or rejected the request.
     *
     * @return BelongsTo<User, $this>
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /**
     * @return BelongsTo<Wallet, $this>
     */
    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
