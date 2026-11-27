<?php

namespace App\Http\Resources;

use App\Enums\DepositStatus;
use App\Models\Deposit;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Deposit
 */
class DepositResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $payable = $this->status === DepositStatus::Pending && $this->pix_code !== null && ($this->expires_at === null || $this->expires_at->isFuture());

        return [
            'id' => $this->public_id,
            'amount_cents' => $this->amount_cents,
            'status' => $this->status->value,
            'review_reason' => $this->review_reason,
            'failure_reason' => $this->failure_reason,
            'pix_code' => $payable ? $this->pix_code : null,
            'pix_qr_svg' => $payable ? $this->qrSvg((string) $this->pix_code) : null,
            'expires_at' => $this->expires_at?->toIso8601ZuluString(),
            'paid_at' => $this->paid_at?->toIso8601ZuluString(),
            'credited_at' => $this->credited_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
        ];
    }

    /**
     * Rendered here from the copy-and-paste code, as the provider recommends.
     */
    private function qrSvg(string $code): string
    {
        $writer = new Writer(new ImageRenderer(new RendererStyle(240, 1), new SvgImageBackEnd));

        return trim((string) preg_replace('/^<\?xml.*?\?>/', '', $writer->writeString($code)));
    }
}
