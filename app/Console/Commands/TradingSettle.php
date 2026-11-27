<?php

namespace App\Console\Commands;

use App\Domain\Trading\SettlePosition;
use App\Models\TradingPosition;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('trading:settle {--once : Process due positions once and exit}')]
#[Description('Settle expired positions using provider prices')]
class TradingSettle extends Command
{
    public function handle(SettlePosition $settle): int
    {
        do {
            $this->settleDuePositions($settle);

            if (! $this->option('once')) {
                sleep(1);
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }

    private function settleDuePositions(SettlePosition $settle): void
    {
        TradingPosition::query()
            ->open()
            ->with('asset', 'wallet.account')
            ->where('expires_at', '<=', now('UTC'))
            ->orderBy('expires_at')
            ->limit(200)
            ->get()
            ->each(function (TradingPosition $position) use ($settle): void {
                try {
                    $settle->handle($position);
                } catch (Throwable $exception) {
                    report($exception);
                    $this->error("Position {$position->id}: {$exception->getMessage()}");
                }
            });
    }
}
