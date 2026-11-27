<?php

namespace App\Http\Resources;

use App\Models\Withdrawal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Withdrawal
 */
class WithdrawalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->public_id,
            'amount_cents' => $this->amount_cents,
            'status' => $this->status->value,
            'pix_key_type' => $this->pix_key_type,
            'pix_key_masked' => $this->maskedPixKey(),
            'fee_cents' => $this->fee_cents,
            'received_cents' => $this->received_cents,
            'failure_reason' => $this->failure_reason,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'completed_at' => $this->completed_at?->toIso8601ZuluString(),
        ];
    }
}
