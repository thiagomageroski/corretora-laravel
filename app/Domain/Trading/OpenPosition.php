<?php

namespace App\Domain\Trading;

use App\Domain\Audit\AuditLogger;
use App\Domain\Market\MarketHours;
use App\Domain\Market\ProviderRegistry;
use App\Domain\Wallet\InsufficientFunds;
use App\Domain\Wallet\LedgerService;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Enums\OrderStatus;
use App\Enums\TradeDirection;
use App\Events\PositionChanged;
use App\Models\Asset;
use App\Models\MarketQuote;
use App\Models\TradingExecution;
use App\Models\TradingOrder;
use App\Models\TradingPosition;
use App\Models\User;
use App\Models\Wallet;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Opens a contract on the demo or the real wallet. The client supplies only its
 * intent; entry price, timestamps and payout are decided here.
 */
class OpenPosition
{
    public function __construct(
        private LedgerService $ledger,
        private MarketHours $hours,
        private ProviderRegistry $providers,
        private AuditLogger $audit,
    ) {}

    /**
     * @throws TradeRejected
     */
    public function handle(User $user, Asset $asset, TradeDirection $direction, int $stakeCents, int $durationSeconds, string $idempotencyKey, Environment $environment = Environment::Demo): TradingPosition
    {
        $previous = $this->findOrder($user, $idempotencyKey);

        if ($previous !== null) {
            return $this->replay($previous);
        }

        $wallet = $user->findWallet($environment) ?? throw new TradeRejected($environment === Environment::Real ? 'real_account_missing' : 'account_inactive');
        $now = CarbonImmutable::now('UTC');

        $order = fn (OrderStatus $status, ?string $reason = null): TradingOrder => TradingOrder::query()->create([
            'user_id' => $user->id,
            'wallet_id' => $wallet->id,
            'asset_id' => $asset->id,
            'direction' => $direction,
            'stake_cents' => $stakeCents,
            'duration_seconds' => $durationSeconds,
            'status' => $status,
            'reject_reason' => $reason,
            'idempotency_key' => $idempotencyKey,
        ]);

        $quote = $asset->quote;
        $reason = $this->rejectionReason($user, $wallet, $asset, $quote, $stakeCents, $durationSeconds, $now);

        if ($reason !== null) {
            return $this->reject($order, $user, $idempotencyKey, $reason);
        }

        try {
            $position = DB::transaction(function () use ($order, $user, $asset, $wallet, $quote, $direction, $stakeCents, $durationSeconds, $now): TradingPosition {
                Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();

                $openCount = TradingPosition::query()->open()->where('user_id', $user->id)->count();

                if ($openCount >= (int) config('platform.trading.max_open_positions')) {
                    throw new TradeRejected('too_many_open_positions');
                }

                $accepted = $order(OrderStatus::Accepted);

                $position = TradingPosition::query()->create([
                    'order_id' => $accepted->id,
                    'user_id' => $user->id,
                    'wallet_id' => $wallet->id,
                    'asset_id' => $asset->id,
                    'direction' => $direction,
                    'stake_cents' => $stakeCents,
                    'payout_rate_bps' => $asset->payout_rate_bps,
                    'rules_version' => (int) config('platform.trading.rules_version'),
                    'entry_price' => $quote->price,
                    'entry_source' => $quote->source,
                    'entry_source_at' => $quote->source_at,
                    'opened_at' => $now,
                    'expires_at' => $quote->source_at->addSecond()->startOfSecond()->addSeconds($durationSeconds),
                ]);

                $this->ledger->post(
                    wallet: $wallet,
                    type: LedgerEntryType::PositionReserve,
                    availableDeltaCents: -$stakeCents,
                    reservedDeltaCents: $stakeCents,
                    idempotencyKey: "position:{$position->id}:reserve",
                    reference: $position,
                    actorId: $user->id,
                );

                TradingExecution::query()->create([
                    'position_id' => $position->id,
                    'event' => 'opened',
                    'payload' => [
                        'entry_price' => $quote->price,
                        'source' => $quote->source,
                        'source_at' => $quote->source_at->toIso8601ZuluString('millisecond'),
                        'received_at' => $quote->received_at->toIso8601ZuluString('millisecond'),
                        'rules_version' => $position->rules_version,
                        'payout_rate_bps' => $position->payout_rate_bps,
                    ],
                    'created_at' => $now,
                ]);

                $this->audit->record('trading.position_opened', $position, $user->id, ['order_id' => $accepted->id, 'environment' => $wallet->account->environment->value]);

                return $position;
            });
        } catch (TradeRejected $rejected) {
            return $this->reject($order, $user, $idempotencyKey, $rejected->reason);
        } catch (InsufficientFunds) {
            return $this->reject($order, $user, $idempotencyKey, 'insufficient_funds');
        } catch (UniqueConstraintViolationException) {
            return $this->replay($this->findOrder($user, $idempotencyKey) ?? throw new TradeRejected('duplicate'));
        }

        $this->announce($position);

        return $position;
    }

    private function rejectionReason(User $user, Wallet $wallet, Asset $asset, ?MarketQuote $quote, int $stakeCents, int $durationSeconds, CarbonImmutable $now): ?string
    {
        $limits = config('platform.trading');
        $provider = $this->providers->find($asset->provider_code);

        return match (true) {
            $user->status !== 'active' => 'account_inactive',
            $wallet->account->environment === Environment::Real && ! config('platform.real_money_enabled') => 'real_money_disabled',
            $wallet->account->environment === Environment::Real && $wallet->account->status !== RealAccountManager::STATUS_ACTIVE => 'account_inactive',
            ! $asset->is_active => 'asset_inactive',
            $provider === null || ! $provider->isConfigured() || ! $provider->supportsSimulatedTrading() => 'asset_not_tradable',
            ! $this->hours->isOpen($asset->session, $now) => 'market_closed',
            $stakeCents < $limits['min_stake_cents'] || $stakeCents > $limits['max_stake_cents'] => 'stake_out_of_range',
            ! in_array($durationSeconds, $limits['durations_seconds'], true) => 'duration_not_allowed',
            $quote === null || $quote->received_at->diffInSeconds($now) > $limits['max_entry_quote_age_seconds'] => 'quote_unavailable',
            default => null,
        };
    }

    /**
     * @param  callable(OrderStatus, ?string): TradingOrder  $order
     *
     * @throws TradeRejected
     */
    private function reject(callable $order, User $user, string $idempotencyKey, string $reason): never
    {
        try {
            $order(OrderStatus::Rejected, $reason);
        } catch (UniqueConstraintViolationException) {
            Log::info('Concurrent replay of rejected order', ['user' => $user->id, 'key' => $idempotencyKey]);
        }

        throw new TradeRejected($reason);
    }

    /**
     * @throws TradeRejected
     */
    private function replay(TradingOrder $order): TradingPosition
    {
        if ($order->status === OrderStatus::Rejected) {
            throw new TradeRejected((string) $order->reject_reason);
        }

        return $order->position()->firstOrFail();
    }

    private function findOrder(User $user, string $idempotencyKey): ?TradingOrder
    {
        return TradingOrder::query()
            ->where('user_id', $user->id)
            ->where('idempotency_key', $idempotencyKey)
            ->first();
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
