<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the currencies Binance trades against the USDT digital dollar (EUR,
 * BRL, TRY, MXN, ARS, ZAR, COP, IDR) and the two gold tokens to a running
 * catalog. They share the crypto feed, so they can be traded with real money
 * around the clock. Taken out again by 2026_11_27_014627; the seeder no longer
 * lists them, so a fresh install never has them.
 */
return new class extends Migration
{
    /**
     * The rows as they were added. Retired again by 2026_11_27_014627.
     *
     * @var list<array{category: string, symbol: string, name: string, provider_code: string, provider_symbol: string, price_basis: string, session: string}>
     */
    private const ASSETS = [
        ['category' => 'forex', 'symbol' => 'EUR/USDT', 'name' => 'Euro / Dólar digital (USDT)', 'provider_code' => 'binance', 'provider_symbol' => 'EURUSDT', 'price_basis' => 'USDT', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/BRL', 'name' => 'Dólar digital (USDT) / Real brasileiro', 'provider_code' => 'binance', 'provider_symbol' => 'USDTBRL', 'price_basis' => 'BRL', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/TRY', 'name' => 'Dólar digital (USDT) / Lira turca', 'provider_code' => 'binance', 'provider_symbol' => 'USDTTRY', 'price_basis' => 'TRY', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/MXN', 'name' => 'Dólar digital (USDT) / Peso mexicano', 'provider_code' => 'binance', 'provider_symbol' => 'USDTMXN', 'price_basis' => 'MXN', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/ARS', 'name' => 'Dólar digital (USDT) / Peso argentino', 'provider_code' => 'binance', 'provider_symbol' => 'USDTARS', 'price_basis' => 'ARS', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/ZAR', 'name' => 'Dólar digital (USDT) / Rand sul-africano', 'provider_code' => 'binance', 'provider_symbol' => 'USDTZAR', 'price_basis' => 'ZAR', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/COP', 'name' => 'Dólar digital (USDT) / Peso colombiano', 'provider_code' => 'binance', 'provider_symbol' => 'USDTCOP', 'price_basis' => 'COP', 'session' => 'always'],
        ['category' => 'forex', 'symbol' => 'USDT/IDR', 'name' => 'Dólar digital (USDT) / Rupia indonésia', 'provider_code' => 'binance', 'provider_symbol' => 'USDTIDR', 'price_basis' => 'IDR', 'session' => 'always'],
        ['category' => 'commodities', 'symbol' => 'XAUT/USD', 'name' => 'Ouro (Tether Gold)', 'provider_code' => 'binance', 'provider_symbol' => 'XAUTUSDT', 'price_basis' => 'USDT', 'session' => 'always'],
        ['category' => 'commodities', 'symbol' => 'PAXG/USD', 'name' => 'Ouro (PAX Gold)', 'provider_code' => 'binance', 'provider_symbol' => 'PAXGUSDT', 'price_basis' => 'USDT', 'session' => 'always'],
    ];

    public function up(): void
    {
        $categories = DB::table('asset_categories')->pluck('id', 'code');

        foreach (self::ASSETS as $asset) {
            $categoryId = $categories[$asset['category']] ?? null;

            // A database without the catalog (tests, a fresh install before seeding) has nothing to extend.
            if ($categoryId === null || DB::table('assets')->where('symbol', $asset['symbol'])->exists()) {
                continue;
            }

            DB::table('assets')->insert([
                'asset_category_id' => $categoryId,
                'symbol' => $asset['symbol'],
                'name' => $asset['name'],
                'provider_code' => $asset['provider_code'],
                'provider_symbol' => $asset['provider_symbol'],
                'price_basis' => $asset['price_basis'],
                'session' => $asset['session'],
                'payout_rate_bps' => (int) config('platform.trading.default_payout_bps'),
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        $symbols = array_column(self::ASSETS, 'symbol');
        $unused = DB::table('assets')
            ->whereIn('symbol', $symbols)
            ->whereNotExists(fn ($query) => $query->select(DB::raw(1))->from('trading_orders')->whereColumn('trading_orders.asset_id', 'assets.id'))
            ->whereNotExists(fn ($query) => $query->select(DB::raw(1))->from('trading_positions')->whereColumn('trading_positions.asset_id', 'assets.id'))
            ->pluck('id');

        // Assets that were traded stay: their orders, positions and statements point at them. Favorites and views cascade.
        DB::table('market_quotes')->whereIn('asset_id', $unused)->delete();
        DB::table('market_candles')->whereIn('asset_id', $unused)->delete();
        DB::table('assets')->whereIn('id', $unused)->delete();
    }
};
