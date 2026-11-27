<?php

namespace App\Http\Controllers\Admin;

use App\Domain\Audit\AuditLogger;
use App\Domain\Wallet\DemoWalletManager;
use App\Domain\Wallet\InsufficientFunds;
use App\Domain\Wallet\LedgerService;
use App\Domain\Wallet\OpenPositionsBlockReset;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\DepositStatus;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Enums\WithdrawalStatus;
use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\AuditLog;
use App\Models\Deposit;
use App\Models\LoginEvent;
use App\Models\PixKey;
use App\Models\TradingPosition;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\Withdrawal;
use App\Rules\BrazilianPhone;
use App\Rules\PlainAsciiEmail;
use App\Support\UserAgentLabel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    /** Status set by an administrator: sign-in is refused until reactivated. */
    public const STATUS_SUSPENDED = 'suspended';

    private const FILTERS = ['real', 'no_real', 'frozen', 'suspended', 'closed', 'admin', 'deletion'];

    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'filtro' => ['nullable', Rule::in(self::FILTERS)],
        ]);
        $search = trim((string) ($filters['q'] ?? ''));

        $users = User::query()
            ->with(['accounts.wallet'])
            ->when($search !== '', function ($query) use ($search): void {
                $profileId = ctype_digit($search) && (int) $search > 100_000_000 ? (int) $search - 100_000_000 : null;
                $query->where(fn ($inner) => $inner
                    ->where('email', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->when(ctype_digit($search), fn ($digits) => $digits->orWhere('id', (int) $search))
                    ->when($profileId !== null, fn ($byProfile) => $byProfile->orWhere('id', $profileId)));
            })
            ->when($filters['filtro'] ?? null, fn ($query, string $filter) => match ($filter) {
                'real' => $query->whereHas('accounts', fn ($accounts) => $accounts->where('environment', Environment::Real)),
                'no_real' => $query->whereDoesntHave('accounts', fn ($accounts) => $accounts->where('environment', Environment::Real)),
                'frozen' => $query->whereHas('accounts', fn ($accounts) => $accounts->where('environment', Environment::Real)->where('status', RealAccountManager::STATUS_FROZEN)),
                'suspended' => $query->where('status', self::STATUS_SUSPENDED),
                'closed' => $query->where('status', 'closed'),
                'admin' => $query->where('is_admin', true),
                'deletion' => $query->whereNotNull('deletion_requested_at'),
            })
            ->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (User $user): array => self::row($user));

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'filters' => ['q' => $search, 'filtro' => $filters['filtro'] ?? null],
        ]);
    }

    public function show(User $user): Response
    {
        // Real money first: it is what an administrator usually looks for.
        $wallets = $user->accounts()->with('wallet')->get()->filter(fn (Account $account): bool => $account->wallet !== null)
            ->sortBy(fn (Account $account): int => $account->environment === Environment::Real ? 0 : 1);
        $walletIds = $wallets->pluck('wallet.id');
        $realWalletId = $wallets->firstWhere('environment', Environment::Real)?->wallet?->id;

        return Inertia::render('Admin/Users/Show', [
            'user' => [
                ...self::row($user),
                'birth_date' => $user->birth_date?->format('Y-m-d'),
                'cpf' => self::maskedCpf($user->document_number),
                'two_factor' => $user->two_factor_confirmed_at !== null,
                'closed_at' => $user->closed_at?->toIso8601ZuluString(),
                'deletion_requested_at' => $user->deletion_requested_at?->toIso8601ZuluString(),
                'real_terms_accepted_at' => $user->real_terms_accepted_at?->toIso8601ZuluString(),
                'avatar' => $user->avatar_path !== null,
            ],
            'wallets' => $wallets->map(fn (Account $account): array => [
                'environment' => $account->environment->value,
                'status' => $account->status,
                ...self::balance($account->wallet),
            ])->values(),
            'stats' => [
                'positions' => $user->positions()->count(),
                'positions_real' => $realWalletId === null ? 0 : $user->positions()->where('wallet_id', $realWalletId)->count(),
                'won' => $user->positions()->where('result', 'won')->count(),
                'lost' => $user->positions()->where('result', 'lost')->count(),
                'real_volume_cents' => $realWalletId === null ? 0 : (int) $user->positions()->where('wallet_id', $realWalletId)->sum('stake_cents'),
                'real_result_cents' => $realWalletId === null ? 0 : (int) $user->positions()->where('wallet_id', $realWalletId)->whereNotNull('result')->sum(DB::raw('returned_cents - stake_cents')),
                'deposited_cents' => (int) $user->deposits()->where('status', DepositStatus::Completed)->sum('amount_cents'),
                'withdrawn_cents' => (int) $user->withdrawals()->where('status', WithdrawalStatus::Completed)->sum('amount_cents'),
            ],
            'deposits' => $user->deposits()->latest()->limit(10)->get()->map(fn (Deposit $deposit): array => DepositController::row($deposit)),
            'withdrawals' => $user->withdrawals()->latest()->limit(10)->get()->map(fn (Withdrawal $withdrawal): array => WithdrawalController::row($withdrawal)),
            'positions' => $user->positions()->with('asset:id,symbol')->latest('id')->limit(15)->get()->map(fn (TradingPosition $position): array => PositionController::row($position, $realWalletId)),
            'ledger' => WalletTransaction::query()->whereIn('wallet_id', $walletIds)->latest('id')->limit(25)->get()->map(fn (WalletTransaction $entry): array => [
                'id' => $entry->id,
                'environment' => $entry->wallet_id === $realWalletId ? 'real' : 'demo',
                'type' => $entry->type->value,
                'available_delta_cents' => $entry->available_delta_cents,
                'available_after_cents' => $entry->available_after_cents,
                'reason' => $entry->reason,
                'created_at' => $entry->created_at?->toIso8601ZuluString(),
            ]),
            'logins' => LoginEvent::query()->where('user_id', $user->id)->latest('id')->limit(10)->get()->map(fn (LoginEvent $event): array => [
                'id' => $event->id,
                'event' => $event->event,
                'ip_address' => $event->ip_address,
                'device' => UserAgentLabel::describe($event->user_agent),
                'created_at' => $event->created_at?->toIso8601ZuluString(),
            ]),
            'pixKeys' => $user->pixKeys()->get()->map(fn (PixKey $key): array => ['id' => $key->id, 'type' => $key->type, 'masked' => $key->masked(), 'label' => $key->label]),
            'audit' => AuditLog::query()
                ->with('actor:id,first_name,last_name')
                ->where(fn ($query) => $query->where(fn ($subject) => $subject->where('subject_type', $user->getMorphClass())->where('subject_id', $user->id))->orWhere('actor_id', $user->id))
                ->latest('id')->limit(15)->get()->map(fn (AuditLog $log): array => AuditController::row($log)),
            'sessions' => DB::table('sessions')->where('user_id', $user->id)->count(),
        ]);
    }

    public function update(Request $request, User $user, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', new PlainAsciiEmail, 'max:255', Rule::unique('users')->ignore($user->id)],
            'phone' => [$user->findRealWallet() !== null ? 'required' : 'nullable', 'string', 'max:20', new BrazilianPhone],
        ]);

        $user->forceFill([...$validated, 'email' => Str::lower($validated['email'])])->save();
        $audit->record('admin.user_updated', $user, $request->user()->id, ['changed' => array_keys($user->getChanges())]);

        return back()->with('status', 'Dados do cliente atualizados.');
    }

    /**
     * Credit or debit a wallet by hand. It is one more ledger entry, with the
     * administrator and the reason recorded, never an edit of the balance.
     */
    public function adjustBalance(Request $request, User $user, LedgerService $ledger, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'environment' => ['required', Rule::enum(Environment::class)],
            'direction' => ['required', Rule::in(['credit', 'debit'])],
            'amount_cents' => ['required', 'integer', 'min:1', 'max:100000000'],
            'reason' => ['required', 'string', 'min:5', 'max:200'],
            'idempotency_key' => ['required', 'uuid'],
        ]);

        $wallet = $user->findWallet(Environment::from($validated['environment']));

        if ($wallet === null) {
            return back()->with('error', 'Este cliente não tem essa conta.');
        }

        $delta = $validated['direction'] === 'credit' ? $validated['amount_cents'] : -$validated['amount_cents'];

        try {
            $entry = $ledger->post(
                wallet: $wallet,
                type: LedgerEntryType::AdminAdjustment,
                availableDeltaCents: $delta,
                reservedDeltaCents: 0,
                idempotencyKey: 'admin-adjustment:'.$validated['idempotency_key'],
                actorId: $request->user()->id,
                reason: $validated['reason'],
            );
        } catch (InsufficientFunds) {
            return back()->with('error', 'O saldo disponível não cobre esse débito.');
        }

        $audit->record('admin.balance_adjusted', $wallet, $request->user()->id, [
            'user_id' => $user->id,
            'environment' => $validated['environment'],
            'delta_cents' => $delta,
            'entry_id' => $entry->id,
            'reason' => $validated['reason'],
        ]);

        return back()->with('status', 'Saldo ajustado e registrado no extrato.');
    }

    public function setRealStatus(Request $request, User $user, RealAccountManager $accounts, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in([RealAccountManager::STATUS_ACTIVE, RealAccountManager::STATUS_FROZEN])],
            'reason' => ['required', 'string', 'min:5', 'max:200'],
        ]);

        $account = $user->accounts()->where('environment', Environment::Real)->first();

        if ($account === null) {
            return back()->with('error', 'Este cliente não abriu a conta real.');
        }

        if ($validated['status'] === RealAccountManager::STATUS_FROZEN) {
            $accounts->freeze($account, $validated['reason'], $request->user()->id);

            return back()->with('status', 'Conta real bloqueada: depósitos, saques e operações reais ficam suspensos.');
        }

        $account->update(['status' => RealAccountManager::STATUS_ACTIVE]);
        $audit->record('account.real_unfrozen', $account, $request->user()->id, ['reason' => $validated['reason']]);

        return back()->with('status', 'Conta real desbloqueada.');
    }

    /**
     * Suspend or reactivate sign-in. Suspending also ends every open session.
     */
    public function setAccess(Request $request, User $user, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['active', self::STATUS_SUSPENDED])],
            'reason' => ['required', 'string', 'min:5', 'max:200'],
        ]);

        if ($user->is($request->user())) {
            return back()->with('error', 'Você não pode suspender a própria conta.');
        }

        DB::transaction(function () use ($user, $validated, $request, $audit): void {
            $user->forceFill(['status' => $validated['status'], 'closed_at' => $validated['status'] === 'active' ? null : $user->closed_at])->save();

            if ($validated['status'] !== 'active') {
                DB::table('sessions')->where('user_id', $user->id)->delete();
            }

            $audit->record($validated['status'] === 'active' ? 'admin.user_reactivated' : 'admin.user_suspended', $user, $request->user()->id, ['reason' => $validated['reason']]);
        });

        return back()->with('status', $validated['status'] === 'active' ? 'Acesso reativado.' : 'Acesso suspenso e sessões encerradas.');
    }

    public function resetDemo(Request $request, User $user, DemoWalletManager $demo, AuditLogger $audit): RedirectResponse
    {
        try {
            $entry = $demo->reset($user);
        } catch (OpenPositionsBlockReset) {
            return back()->with('error', 'O cliente tem operações demo abertas. Aguarde o encerramento.');
        }

        $audit->record('admin.demo_reset', $user, $request->user()->id, ['entry_id' => $entry->id]);

        return back()->with('status', 'Saldo demo reiniciado.');
    }

    public function revokeSessions(Request $request, User $user, AuditLogger $audit): RedirectResponse
    {
        $count = DB::table('sessions')->where('user_id', $user->id)->delete();
        $audit->record('admin.sessions_revoked', $user, $request->user()->id, ['count' => $count]);

        return back()->with('status', $count > 0 ? "{$count} sessão(ões) encerrada(s)." : 'Nenhuma sessão aberta.');
    }

    public function setAdmin(Request $request, User $user, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate(['is_admin' => ['required', 'boolean']]);

        if ($user->is($request->user())) {
            return back()->with('error', 'Você não pode alterar o próprio acesso de administrador.');
        }

        $user->forceFill(['is_admin' => (bool) $validated['is_admin']])->save();
        $audit->record($user->is_admin ? 'admin.granted' : 'admin.revoked', $user, $request->user()->id);

        return back()->with('status', $user->is_admin ? 'Acesso de administrador concedido.' : 'Acesso de administrador removido.');
    }

    /**
     * @return array<string, mixed>
     */
    private static function row(User $user): array
    {
        $real = $user->accounts->firstWhere('environment', Environment::Real);
        $demo = $user->accounts->firstWhere('environment', Environment::Demo);

        return [
            'id' => $user->id,
            'profile_id' => AccountController::profileId($user),
            'name' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'is_admin' => $user->is_admin,
            'created_at' => $user->created_at?->toIso8601ZuluString(),
            'real' => $real === null ? null : ['status' => $real->status, ...self::balance($real->wallet)],
            'demo' => $demo === null ? null : self::balance($demo->wallet),
        ];
    }

    /**
     * @return array{available_cents: int, reserved_cents: int}
     */
    private static function balance(?Wallet $wallet): array
    {
        $balance = $wallet?->balance();

        return ['available_cents' => $balance->availableCents ?? 0, 'reserved_cents' => $balance->reservedCents ?? 0];
    }

    private static function maskedCpf(?string $digits): ?string
    {
        if ($digits === null || strlen($digits) !== 11) {
            return null;
        }

        return '***.'.substr($digits, 3, 3).'.'.substr($digits, 6, 3).'-**';
    }
}
