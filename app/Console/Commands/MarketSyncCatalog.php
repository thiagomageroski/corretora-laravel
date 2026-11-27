<?php

namespace App\Console\Commands;

use App\Domain\Audit\AuditLogger;
use App\Domain\Market\Providers\BinanceProvider;
use App\Domain\Market\ProviderUnavailable;
use App\Models\Asset;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('market:sync-catalog')]
#[Description('Enable or disable Binance assets according to what the exchange currently lists')]
class MarketSyncCatalog extends Command
{
    public function handle(BinanceProvider $provider, AuditLogger $audit): int
    {
        try {
            $trading = $provider->tradingSymbols('USDT');
        } catch (ProviderUnavailable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        if ($trading === []) {
            $this->error('The provider returned an empty listing; leaving the catalog unchanged.');

            return self::FAILURE;
        }

        Asset::query()->where('provider_code', $provider->code())->get()->each(function (Asset $asset) use ($trading, $audit): void {
            $isListed = in_array($asset->provider_symbol, $trading, true);
            // A listed asset comes back only if this sync switched it off; one switched off by an administrator stays off.
            $changes = match (true) {
                $asset->is_active && ! $isListed => ['is_active' => false, 'delisted_at' => now()],
                ! $asset->is_active && $isListed && $asset->delisted_at !== null => ['is_active' => true, 'delisted_at' => null],
                default => null,
            };

            if ($changes !== null) {
                $asset->update($changes);
                $audit->record('catalog.availability_changed', $asset, context: ['is_active' => $isListed, 'origin' => 'provider_listing']);
                $this->line("{$asset->symbol}: ".($isListed ? 'enabled' : 'disabled'));
            }
        });

        $this->info('Catalog synchronized.');

        return self::SUCCESS;
    }
}
