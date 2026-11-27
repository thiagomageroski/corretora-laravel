<?php

namespace Database\Seeders;

use App\Models\Asset;
use App\Models\AssetCategory;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the catalog. Safe to rerun: existing rows are updated, not duplicated,
     * and activation changes made later are preserved.
     */
    public function run(): void
    {
        $sort = 0;
        $categoryIds = [];

        foreach (AssetCatalog::categories() as $code => $name) {
            $categoryIds[$code] = AssetCategory::query()->updateOrCreate(
                ['code' => $code],
                ['name' => $name, 'sort' => ++$sort],
            )->id;
        }

        foreach (AssetCatalog::assets() as $asset) {
            Asset::query()->updateOrCreate(
                ['symbol' => $asset['symbol']],
                [
                    'asset_category_id' => $categoryIds[$asset['category']],
                    'name' => $asset['name'],
                    'provider_code' => $asset['provider_code'],
                    'provider_symbol' => $asset['provider_symbol'],
                    'price_basis' => $asset['price_basis'],
                    'session' => $asset['session'],
                    'payout_rate_bps' => (int) config('platform.trading.default_payout_bps'),
                ],
            );
        }
    }
}
