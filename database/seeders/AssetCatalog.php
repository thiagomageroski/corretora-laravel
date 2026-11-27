<?php

namespace Database\Seeders;

/**
 * Instrument metadata only: names and symbols, never prices. Provider mappings
 * marked null have no confirmed data source yet, so those assets show as
 * unavailable until an administrator configures one.
 */
final class AssetCatalog
{
    /**
     * @return array<string, string>
     */
    public static function categories(): array
    {
        return [
            'forex' => 'Forex',
            'crypto' => 'Criptomoedas',
            'stocks' => 'Ações',
            'indices' => 'Índices',
            'commodities' => 'Commodities',
            'etfs' => 'ETFs',
        ];
    }

    /**
     * @return list<array{category: string, symbol: string, name: string, provider_code: ?string, provider_symbol: ?string, price_basis: ?string, session: string}>
     */
    public static function assets(): array
    {
        return [
            ...self::forex(),
            ...self::crypto(),
            ...self::stocks(),
            ...self::indices(),
            ...self::commodities(),
            ...self::etfs(),
        ];
    }

    /**
     * @return list<array<string, ?string>>
     */
    private static function forex(): array
    {
        $names = [
            'EUR' => 'Euro', 'USD' => 'Dólar americano', 'GBP' => 'Libra esterlina', 'JPY' => 'Iene japonês',
            'CHF' => 'Franco suíço', 'AUD' => 'Dólar australiano', 'CAD' => 'Dólar canadense', 'NZD' => 'Dólar neozelandês',
            'BRL' => 'Real brasileiro', 'MXN' => 'Peso mexicano', 'ZAR' => 'Rand sul-africano', 'TRY' => 'Lira turca',
            'SEK' => 'Coroa sueca', 'NOK' => 'Coroa norueguesa', 'DKK' => 'Coroa dinamarquesa', 'PLN' => 'Zlóti polonês',
            'SGD' => 'Dólar de Singapura', 'HKD' => 'Dólar de Hong Kong', 'CZK' => 'Coroa tcheca', 'HUF' => 'Florim húngaro',
            'INR' => 'Rupia indiana', 'CNH' => 'Yuan offshore', 'THB' => 'Baht tailandês',
        ];

        $pairs = [
            'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
            'EUR/CHF', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY', 'NZD/JPY', 'EUR/AUD', 'GBP/AUD', 'EUR/CAD', 'GBP/CAD', 'AUD/CAD',
            'AUD/NZD', 'GBP/NZD', 'USD/BRL', 'EUR/BRL', 'GBP/BRL', 'EUR/NZD', 'GBP/CHF', 'AUD/CHF', 'CAD/CHF', 'NZD/CHF',
            'NZD/CAD', 'USD/MXN', 'EUR/MXN', 'USD/ZAR', 'EUR/ZAR', 'GBP/ZAR', 'USD/TRY', 'EUR/TRY', 'USD/SEK', 'EUR/SEK',
            'USD/NOK', 'EUR/NOK', 'USD/DKK', 'EUR/DKK', 'USD/PLN', 'EUR/PLN', 'GBP/PLN', 'USD/SGD', 'EUR/SGD', 'GBP/SGD',
            'AUD/SGD', 'USD/HKD', 'EUR/HKD', 'USD/CZK', 'EUR/CZK', 'USD/HUF', 'EUR/HUF', 'USD/INR', 'USD/CNH', 'EUR/CNH',
            'USD/THB', 'SGD/JPY',
        ];

        return array_map(function (string $pair) use ($names): array {
            [$base, $quote] = explode('/', $pair);

            return self::row('forex', $pair, "{$names[$base]} / {$names[$quote]}", 'twelvedata', $pair, null, 'fx');
        }, $pairs);
    }

    /**
     * Binance lists these against USDT, not USD; price_basis makes that visible.
     * Availability was checked against the exchange listing on 2026-11-06 and is
     * kept current by market:sync-catalog.
     *
     * @return list<array<string, ?string>>
     */
    private static function crypto(): array
    {
        $coins = [
            'BTC' => 'Bitcoin', 'ETH' => 'Ethereum', 'BNB' => 'BNB', 'SOL' => 'Solana', 'XRP' => 'XRP', 'ADA' => 'Cardano',
            'DOGE' => 'Dogecoin', 'TRX' => 'TRON', 'AVAX' => 'Avalanche', 'DOT' => 'Polkadot', 'LINK' => 'Chainlink',
            'LTC' => 'Litecoin', 'BCH' => 'Bitcoin Cash', 'NEAR' => 'NEAR Protocol', 'UNI' => 'Uniswap', 'ATOM' => 'Cosmos',
            'ETC' => 'Ethereum Classic', 'APT' => 'Aptos', 'ARB' => 'Arbitrum', 'OP' => 'Optimism', 'POL' => 'Polygon',
            'SHIB' => 'Shiba Inu', 'PEPE' => 'Pepe', 'FIL' => 'Filecoin', 'ICP' => 'Internet Computer', 'HBAR' => 'Hedera',
            'VET' => 'VeChain', 'ALGO' => 'Algorand', 'XLM' => 'Stellar', 'AAVE' => 'Aave', 'SUI' => 'Sui',
            'INJ' => 'Injective', 'TIA' => 'Celestia', 'SEI' => 'Sei', 'RUNE' => 'THORChain', 'SAND' => 'The Sandbox',
            'MANA' => 'Decentraland', 'AXS' => 'Axie Infinity', 'GRT' => 'The Graph', 'CRV' => 'Curve DAO', 'SNX' => 'Synthetix',
            'COMP' => 'Compound', 'LDO' => 'Lido DAO', 'EGLD' => 'MultiversX', 'THETA' => 'Theta Network', 'XTZ' => 'Tezos',
            'KAVA' => 'Kava', 'FET' => 'Artificial Superintelligence Alliance', 'RENDER' => 'Render', 'IMX' => 'Immutable',
            'STX' => 'Stacks', 'WLD' => 'Worldcoin', 'JUP' => 'Jupiter', 'ENA' => 'Ethena', 'GALA' => 'Gala',
            'CHZ' => 'Chiliz', 'ZEC' => 'Zcash', 'DASH' => 'Dash', 'NEO' => 'NEO', 'QTUM' => 'Qtum',
        ];

        $rows = [];
        foreach ($coins as $code => $name) {
            $rows[] = self::row('crypto', "{$code}/USD", $name, 'binance', "{$code}USDT", 'USDT', 'always');
        }

        return $rows;
    }

    /**
     * @return list<array<string, ?string>>
     */
    private static function stocks(): array
    {
        $companies = [
            'AAPL' => 'Apple', 'MSFT' => 'Microsoft', 'NVDA' => 'NVIDIA', 'AMZN' => 'Amazon', 'GOOGL' => 'Alphabet (Google)',
            'META' => 'Meta Platforms', 'TSLA' => 'Tesla', 'NFLX' => 'Netflix', 'AMD' => 'Advanced Micro Devices', 'INTC' => 'Intel',
            'COIN' => 'Coinbase', 'PYPL' => 'PayPal', 'UBER' => 'Uber', 'DIS' => 'Walt Disney', 'WMT' => 'Walmart',
            'KO' => 'Coca-Cola', 'MCD' => "McDonald's", 'V' => 'Visa', 'MA' => 'Mastercard', 'BRK.B' => 'Berkshire Hathaway',
            'JPM' => 'JPMorgan Chase', 'BAC' => 'Bank of America', 'WFC' => 'Wells Fargo', 'C' => 'Citigroup', 'GS' => 'Goldman Sachs',
            'MS' => 'Morgan Stanley', 'AXP' => 'American Express', 'BLK' => 'BlackRock', 'SCHW' => 'Charles Schwab', 'USB' => 'U.S. Bancorp',
            'JNJ' => 'Johnson & Johnson', 'PFE' => 'Pfizer', 'MRK' => 'Merck', 'ABBV' => 'AbbVie', 'LLY' => 'Eli Lilly',
            'UNH' => 'UnitedHealth', 'TMO' => 'Thermo Fisher', 'ABT' => 'Abbott', 'BMY' => 'Bristol-Myers Squibb', 'AMGN' => 'Amgen',
            'GILD' => 'Gilead Sciences', 'CVS' => 'CVS Health', 'MDT' => 'Medtronic', 'ORCL' => 'Oracle', 'CRM' => 'Salesforce',
            'ADBE' => 'Adobe', 'CSCO' => 'Cisco', 'IBM' => 'IBM', 'QCOM' => 'Qualcomm', 'TXN' => 'Texas Instruments',
            'AVGO' => 'Broadcom', 'MU' => 'Micron', 'AMAT' => 'Applied Materials', 'LRCX' => 'Lam Research', 'NOW' => 'ServiceNow',
            'INTU' => 'Intuit', 'SHOP' => 'Shopify', 'SQ' => 'Block', 'SNOW' => 'Snowflake', 'PLTR' => 'Palantir',
            'ABNB' => 'Airbnb', 'LYFT' => 'Lyft', 'SNAP' => 'Snap', 'PINS' => 'Pinterest', 'SPOT' => 'Spotify',
            'RBLX' => 'Roblox', 'EA' => 'Electronic Arts', 'TTWO' => 'Take-Two Interactive', 'SONY' => 'Sony', 'BABA' => 'Alibaba',
            'JD' => 'JD.com', 'PDD' => 'PDD Holdings', 'NIO' => 'NIO', 'TSM' => 'Taiwan Semiconductor', 'ASML' => 'ASML',
            'SAP' => 'SAP', 'TM' => 'Toyota', 'HMC' => 'Honda', 'F' => 'Ford', 'GM' => 'General Motors',
            'RIVN' => 'Rivian', 'LCID' => 'Lucid', 'BA' => 'Boeing', 'LMT' => 'Lockheed Martin', 'RTX' => 'RTX',
            'GE' => 'GE Aerospace', 'CAT' => 'Caterpillar', 'DE' => 'Deere', 'HON' => 'Honeywell', 'MMM' => '3M',
            'UPS' => 'UPS', 'FDX' => 'FedEx', 'XOM' => 'Exxon Mobil', 'CVX' => 'Chevron', 'COP' => 'ConocoPhillips',
            'SLB' => 'Schlumberger', 'PG' => 'Procter & Gamble', 'PEP' => 'PepsiCo', 'COST' => 'Costco', 'TGT' => 'Target',
            'HD' => 'Home Depot', 'LOW' => "Lowe's", 'NKE' => 'Nike', 'SBUX' => 'Starbucks', 'T' => 'AT&T',
            'VZ' => 'Verizon', 'TMUS' => 'T-Mobile US', 'CMCSA' => 'Comcast', 'PBR' => 'Petrobras (ADR)', 'VALE' => 'Vale (ADR)',
            'ITUB' => 'Itaú Unibanco (ADR)', 'BBD' => 'Bradesco (ADR)', 'NU' => 'Nu Holdings', 'MELI' => 'MercadoLibre',
        ];

        $rows = [];
        foreach ($companies as $ticker => $name) {
            $rows[] = self::row('stocks', $ticker, $name, 'twelvedata', $ticker, 'USD', 'us_equities');
        }

        return $rows;
    }

    /**
     * @return list<array<string, ?string>>
     */
    private static function indices(): array
    {
        $indices = [
            ['SPX', 'S&P 500', 'us_equities'], ['NDX', 'NASDAQ 100', 'us_equities'], ['DJI', 'Dow Jones', 'us_equities'],
            ['DAX', 'DAX 40', 'eu_equities'], ['UKX', 'FTSE 100', 'uk_equities'], ['PX1', 'CAC 40', 'eu_equities'],
            ['N225', 'Nikkei 225', 'jp_equities'], ['IBOV', 'IBOVESPA', 'br_equities'], ['RUT', 'Russell 2000', 'us_equities'],
            ['SX5E', 'Euro Stoxx 50', 'eu_equities'],
        ];

        return array_map(fn (array $index): array => self::row('indices', $index[0], $index[1], null, null, null, $index[2]), $indices);
    }

    /**
     * @return list<array<string, ?string>>
     */
    private static function commodities(): array
    {
        $commodities = [
            'XAU/USD' => 'Ouro', 'XAG/USD' => 'Prata', 'WTI' => 'Petróleo WTI', 'BRENT' => 'Petróleo Brent', 'NATGAS' => 'Gás natural',
            'COPPER' => 'Cobre', 'XPT/USD' => 'Platina', 'XPD/USD' => 'Paládio', 'COFFEE' => 'Café', 'SUGAR' => 'Açúcar',
            'CORN' => 'Milho', 'SOYBEAN' => 'Soja', 'WHEAT' => 'Trigo',
        ];

        $rows = [];
        foreach ($commodities as $symbol => $name) {
            $rows[] = self::row('commodities', $symbol, $name, null, null, null, 'commodities');
        }

        return $rows;
    }

    /**
     * @return list<array<string, ?string>>
     */
    private static function etfs(): array
    {
        $etfs = [
            'SPY' => 'SPDR S&P 500', 'QQQ' => 'Invesco QQQ', 'DIA' => 'SPDR Dow Jones', 'IWM' => 'iShares Russell 2000',
            'VTI' => 'Vanguard Total Stock Market', 'VOO' => 'Vanguard S&P 500', 'GLD' => 'SPDR Gold Shares', 'SLV' => 'iShares Silver Trust',
            'ARKK' => 'ARK Innovation', 'XLF' => 'Financial Select Sector SPDR',
        ];

        $rows = [];
        foreach ($etfs as $ticker => $name) {
            $rows[] = self::row('etfs', $ticker, $name, 'twelvedata', $ticker, 'USD', 'us_equities');
        }

        return $rows;
    }

    /**
     * @return array<string, ?string>
     */
    private static function row(string $category, string $symbol, string $name, ?string $providerCode, ?string $providerSymbol, ?string $priceBasis, string $session): array
    {
        return [
            'category' => $category,
            'symbol' => $symbol,
            'name' => $name,
            'provider_code' => $providerCode,
            'provider_symbol' => $providerSymbol,
            'price_basis' => $priceBasis,
            'session' => $session,
        ];
    }
}
