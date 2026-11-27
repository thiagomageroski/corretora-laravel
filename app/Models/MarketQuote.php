<?php

namespace App\Models;

use App\Enums\QuoteDelivery;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'asset_id', 'price', 'open_24h', 'high_24h', 'low_24h', 'volume_24h',
    'source', 'delivery', 'source_at', 'received_at',
])]
class MarketQuote extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'delivery' => QuoteDelivery::class,
            'source_at' => 'immutable_datetime',
            'received_at' => 'immutable_datetime',
        ];
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }
}
