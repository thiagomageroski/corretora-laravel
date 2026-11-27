<?php

namespace App\Http\Controllers\Admin;

use App\Domain\Payments\PaymentRejected;
use App\Domain\Payments\WithdrawalService;
use App\Enums\WithdrawalStatus;
use App\Http\Controllers\Controller;
use App\Models\Withdrawal;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * PIX withdrawals. Approving sends the transfer through WithdrawalService; a
 * withdrawal is only marked paid when AmploPay confirms it.
 */
class WithdrawalController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::enum(WithdrawalStatus::class)],
        ]);
        $search = trim((string) ($filters['q'] ?? ''));

        $withdrawals = Withdrawal::query()
            ->with(['user:id,first_name,last_name,email', 'reviewer:id,first_name,last_name'])
            ->when($filters['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner
                ->where('public_id', 'like', "%{$search}%")
                ->orWhere('provider_transfer_id', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($user) => $user->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"))))
            ->orderByRaw('CASE WHEN status = ? THEN 0 ELSE 1 END', [WithdrawalStatus::Requested->value])
            ->latest('id')
            ->paginate(30)
            ->withQueryString()
            ->through(fn (Withdrawal $withdrawal): array => self::row($withdrawal));

        return Inertia::render('Admin/Withdrawals', [
            'withdrawals' => $withdrawals,
            'filters' => ['q' => $search, 'status' => $filters['status'] ?? null],
            'counts' => [
                'requested' => Withdrawal::query()->where('status', WithdrawalStatus::Requested)->count(),
                'in_flight' => Withdrawal::query()->whereIn('status', [WithdrawalStatus::Sending, WithdrawalStatus::Processing])->count(),
            ],
        ]);
    }

    public function approve(Request $request, Withdrawal $withdrawal, WithdrawalService $withdrawals): RedirectResponse
    {
        return $this->decide($request, fn (string $note) => $withdrawals->approve($withdrawal, $request->user()->id, $note), 'Saque aprovado e enviado para a AmploPay.');
    }

    public function reject(Request $request, Withdrawal $withdrawal, WithdrawalService $withdrawals): RedirectResponse
    {
        return $this->decide($request, fn (string $note) => $withdrawals->reject($withdrawal, $request->user()->id, $note), 'Saque recusado e valor devolvido ao saldo do cliente.');
    }

    /**
     * Send again a transfer whose first attempt got no answer. The provider is
     * asked first, so the same withdrawal is never paid twice.
     */
    public function retry(Request $request, Withdrawal $withdrawal, WithdrawalService $withdrawals): RedirectResponse
    {
        return $this->decide($request, function () use ($withdrawal, $withdrawals): Withdrawal {
            if ($withdrawal->status !== WithdrawalStatus::Sending) {
                throw new PaymentRejected('invalid_state');
            }

            return $withdrawals->send($withdrawal, resendIfMissing: true);
        }, 'Envio do saque repetido.');
    }

    /**
     * @param  callable(string): Withdrawal  $action
     */
    private function decide(Request $request, callable $action, string $success): RedirectResponse
    {
        $note = $request->validate(['note' => ['required', 'string', 'min:5', 'max:200']])['note'];

        try {
            $withdrawal = $action($note);
        } catch (PaymentRejected $rejected) {
            return back()->with('error', $rejected->getMessage());
        }

        return $withdrawal->status === WithdrawalStatus::Failed
            ? back()->with('error', 'A AmploPay recusou a transferência: '.($withdrawal->failure_reason ?? 'sem detalhe').'. O valor voltou ao saldo do cliente.')
            : back()->with('status', $success);
    }

    /**
     * @return array<string, mixed>
     */
    public static function row(Withdrawal $withdrawal): array
    {
        return [
            'id' => $withdrawal->public_id,
            'user_id' => $withdrawal->user_id,
            'user' => $withdrawal->relationLoaded('user') ? $withdrawal->user?->name : null,
            'email' => $withdrawal->relationLoaded('user') ? $withdrawal->user?->email : null,
            'amount_cents' => $withdrawal->amount_cents,
            'fee_cents' => $withdrawal->fee_cents,
            'received_cents' => $withdrawal->received_cents,
            'status' => $withdrawal->status->value,
            'pix_key_type' => $withdrawal->pix_key_type,
            'pix_key' => $withdrawal->pix_key,
            'provider_transfer_id' => $withdrawal->provider_transfer_id,
            'end_to_end_id' => $withdrawal->end_to_end_id,
            'failure_reason' => $withdrawal->failure_reason,
            'review_note' => $withdrawal->review_note,
            'reviewer' => $withdrawal->relationLoaded('reviewer') ? $withdrawal->reviewer?->name : null,
            'created_at' => $withdrawal->created_at?->toIso8601ZuluString(),
            'approved_at' => $withdrawal->approved_at?->toIso8601ZuluString(),
            'completed_at' => $withdrawal->completed_at?->toIso8601ZuluString(),
            'can_decide' => $withdrawal->status === WithdrawalStatus::Requested,
            'can_retry' => $withdrawal->status === WithdrawalStatus::Sending,
        ];
    }
}
