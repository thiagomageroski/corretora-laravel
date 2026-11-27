<?php

namespace Database\Factories;

use App\Models\Asset;
use App\Models\AssetCategory;
use App\Models\MarketQuote;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Asset>
 */
class AssetFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $code = strtoupper(fake()->unique()->lexify('???'));

        return [
            'asset_category_id' => AssetCategory::query()->firstOrCreate(['code' => 'crypto'], ['name' => 'Criptomoedas'])->id,
            'symbol' => "{$code}/USD",
            'name' => "Test {$code}",
            'provider_code' => 'binance',
            'provider_symbol' => "{$code}USDT",
            'price_basis' => 'USDT',
            'session' => 'always',
            'payout_rate_bps' => 8500,
            'is_active' => true,
        ];
    }

    /**
     * An asset with no data source configured.
     */
    public function withoutProvider(): static
    {
        return $this->state(['provider_code' => null, 'provider_symbol' => null]);
    }

    /**
     * Attach a quote received just now.
     */
    public function withQuote(string $price = '100.0000000000'): static
    {
        return $this->afterCreating(function (Asset $asset) use ($price): void {
            MarketQuote::query()->create([
                'asset_id' => $asset->id,
                'price' => $price,
                'open_24h' => $price,
                'source' => (string) $asset->provider_code,
                'delivery' => 'stream',
                'source_at' => now('UTC'),
                'received_at' => now('UTC'),
            ]);
        });
    }
}
