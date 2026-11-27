<?php

namespace App\Domain\Market;

use App\Domain\Market\Data\QuoteData;
use App\Domain\Market\Data\TradeData;
use App\Enums\QuoteDelivery;

/**
 * Merges two real feeds: individual trades give the price the moment it changes,
 * and the 24-hour ticker gives the daily open, range and volume. Quotes are then
 * drained separately for broadcasting and for storage, which run at different rates.
 */
class LiveQuoteAggregator
{
    private const QUANTITY_SCALE = 10;

    /** @var array<string, QuoteData> */
    private array $latest = [];

    /** @var array<string, true> */
    private array $pendingBroadcast = [];

    /** @var array<string, true> */
    private array $pendingStorage = [];

    /** @var array<string, string> */
    private array $tradedQuantity = [];

    public function applyQuote(QuoteData $quote): void
    {
        $current = $this->latest[$quote->providerSymbol] ?? null;
        $isNewer = $current === null || ! $quote->sourceAt->isBefore($current->sourceAt);

        $this->latest[$quote->providerSymbol] = new QuoteData(
            providerSymbol: $quote->providerSymbol,
            price: $isNewer ? $quote->price : $current->price,
            open: $quote->open,
            high: $quote->high,
            low: $quote->low,
            volume: $quote->volume,
            sourceAt: $isNewer ? $quote->sourceAt : $current->sourceAt,
            delivery: QuoteDelivery::Stream,
        );

        $this->markChanged($quote->providerSymbol);
    }

    /**
     * Trades before the first ticker are dropped, because there is no daily open
     * to go with them yet. A late trade still counts toward volume but cannot move
     * the price backwards.
     */
    public function applyTrade(TradeData $trade): void
    {
        $current = $this->latest[$trade->providerSymbol] ?? null;

        if ($current === null) {
            return;
        }

        $this->tradedQuantity[$trade->providerSymbol] = bcadd($this->tradedQuantity[$trade->providerSymbol] ?? '0', $trade->quantity, self::QUANTITY_SCALE);
        $this->pendingBroadcast[$trade->providerSymbol] = true;

        if ($trade->tradedAt->isBefore($current->sourceAt)) {
            return;
        }

        $this->latest[$trade->providerSymbol] = new QuoteData(
            providerSymbol: $trade->providerSymbol,
            price: $trade->price,
            open: $current->open,
            high: $current->high === null || bccomp($trade->price, $current->high, self::QUANTITY_SCALE) > 0 ? $trade->price : $current->high,
            low: $current->low === null || bccomp($trade->price, $current->low, self::QUANTITY_SCALE) < 0 ? $trade->price : $current->low,
            volume: $current->volume,
            sourceAt: $trade->tradedAt,
            delivery: QuoteDelivery::Stream,
        );

        $this->markChanged($trade->providerSymbol);
    }

    /**
     * @return list<array{quote: QuoteData, traded: string}> Changes since the last drain, with the quantity traded meanwhile.
     */
    public function drainForBroadcast(): array
    {
        $drained = [];

        foreach (array_keys($this->pendingBroadcast) as $symbol) {
            $drained[] = ['quote' => $this->latest[$symbol], 'traded' => $this->tradedQuantity[$symbol] ?? '0'];
        }

        $this->pendingBroadcast = [];
        $this->tradedQuantity = [];

        return $drained;
    }

    /**
     * @return list<QuoteData>
     */
    public function drainForStorage(): array
    {
        $drained = array_map(fn (string $symbol): QuoteData => $this->latest[$symbol], array_keys($this->pendingStorage));

        $this->pendingStorage = [];

        return $drained;
    }

    private function markChanged(string $symbol): void
    {
        $this->pendingBroadcast[$symbol] = true;
        $this->pendingStorage[$symbol] = true;
    }
}
