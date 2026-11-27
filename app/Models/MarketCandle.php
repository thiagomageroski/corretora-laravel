<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['asset_id', 'interval', 'open_time', 'open', 'high', 'low', 'close', 'volume', 'source'])]
class MarketCandle extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['open_time' => 'immutable_datetime'];
    }
}
