<?php

namespace App\Http\Middleware;

use App\Domain\Account\Onboarding;
use App\Domain\Payments\AmploPayClient;
use App\Domain\Payments\PaymentCallback;
use App\Enums\DepositStatus;
use App\Enums\WithdrawalStatus;
use App\Http\Controllers\Api\AccountController;
use App\Models\Deposit;
use App\Models\Withdrawal;
use App\Support\TradingEnvironment;
use App\Support\WalletSummary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'appName' => config('app.name'),
            'auth' => [
                'user' => $user === null ? null : [
                    'id' => $user->id,
                    'name' => $user->name,
                    'first_name' => $user->first_name,
                    'email' => $user->email,
                    'avatar_url' => $user->avatarUrl(),
                    'profile_id' => AccountController::profileId($user),
                    'member_since' => $user->created_at?->toIso8601ZuluString(),
                    'is_admin' => Gate::forUser($user)->allows('admin'),
                ],
            ],
            'onboarding' => fn () => $user === null ? null : app(Onboarding::class)->for($user),
            'preferences' => fn () => $user?->preference->toPreferences(),
            'demoWallet' => fn () => WalletSummary::of($user?->findDemoWallet()),
            'environment' => fn () => $user === null ? null : TradingEnvironment::current($request)->value,
            'activeWallet' => fn () => $user === null ? null : WalletSummary::of($user->findWallet(TradingEnvironment::current($request))),
            'realAccount' => function () use ($user): ?array {
                if ($user === null) {
                    return null;
                }

                $wallet = $user->findRealWallet();

                return [
                    'enabled' => (bool) config('platform.real_money_enabled'),
                    'payments_configured' => app(AmploPayClient::class)->isConfigured(),
                    'opened' => $wallet !== null,
                    'status' => $wallet?->account->status,
                    'wallet' => WalletSummary::of($wallet),
                    // Without a public address the provider cannot confirm payments, so deposits are refused.
                    'webhook_ready' => PaymentCallback::url() !== null,
                    'deposit_limits' => [
                        'min_cents' => (int) config('platform.real.min_deposit_cents'),
                        'max_cents' => (int) config('platform.real.max_deposit_cents'),
                        'expiry_minutes' => (int) config('platform.real.deposit_expiry_minutes'),
                    ],
                ];
            },
            // Pending work for the admin sidebar, computed only inside the admin panel.
            'adminBadges' => fn () => $user !== null && $request->routeIs('admin.*') ? [
                'deposits_review' => Deposit::query()->where('status', DepositStatus::Review)->count(),
                'withdrawals_waiting' => Withdrawal::query()->where('status', WithdrawalStatus::Requested)->count(),
            ] : null,
            'flash' => [
                'status' => fn () => $request->session()->get('status'),
                'error' => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
