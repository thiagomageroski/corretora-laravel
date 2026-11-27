<?php

namespace App\Http\Controllers\Admin;

use App\Enums\DepositStatus;
use App\Enums\Environment;
use App\Enums\WithdrawalStatus;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Deposit;
use App\Models\TradingPosition;
use App\Models\User;
use App\Models\Withdrawal;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    private const CHART_DAYS = 14;

    public function __invoke(): Response
    {
        $today = now()->startOfDay();
        $realPositions = fn () => TradingPosition::query()->inEnvironment(Environment::Real);

        return Inertia::render('Admin/Dashboard', [
            'metrics' => [
                'users_total' => User::query()->count(),
                'users_today' => User::query()->where('created_at', '>=', $today)->count(),
                'users_week' => User::query()->where('created_at', '>=', now()->subDays(7))->count(),
                'real_accounts' => Account::query()->where('environment', Environment::Real)->count(),
                'real_balance_cents' => self::realBalanceCents(),
                'deposits_total_cents' => (int) Deposit::query()->where('status', DepositStatus::Completed)->sum('amount_cents'),
                'deposits_today_cents' => (int) Deposit::query()->where('status', DepositStatus::Completed)->where('credited_at', '>=', $today)->sum('amount_cents'),
                'deposits_pending' => Deposit::query()->where('status', DepositStatus::Pending)->where('expires_at', '>', now())->count(),
                'deposits_review' => Deposit::query()->where('status', DepositStatus::Review)->count(),
                'withdrawals_total_cents' => (int) Withdrawal::query()->where('status', WithdrawalStatus::Completed)->sum('amount_cents'),
                'withdrawals_waiting' => Withdrawal::query()->where('status', WithdrawalStatus::Requested)->count(),
                'withdrawals_in_flight' => Withdrawal::query()->whereIn('status', [WithdrawalStatus::Sending, WithdrawalStatus::Processing])->count(),
                'positions_open' => $realPositions()->open()->count(),
                'positions_open_demo' => TradingPosition::query()->inEnvironment(Environment::Demo)->open()->count(),
                'volume_today_cents' => (int) $realPositions()->where('opened_at', '>=', $today)->sum('stake_cents'),
                'house_result_cents' => self::houseResult($realPositions()),
                'house_result_today_cents' => self::houseResult($realPositions()->where('settled_at', '>=', $today)),
            ],
            'chart' => self::chart(),
            'recentUsers' => User::query()->latest('id')->limit(6)->get()->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'created_at' => $user->created_at?->toIso8601ZuluString(),
                'real' => $user->accounts()->where('environment', Environment::Real)->exists(),
            ]),
            'waitingWithdrawals' => Withdrawal::query()->with('user:id,first_name,last_name')->where('status', WithdrawalStatus::Requested)->oldest()->limit(6)->get()
                ->map(fn (Withdrawal $withdrawal): array => [
                    'id' => $withdrawal->public_id,
                    'user' => $withdrawal->user?->name,
                    'user_id' => $withdrawal->user_id,
                    'amount_cents' => $withdrawal->amount_cents,
                    'created_at' => $withdrawal->created_at?->toIso8601ZuluString(),
                ]),
        ]);
    }

    /**
     * What clients hold in real money right now: the last running balance of each real wallet.
     */
    private static function realBalanceCents(): int
    {
        return (int) DB::table('wallet_transactions as entry')
            ->join('wallets', 'wallets.id', '=', 'entry.wallet_id')
            ->join('accounts', 'accounts.id', '=', 'wallets.account_id')
            ->where('accounts.environment', Environment::Real->value)
            ->whereRaw('entry.seq = (SELECT MAX(latest.seq) FROM wallet_transactions AS latest WHERE latest.wallet_id = entry.wallet_id)')
            ->sum(DB::raw('entry.available_after_cents + entry.reserved_after_cents'));
    }

    /**
     * Stakes taken minus what was paid back: positive when clients lost.
     *
     * @param  Builder<TradingPosition>  $positions
     */
    private static function houseResult($positions): int
    {
        $totals = $positions->closed()->selectRaw('COALESCE(SUM(stake_cents), 0) AS staked, COALESCE(SUM(returned_cents), 0) AS returned')->first();

        return (int) ($totals->staked ?? 0) - (int) ($totals->returned ?? 0);
    }

    /**
     * Daily totals for the last two weeks, grouped in PHP so it works on any database.
     *
     * @return list<array{date: string, deposits_cents: int, withdrawals_cents: int, users: int}>
     */
    private static function chart(): array
    {
        $start = now()->subDays(self::CHART_DAYS - 1)->startOfDay();
        $day = fn (?DateTimeInterface $at): string => $at?->format('Y-m-d') ?? '';

        $deposits = Deposit::query()->where('status', DepositStatus::Completed)->where('credited_at', '>=', $start)->get(['amount_cents', 'credited_at'])
            ->groupBy(fn (Deposit $deposit): string => $day($deposit->credited_at))->map->sum('amount_cents');
        $withdrawals = Withdrawal::query()->where('status', WithdrawalStatus::Completed)->where('completed_at', '>=', $start)->get(['amount_cents', 'completed_at'])
            ->groupBy(fn (Withdrawal $withdrawal): string => $day($withdrawal->completed_at))->map->sum('amount_cents');
        $users = User::query()->where('created_at', '>=', $start)->get(['created_at'])
            ->groupBy(fn (User $user): string => $day($user->created_at))->map->count();

        return collect(range(0, self::CHART_DAYS - 1))->map(function (int $offset) use ($start, $deposits, $withdrawals, $users): array {
            $date = $start->copy()->addDays($offset)->format('Y-m-d');

            return [
                'date' => $date,
                'deposits_cents' => (int) ($deposits[$date] ?? 0),
                'withdrawals_cents' => (int) ($withdrawals[$date] ?? 0),
                'users' => (int) ($users[$date] ?? 0),
            ];
        })->all();
    }
}
