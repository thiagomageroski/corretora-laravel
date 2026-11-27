<?php

namespace App\Domain\Trading;

use App\Domain\Audit\AuditLogger;
use App\Domain\Market\Data\PricePoint;
use App\Domain\Market\ProviderRegistry;
use App\Domain\Market\ProviderUnavailable;
use App\Domain\Wallet\LedgerService;
use App\Enums\LedgerEntryType;
use App\Enums\TradeDirection;
use App\Enums\TradeResult;
use App\Events\PositionChanged;
use App\Models\TradingExecution;
use App\Models\TradingPosition;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Settles an expired contract once, following rules_version 1:
 * the close is the last price before expiry, and a position with no reference
 * price after the grace period is voided and refunded.
 */
class SettlePosition
{
    private const PRICE_SCALE = 10;

    public function __construct(
        private ProviderRegistry $providers,
        private LedgerService $ledger,
        private AuditLogger $audit,
    ) {}

    /**
     * @return bool Whether the position is settled after this call.
     */
    public function handle(TradingPosition $position, ?CarbonImmutable $now = null): bool
    {
        $now ??= CarbonImmutable::now('UTC');

        if ($position->result !== null) {
            return true;
        }

        if ($position->expires_at->isAfter($now)) {
            return false;
        }

        $close = $this->fetchClose($position);

        if ($close === null && $now->lessThan($position->expires_at->addSeconds((int) config('platform.trading.settlement_grace_seconds')))) {
            return false;
        }

        $settled = DB::transaction(function () use ($position, $close, $now): ?TradingPosition {
            $locked = TradingPosition::query()->whereKey($position->id)->lockForUpdate()->firstOrFail();

            return $locked->result === null ? $this->settle($locked, $close, $now) : null;
        });

        if ($settled !== null) {
            $this->announce($settled);
        }

        return true;
    }

    private function settle(TradingPosition $position, ?PricePoint $close, CarbonImmutable $now): TradingPosition
    {
        $result = $close === null ? TradeResult::Voided : $this->resultFor($position, $close->price);
        $returnedCents = $this->returnedCents($position, $result);

        $position->update([
            'close_price' => $close?->price,
            'close_source' => $close?->source,
            'close_source_at' => $close?->at,
            'result' => $result,
            'returned_cents' => $returnedCents,
            'void_reason' => $close === null ? 'no_reference_price' : null,
            'settled_at' => $now,
        ]);

        $this->ledger->post(
            wallet: $position->wallet,
            type: LedgerEntryType::PositionSettlement,
            availableDeltaCents: $returnedCents,
            reservedDeltaCents: -$position->stake_cents,
            idempotencyKey: "position:{$position->id}:settlement",
            reference: $position,
        );

        TradingExecution::query()->create([
            'position_id' => $position->id,
            'event' => 'settled',
            'payload' => [
                'result' => $result->value,
                'entry_price' => $position->entry_price,
                'close_price' => $close?->price,
                'close_source' => $close?->source,
                'close_source_at' => $close?->at->toIso8601ZuluString('millisecond'),
                'returned_cents' => $returnedCents,
            ],
            'created_at' => $now,
        ]);

        $this->audit->record('trading.position_settled', $position, context: ['result' => $result->value]);

        return $position;
    }

    private function resultFor(TradingPosition $position, string $closePrice): TradeResult
    {
        $comparison = bccomp($closePrice, (string) $position->entry_price, self::PRICE_SCALE);

        return match (true) {
            $comparison === 0 => TradeResult::Neutral,
            $position->direction === TradeDirection::Call => $comparison > 0 ? TradeResult::Won : TradeResult::Lost,
            default => $comparison < 0 ? TradeResult::Won : TradeResult::Lost,
        };
    }

    private function returnedCents(TradingPosition $position, TradeResult $result): int
    {
        return match ($result) {
            TradeResult::Won => $position->stake_cents + intdiv($position->stake_cents * $position->payout_rate_bps, 10_000),
            TradeResult::Lost => 0,
            TradeResult::Neutral, TradeResult::Voided => $position->stake_cents,
        };
    }

    private function fetchClose(TradingPosition $position): ?PricePoint
    {
        $asset = $position->asset;
        $provider = $this->providers->find($asset->provider_code);

        if ($provider === null) {
            return null;
        }

        try {
            return $provider->priceBefore((string) $asset->provider_symbol, $position->expires_at);
        } catch (ProviderUnavailable $exception) {
            Log::warning('Close price unavailable', ['position' => $position->id, 'error' => $exception->getMessage()]);

            return null;
        }
    }

    private function announce(TradingPosition $position): void
    {
        try {
            PositionChanged::dispatch($position->user_id, $position->id);
        } catch (Throwable $exception) {
            Log::warning('Position broadcast failed', ['position' => $position->id, 'error' => $exception->getMessage()]);
        }
    }
}
