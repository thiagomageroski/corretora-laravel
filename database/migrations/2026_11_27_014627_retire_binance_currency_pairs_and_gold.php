<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Takes the currency pairs and gold tokens traded on Binance back out of the
 * catalog, leaving only crypto on that provider. Pairs nobody traded are
 * deleted. Pairs with trades are switched off instead, so their history stays
 * and any trade still open settles normally; without a delisting date the
 * daily catalog sync leaves them off.
 */
return new class extends Migration
{
    private const SYMBOLS = ['EUR/USDT', 'USDT/BRL', 'USDT/TRY', 'USDT/MXN', 'USDT/ARS', 'USDT/ZAR', 'USDT/COP', 'USDT/IDR', 'XAUT/USD', 'PAXG/USD'];

    public function up(): void
    {
        $assets = DB::table('assets')->whereIn('symbol', self::SYMBOLS)->pluck('id');

        foreach ($assets as $assetId) {
            $traded = DB::table('trading_orders')->where('asset_id', $assetId)->exists()
                || DB::table('trading_positions')->where('asset_id', $assetId)->exists();

            if ($traded) {
                DB::table('assets')->where('id', $assetId)->update(['is_active' => false, 'delisted_at' => null, 'updated_at' => now()]);

                continue;
            }

            // Favorites and views go with the asset (cascade); quotes and candles must go first.
            DB::table('market_quotes')->where('asset_id', $assetId)->delete();
            DB::table('market_candles')->where('asset_id', $assetId)->delete();
            DB::table('assets')->where('id', $assetId)->delete();
        }
    }

    public function down(): void
    {
        // Deleted pairs are not recreated: the catalog no longer lists them.
    }
};
