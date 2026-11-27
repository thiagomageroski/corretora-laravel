<?php

namespace App\Http\Resources;

use App\Domain\Market\MarketHours;
use App\Domain\Market\ProviderRegistry;
use App\Models\Asset;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Asset
 */
class AssetResource extends JsonResource
{
    private const LIVE_MAX_AGE_SECONDS = 15;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $now = CarbonImmutable::now('UTC');
        $quote = $this->quote;
        $provider = app(ProviderRegistry::class)->find($this->provider_code);
        $hours = app(MarketHours::class);

        $change = $quote?->open_24h !== null && (float) $quote->open_24h > 0
            ? round(((float) $quote->price - (float) $quote->open_24h) / (float) $quote->open_24h * 100, 2)
            : null;

        return [
            'id' => $this->id,
            'symbol' => $this->symbol,
            'name' => $this->name,
            'category' => $this->category?->code,
            'category_name' => $this->category?->name,
            'price_basis' => $this->price_basis,
            'session_label' => $hours->label($this->session),
            'market_open' => $hours->isOpen($this->session, $now),
            'payout_rate_bps' => $this->payout_rate_bps,
            'tradable' => $this->is_active && $provider !== null && $provider->isConfigured() && $provider->supportsSimulatedTrading(),
            'provider' => $provider?->code(),
            'provider_configured' => $provider?->isConfigured() ?? false,
            'data_status' => match (true) {
                $quote === null => 'unavailable',
                $quote->received_at->diffInSeconds($now) <= self::LIVE_MAX_AGE_SECONDS => 'live',
                default => 'delayed',
            },
            'quote' => $quote === null ? null : [
                'price' => $quote->price,
                'open_24h' => $quote->open_24h,
                'high_24h' => $quote->high_24h,
                'low_24h' => $quote->low_24h,
                'volume_24h' => $quote->volume_24h,
                'change_percent' => $change,
                'source' => $quote->source,
                'source_at' => $quote->source_at->toIso8601ZuluString(),
            ],
            'is_favorite' => $this->when(isset($this->favorited_by_user), fn (): bool => (bool) $this->favorited_by_user),
        ];
    }
}
