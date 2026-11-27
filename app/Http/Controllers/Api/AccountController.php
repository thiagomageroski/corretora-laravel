<?php

namespace App\Http\Controllers\Api;

use App\Domain\Account\AccountClosure;
use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\WithdrawalService;
use App\Enums\CandleInterval;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePreferencesRequest;
use App\Models\LoginEvent;
use App\Models\PixKey;
use App\Models\User;
use App\Models\UserPreference;
use App\Support\UserAgentLabel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class AccountController extends Controller
{
    private const LOGIN_HISTORY_SIZE = 20;

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $trading = config('platform.trading');

        return response()->json([
            'profile' => [
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'member_since' => $user->created_at?->toIso8601ZuluString(),
                'profile_id' => self::profileId($user),
                'avatar_url' => $user->avatarUrl(),
                'real_account' => $user->findRealWallet() !== null,
                'deletion_requested_at' => $user->deletion_requested_at?->toIso8601ZuluString(),
            ],
            'pix_keys' => $user->pixKeys()->orderBy('id')->get()->map(fn (PixKey $key): array => [
                'id' => $key->id,
                'type' => $key->type,
                'label' => $key->label,
                'masked' => $key->masked(),
            ]),
            'two_factor' => [
                'enabled' => $user->two_factor_secret !== null,
                'confirmed' => $user->two_factor_confirmed_at !== null,
            ],
            'preferences' => $user->preference->toPreferences(),
            'sessions' => $this->sessions($request, $user),
            'login_events' => LoginEvent::query()
                ->where('user_id', $user->id)
                ->orderByDesc('id')
                ->limit(self::LOGIN_HISTORY_SIZE)
                ->get()
                ->map(fn (LoginEvent $event): array => [
                    'id' => $event->id,
                    'event' => $event->event,
                    'ip_address' => $event->ip_address,
                    'device' => UserAgentLabel::describe($event->user_agent),
                    'created_at' => $event->created_at?->toIso8601ZuluString(),
                ]),
            'options' => [
                'min_stake_cents' => $trading['min_stake_cents'],
                'max_stake_cents' => $trading['max_stake_cents'],
                'durations_seconds' => $trading['durations_seconds'],
                'chart_types' => UserPreference::CHART_TYPES,
                'chart_intervals' => array_column(CandleInterval::cases(), 'value'),
                'indicators' => UserPreference::INDICATORS,
                'demo_reset_cents' => config('platform.demo.reset_options_cents'),
                'interface_scales' => UserPreference::INTERFACE_SCALES,
                'pix_key_types' => WithdrawalService::PIX_KEY_TYPES,
                'statement_months' => self::statementMonths($user),
            ],
        ]);
    }

    /**
     * A stable public number for the account, shown like a customer id.
     */
    public static function profileId(User $user): string
    {
        return (string) (100_000_000 + $user->id);
    }

    /**
     * Months with ledger activity in any of the user's wallets, newest first.
     *
     * @return list<string>
     */
    private static function statementMonths(User $user): array
    {
        $first = $user->created_at ?? now();
        $months = [];

        for ($month = now()->startOfMonth(); $month->greaterThanOrEqualTo($first->copy()->startOfMonth()) && count($months) < 24; $month = $month->subMonth()) {
            $months[] = $month->format('Y-m');
        }

        return $months;
    }

    public function resetPreferences(Request $request, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $preference = UserPreference::query()->firstOrNew(['user_id' => $user->id]);
        $preference->fill(UserPreference::DEFAULTS)->save();
        $audit->record('account.preferences_reset', $user, $user->id);

        return response()->json(['preferences' => $preference->toPreferences()]);
    }

    public function close(Request $request, AccountClosure $closure): JsonResponse
    {
        $request->validate(['password' => ['required', 'string', 'current_password:web']], ['password.current_password' => 'Senha incorreta.']);

        $closure->close($request->user());
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['closed' => true]);
    }

    public function requestDeletion(Request $request, AccountClosure $closure): JsonResponse
    {
        $request->validate(['password' => ['required', 'string', 'current_password:web']], ['password.current_password' => 'Senha incorreta.']);

        $closure->requestDeletion($request->user());

        return response()->json(['deletion_requested_at' => $request->user()->deletion_requested_at?->toIso8601ZuluString()]);
    }

    public function updatePreferences(UpdatePreferencesRequest $request): JsonResponse
    {
        $user = $request->user();
        $preference = UserPreference::query()->firstOrNew(['user_id' => $user->id], UserPreference::DEFAULTS);
        $preference->fill($request->validated())->save();

        return response()->json(['preferences' => $preference->toPreferences()]);
    }

    /**
     * End one other session, or every other session when no id is given.
     */
    public function revokeSessions(Request $request, AuditLogger $audit): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'current_password:web'],
            'session_id' => ['nullable', 'string', 'size:64'],
        ]);

        $user = $request->user();
        $currentId = $request->session()->getId();
        $targets = DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $currentId)->pluck('id')
            ->when(isset($validated['session_id']), fn ($ids) => $ids->filter(fn (string $id): bool => hash_equals(hash('sha256', $id), $validated['session_id'])));

        DB::table('sessions')->whereIn('id', $targets)->delete();
        $audit->record('account.sessions_revoked', $user, $user->id, ['count' => $targets->count()]);

        return response()->json(['revoked' => $targets->count()]);
    }

    /**
     * The real session id is a credential, so clients only ever see its hash.
     *
     * @return list<array<string, mixed>>
     */
    private function sessions(Request $request, User $user): array
    {
        if (config('session.driver') !== 'database') {
            return [];
        }

        return DB::table('sessions')
            ->where('user_id', $user->id)
            ->orderByDesc('last_activity')
            ->get()
            ->map(fn (object $session): array => [
                'id' => hash('sha256', $session->id),
                'device' => UserAgentLabel::describe($session->user_agent),
                'ip_address' => $session->ip_address,
                'last_active_at' => gmdate('Y-m-d\TH:i:s\Z', (int) $session->last_activity),
                'is_current' => $session->id === $request->session()->getId(),
            ])
            ->all();
    }
}
