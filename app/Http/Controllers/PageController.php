<?php

namespace App\Http\Controllers;

use App\Domain\Market\AssetCatalogQuery;
use App\Domain\Market\AssetViews;
use App\Domain\Market\CandleService;
use App\Domain\Trading\PerformanceSummary;
use App\Enums\CandleInterval;
use App\Enums\Environment;
use App\Http\Resources\AssetResource;
use App\Http\Resources\DepositResource;
use App\Http\Resources\PositionResource;
use App\Http\Resources\WithdrawalResource;
use App\Models\Asset;
use App\Models\AssetCategory;
use App\Models\WalletTransaction;
use App\Support\TradingEnvironment;
use App\Support\WalletSummary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Auth\SessionGuard;
use Inertia\Inertia;
use Inertia\Response;

class PageController extends Controller
{
    private const MOVERS_PER_SIDE = 4;

    private const MOVERS_MAX_QUOTE_AGE_MINUTES = 10;

    public function landing(CandleService $candles): Response
    {
        return Inertia::render('Landing', [
            'categories' => AssetCategory::query()->withCount(['assets' => fn ($query) => $query->active()])->orderBy('sort')->get(['id', 'code', 'name']),
            'canRegister' => ! Auth::check(),
            'snapshot' => $this->quoteSnapshot(),
            'featuredAssets' => Asset::query()->active()->orderBy('id')->limit(16)->pluck('name'),
            'figures' => [
                'payout_percent' => intdiv((int) config('platform.trading.default_payout_bps'), 100),
                'min_stake_cents' => (int) config('platform.trading.min_stake_cents'),
                'durations_seconds' => config('platform.trading.durations_seconds'),
                'demo_balance_cents' => (int) config('platform.demo.initial_balance_cents'),
                'min_deposit_cents' => (int) config('platform.real.min_deposit_cents'),
                'min_withdrawal_cents' => (int) config('platform.real.min_withdrawal_cents'),
                'daily_withdrawal_limit_cents' => (int) config('platform.real.daily_withdrawal_limit_cents'),
            ],
            'heroChart' => Inertia::defer(function () use ($candles): ?array {
                $asset = Asset::query()->active()->where('symbol', 'BTC/USD')->first();

                return $asset === null ? null : $candles->history($asset, CandleInterval::OneHour, 96);
            }),
        ]);
    }

    public function account(): Response
    {
        return Inertia::render('Account');
    }

    /**
     * Real stored quotes for the public page; empty when none have been received.
     *
     * @return list<array<string, mixed>>
     */
    private function quoteSnapshot(): array
    {
        return Asset::query()
            ->active()
            ->with('quote')
            ->whereHas('quote')
            ->orderBy('id')
            ->whereRelation('category', 'code', 'crypto')
            ->limit(14)
            ->get()
            ->map(fn (Asset $asset): array => [
                'id' => $asset->id,
                'symbol' => $asset->symbol,
                'name' => $asset->name,
                'price' => $asset->quote->price,
                'open_24h' => $asset->quote->open_24h,
                'source' => $asset->quote->source,
                'source_at' => $asset->quote->source_at->toIso8601ZuluString(),
            ])
            ->all();
    }

    public function terms(): Response
    {
        return Inertia::render('Legal/Terms', [
            'trading' => $this->tradingRules(),
            'real' => $this->realLimits(),
            'company' => $this->legalEntity(),
        ]);
    }

    public function risks(): Response
    {
        return Inertia::render('Legal/Risks', [
            'trading' => $this->tradingRules(),
            'company' => $this->legalEntity(),
        ]);
    }

    public function privacy(): Response
    {
        return Inertia::render('Legal/Privacy', [
            'real' => $this->realLimits(),
            'company' => $this->legalEntity(),
        ]);
    }

    public function cookies(): Response
    {
        /** @var SessionGuard $guard */
        $guard = Auth::guard('web');

        return Inertia::render('Legal/Cookies', [
            'company' => $this->legalEntity(),
            // The real names and lifetimes, so the policy never drifts from what the browser receives.
            'cookies' => [
                'session_name' => (string) config('session.cookie'),
                'session_minutes' => (int) config('session.lifetime'),
                'remember_name' => $guard->getRecallerName(),
                'remember_days' => intdiv((int) config('auth.guards.web.remember'), 60 * 24),
            ],
        ]);
    }

    public function antiMoneyLaundering(): Response
    {
        return Inertia::render('Legal/AntiMoneyLaundering', [
            'real' => $this->realLimits(),
            'company' => $this->legalEntity(),
        ]);
    }

    public function dashboard(Request $request, PerformanceSummary $performance): Response
    {
        $user = $request->user();
        $environment = TradingEnvironment::current($request);

        return Inertia::render('Dashboard', [
            'wallet' => WalletSummary::of($user->findWallet($environment)),
            'performance' => $performance->for($user, $environment),
            'recentPositions' => PositionResource::collection(
                $user->positions()->inEnvironment($environment)->with('asset')->orderByDesc('id')->limit(8)->get(),
            ),
            'favorites' => AssetResource::collection(
                $user->favoriteAssets()->active()->with(['quote', 'category'])->limit(8)->get(),
            ),
            'movers' => $this->movers(),
        ]);
    }

    /**
     * Biggest 24-hour moves among assets with a recent real quote.
     *
     * @return array{gainers: mixed, losers: mixed}
     */
    private function movers(): array
    {
        $ranked = Asset::query()
            ->active()
            ->with(['quote', 'category'])
            ->whereHas('quote', fn ($query) => $query->where('received_at', '>=', now('UTC')->subMinutes(self::MOVERS_MAX_QUOTE_AGE_MINUTES)))
            ->get()
            ->filter(fn (Asset $asset): bool => (float) $asset->quote->open_24h > 0)
            ->sortByDesc(fn (Asset $asset): float => ((float) $asset->quote->price - (float) $asset->quote->open_24h) / (float) $asset->quote->open_24h)
            ->values();

        return [
            'gainers' => AssetResource::collection($ranked->take(self::MOVERS_PER_SIDE)),
            'losers' => AssetResource::collection($ranked->reverse()->take(self::MOVERS_PER_SIDE)->values()),
        ];
    }

    public function terminal(Request $request, AssetCatalogQuery $catalog): Response
    {
        $user = $request->user();
        $environment = TradingEnvironment::current($request);
        $requested = $request->integer('asset');

        // Arriving with ?asset= (from the catalog or an asset page) is choosing that asset.
        if ($requested > 0 && Asset::query()->active()->whereKey($requested)->exists()) {
            AssetViews::record($user, $requested);
        }

        return Inertia::render('Terminal', [
            'assets' => AssetResource::collection($catalog->for($user)->get()),
            'categories' => AssetCategory::query()->orderBy('sort')->get(['code', 'name']),
            'recentAssetIds' => DB::table('asset_views')
                ->where('user_id', $user->id)->orderByDesc('viewed_at')->limit(8)->pluck('asset_id'),
            'wallet' => WalletSummary::of($user->findWallet($environment)),
            'openPositions' => PositionResource::collection(
                $user->positions()->inEnvironment($environment)->open()->with('asset')->orderBy('expires_at')->get(),
            ),
            'closedPositions' => PositionResource::collection(
                $user->positions()->inEnvironment($environment)->closed()->with('asset')->orderByDesc('settled_at')->limit(30)->get(),
            ),
            'rules' => $this->tradingRules(),
        ]);
    }

    public function assets(Request $request, AssetCatalogQuery $catalog): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'category' => ['nullable', 'string', 'exists:asset_categories,code'],
            'favorites' => ['nullable', 'boolean'],
        ]);

        return Inertia::render('Assets/Index', [
            'assets' => AssetResource::collection($catalog->for($request->user(), $filters)->paginate(50)->withQueryString()),
            'categories' => AssetCategory::query()->withCount(['assets' => fn ($query) => $query->active()])->orderBy('sort')->get(['id', 'code', 'name']),
            'filters' => $filters,
        ]);
    }

    public function asset(Request $request, Asset $asset, AssetCatalogQuery $catalog): Response
    {
        $resource = AssetResource::make($catalog->for($request->user())->whereKey($asset->id)->firstOrFail());
        AssetViews::record($request->user(), $asset->id);

        return Inertia::render('Assets/Show', ['asset' => $resource]);
    }

    public function wallet(Request $request): Response
    {
        $user = $request->user();
        $environment = TradingEnvironment::current($request);
        $wallet = $user->findWallet($environment) ?? $user->demoWallet();
        $isReal = $environment === Environment::Real;
        $real = config('platform.real');

        return Inertia::render('Wallet', [
            'environment' => $environment->value,
            'wallet' => WalletSummary::of($wallet),
            'deposits' => $isReal ? DepositResource::collection($user->deposits()->orderByDesc('id')->limit(20)->get()) : [],
            'withdrawals' => $isReal ? WithdrawalResource::collection($user->withdrawals()->orderByDesc('id')->limit(20)->get()) : [],
            'limits' => [
                'min_deposit_cents' => $real['min_deposit_cents'],
                'max_deposit_cents' => $real['max_deposit_cents'],
                'min_withdrawal_cents' => $real['min_withdrawal_cents'],
                'max_withdrawal_cents' => $real['max_withdrawal_cents'],
                'daily_withdrawal_limit_cents' => $real['daily_withdrawal_limit_cents'],
                'withdrawal_fee_paid_by_user' => $real['withdrawal_fee_paid_by_user'],
            ],
            'entries' => $wallet->transactions()->orderByDesc('seq')->paginate(30)
                ->through(fn (WalletTransaction $entry): array => [
                    'id' => $entry->id,
                    'seq' => $entry->seq,
                    'type' => $entry->type->value,
                    'available_delta_cents' => $entry->available_delta_cents,
                    'reserved_delta_cents' => $entry->reserved_delta_cents,
                    'available_after_cents' => $entry->available_after_cents,
                    'reserved_after_cents' => $entry->reserved_after_cents,
                    'reason' => $entry->reason,
                    'created_at' => $entry->created_at?->toIso8601ZuluString(),
                ]),
            'resetOptions' => config('platform.demo.reset_options_cents'),
        ]);
    }

    public function history(Request $request, PerformanceSummary $performance): Response
    {
        $filters = $request->validate(['result' => ['nullable', 'in:open,won,lost,neutral,voided']]);
        $result = $filters['result'] ?? null;
        $user = $request->user();
        $environment = TradingEnvironment::current($request);

        return Inertia::render('History', [
            'positions' => PositionResource::collection(
                $user->positions()->inEnvironment($environment)->with('asset')
                    ->when($result === 'open', fn ($query) => $query->open())
                    ->when($result !== null && $result !== 'open', fn ($query) => $query->where('result', $result))
                    ->orderByDesc('id')
                    ->paginate(30)
                    ->withQueryString(),
            ),
            'performance' => $performance->for($user, $environment),
            'filter' => $result,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function tradingRules(): array
    {
        $trading = config('platform.trading');

        return [
            'min_stake_cents' => $trading['min_stake_cents'],
            'max_stake_cents' => $trading['max_stake_cents'],
            'durations_seconds' => $trading['durations_seconds'],
            'max_entry_quote_age_seconds' => $trading['max_entry_quote_age_seconds'],
            'settlement_grace_seconds' => $trading['settlement_grace_seconds'],
            'rules_version' => $trading['rules_version'],
            'default_payout_bps' => $trading['default_payout_bps'],
        ];
    }

    /**
     * @return array{minimum_age: int, min_deposit_cents: int, min_withdrawal_cents: int, daily_withdrawal_limit_cents: int, require_payer_match: bool}
     */
    private function realLimits(): array
    {
        return [
            'minimum_age' => (int) config('platform.real.minimum_age'),
            'min_deposit_cents' => (int) config('platform.real.min_deposit_cents'),
            'min_withdrawal_cents' => (int) config('platform.real.min_withdrawal_cents'),
            'daily_withdrawal_limit_cents' => (int) config('platform.real.daily_withdrawal_limit_cents'),
            'require_payer_match' => (bool) config('platform.real.require_payer_match'),
        ];
    }

    /**
     * Who runs the platform, as configured in the admin panel. Empty fields are null.
     *
     * @return array{name: ?string, document: ?string, address: ?string, contact_email: ?string, privacy_email: ?string}
     */
    private function legalEntity(): array
    {
        return [
            'name' => config('platform.legal.company_name') ?: null,
            'document' => config('platform.legal.company_document') ?: null,
            'address' => config('platform.legal.address') ?: null,
            'contact_email' => config('platform.legal.contact_email') ?: null,
            'privacy_email' => config('platform.legal.privacy_email') ?: null,
        ];
    }
}
