<?php

namespace App\Http\Resources;

use App\Models\TradingPosition;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin TradingPosition
 */
class PositionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'asset_id' => $this->asset_id,
            'symbol' => $this->asset?->symbol,
            'direction' => $this->direction->value,
            'stake_cents' => $this->stake_cents,
            'payout_rate_bps' => $this->payout_rate_bps,
            'entry_price' => $this->entry_price,
            'entry_source' => $this->entry_source,
            'opened_at' => $this->opened_at->toIso8601ZuluString('millisecond'),
            'expires_at' => $this->expires_at->toIso8601ZuluString(),
            'close_price' => $this->close_price,
            'close_source' => $this->close_source,
            'close_source_at' => $this->close_source_at?->toIso8601ZuluString('millisecond'),
            'result' => $this->result?->value,
            'void_reason' => $this->void_reason,
            'returned_cents' => $this->returned_cents,
            'result_cents' => $this->resultCents(),
            'settled_at' => $this->settled_at?->toIso8601ZuluString('millisecond'),
            'rules_version' => $this->rules_version,
        ];
    }
}
