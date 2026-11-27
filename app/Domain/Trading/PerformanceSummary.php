<?php

namespace App\Domain\Trading;

use App\Enums\Environment;
use App\Enums\TradeResult;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PerformanceSummary
{
    /**
     * @return array{total: int, won: int, lost: int, neutral: int, voided: int, open: int, net_result_cents: int, equity_curve: list<array{time: int, value: int}>}
     */
    public function for(User $user, Environment $environment = Environment::Demo): array
    {
        $byResult = $user->positions()->inEnvironment($environment)
            ->select('result', DB::raw('COUNT(*) as total'), DB::raw('COALESCE(SUM(returned_cents - stake_cents), 0) as net'))
            ->groupBy('result')
            ->get()
            ->keyBy(fn ($row) => $row->result?->value ?? 'open');

        $count = fn (string $key): int => (int) ($byResult[$key]->total ?? 0);

        $settled = $user->positions()->inEnvironment($environment)->closed()->orderBy('settled_at')->limit(500)
            ->get(['settled_at', 'returned_cents', 'stake_cents']);

        $running = 0;
        $curve = [];
        foreach ($settled as $position) {
            $running += (int) $position->resultCents();
            $curve[] = ['time' => $position->settled_at->getTimestamp(), 'value' => $running];
        }

        return [
            'total' => $byResult->sum(fn ($row) => (int) $row->total),
            'won' => $count(TradeResult::Won->value),
            'lost' => $count(TradeResult::Lost->value),
            'neutral' => $count(TradeResult::Neutral->value),
            'voided' => $count(TradeResult::Voided->value),
            'open' => $count('open'),
            'net_result_cents' => (int) $byResult->sum(fn ($row) => (int) $row->net),
            'equity_curve' => $curve,
        ];
    }
}
