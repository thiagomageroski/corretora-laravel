<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Environment;
use App\Http\Controllers\Controller;
use App\Models\TradingPosition;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every position on the platform. Read only: contract terms and settled
 * results are immutable, also in the database itself.
 */
class PositionController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'conta' => ['nullable', Rule::enum(Environment::class)],
            'situacao' => ['nullable', Rule::in(['open', 'won', 'lost', 'neutral', 'voided'])],
        ]);
        $search = trim((string) ($filters['q'] ?? ''));
        $environment = isset($filters['conta']) ? Environment::from($filters['conta']) : Environment::Real;

        $query = TradingPosition::query()
            ->inEnvironment($environment)
            ->when($filters['situacao'] ?? null, fn ($inner, string $state) => $state === 'open' ? $inner->open() : $inner->where('result', $state))
            ->when($search !== '', fn ($inner) => $inner->where(fn ($match) => $match
                ->whereHas('user', fn ($user) => $user->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"))
                ->orWhereHas('asset', fn ($asset) => $asset->where('symbol', 'like', "%{$search}%"))));

        $totals = (clone $query)->selectRaw('COUNT(*) AS total, COALESCE(SUM(stake_cents), 0) AS volume')->first();
        $settled = (clone $query)->closed()->selectRaw('COALESCE(SUM(stake_cents), 0) AS staked, COALESCE(SUM(returned_cents), 0) AS returned')->first();

        $positions = $query
            ->with(['user:id,first_name,last_name,email', 'asset:id,symbol'])
            ->latest('id')
            ->paginate(40)
            ->withQueryString()
            ->through(fn (TradingPosition $position): array => [...self::row($position), 'environment' => $environment->value]);

        return Inertia::render('Admin/Positions', [
            'positions' => $positions,
            'filters' => ['q' => $search, 'conta' => $environment->value, 'situacao' => $filters['situacao'] ?? null],
            'summary' => [
                'count' => (int) ($totals->total ?? 0),
                'volume_cents' => (int) ($totals->volume ?? 0),
                'house_result_cents' => (int) ($settled->staked ?? 0) - (int) ($settled->returned ?? 0),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function row(TradingPosition $position, ?int $realWalletId = null): array
    {
        return [
            'id' => $position->id,
            'user_id' => $position->user_id,
            'user' => $position->relationLoaded('user') ? $position->user?->name : null,
            'symbol' => $position->asset?->symbol ?? '—',
            'environment' => $realWalletId !== null && $position->wallet_id === $realWalletId ? 'real' : 'demo',
            'direction' => $position->direction->value,
            'stake_cents' => $position->stake_cents,
            'payout_rate_bps' => $position->payout_rate_bps,
            'entry_price' => $position->entry_price,
            'close_price' => $position->close_price,
            'result' => $position->result?->value,
            'returned_cents' => $position->returned_cents,
            'void_reason' => $position->void_reason,
            'opened_at' => $position->opened_at?->toIso8601ZuluString(),
            'expires_at' => $position->expires_at?->toIso8601ZuluString(),
            'settled_at' => $position->settled_at?->toIso8601ZuluString(),
        ];
    }
}
