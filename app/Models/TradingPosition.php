<?php

namespace App\Models;

use App\Enums\Environment;
use App\Enums\TradeDirection;
use App\Enums\TradeResult;
use Illuminate\Database\Eloquent\Attributes\DateFormat;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'order_id', 'user_id', 'wallet_id', 'asset_id', 'direction', 'stake_cents',
    'payout_rate_bps', 'rules_version', 'entry_price', 'entry_source', 'entry_source_at',
    'opened_at', 'expires_at', 'close_price', 'close_source', 'close_source_at',
    'result', 'returned_cents', 'void_reason', 'settled_at',
])]
#[DateFormat('Y-m-d H:i:s.v')]
class TradingPosition extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'direction' => TradeDirection::class,
            'result' => TradeResult::class,
            'stake_cents' => 'integer',
            'payout_rate_bps' => 'integer',
            'returned_cents' => 'integer',
            'entry_source_at' => 'immutable_datetime',
            'opened_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'close_source_at' => 'immutable_datetime',
            'settled_at' => 'immutable_datetime',
        ];
    }

    /**
     * @param  Builder<TradingPosition>  $query
     */
    #[Scope]
    protected function open(Builder $query): void
    {
        $query->whereNull('result');
    }

    /**
     * @param  Builder<TradingPosition>  $query
     */
    #[Scope]
    protected function closed(Builder $query): void
    {
        $query->whereNotNull('result');
    }

    /**
     * Positions of the demo or the real wallet, which are never mixed in lists or totals.
     *
     * @param  Builder<TradingPosition>  $query
     */
    #[Scope]
    protected function inEnvironment(Builder $query, Environment $environment): void
    {
        $query->whereIn('wallet_id', Wallet::query()
            ->select('wallets.id')
            ->join('accounts', 'accounts.id', '=', 'wallets.account_id')
            ->where('accounts.environment', $environment->value));
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    /**
     * @return BelongsTo<Wallet, $this>
     */
    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<TradingExecution, $this>
     */
    public function executions(): HasMany
    {
        return $this->hasMany(TradingExecution::class, 'position_id');
    }

    /**
     * Profit or loss in cents; null while the position is open.
     */
    public function resultCents(): ?int
    {
        return $this->returned_cents === null ? null : $this->returned_cents - $this->stake_cents;
    }
}
