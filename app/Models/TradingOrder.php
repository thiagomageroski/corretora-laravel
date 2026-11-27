<?php

namespace App\Models;

use App\Enums\OrderStatus;
use App\Enums\TradeDirection;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'user_id', 'wallet_id', 'asset_id', 'direction', 'stake_cents', 'duration_seconds',
    'status', 'reject_reason', 'idempotency_key',
])]
class TradingOrder extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'direction' => TradeDirection::class,
            'status' => OrderStatus::class,
            'stake_cents' => 'integer',
            'duration_seconds' => 'integer',
        ];
    }

    /**
     * @return HasOne<TradingPosition, $this>
     */
    public function position(): HasOne
    {
        return $this->hasOne(TradingPosition::class, 'order_id');
    }
}
