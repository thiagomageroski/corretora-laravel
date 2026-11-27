<?php

namespace App\Http\Controllers\Admin;

use App\Domain\Payments\DepositService;
use App\Domain\Payments\PaymentRejected;
use App\Enums\DepositStatus;
use App\Http\Controllers\Controller;
use App\Models\Deposit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * PIX deposits. Credits go through DepositService, the same path as a paid
 * notification, so the ledger, receipts and audit trail stay identical.
 */
class DepositController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::enum(DepositStatus::class)],
        ]);
        $search = trim((string) ($filters['q'] ?? ''));

        $deposits = Deposit::query()
            ->with('user:id,first_name,last_name,email')
            ->when($filters['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner
                ->where('public_id', 'like', "%{$search}%")
                ->orWhere('provider_transaction_id', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($user) => $user->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"))))
            ->latest('id')
            ->paginate(30)
            ->withQueryString()
            ->through(fn (Deposit $deposit): array => self::row($deposit));

        return Inertia::render('Admin/Deposits', [
            'deposits' => $deposits,
            'filters' => ['q' => $search, 'status' => $filters['status'] ?? null],
            'counts' => [
                'review' => Deposit::query()->where('status', DepositStatus::Review)->count(),
                'pending' => Deposit::query()->where('status', DepositStatus::Pending)->where('expires_at', '>', now())->count(),
            ],
        ]);
    }

    /**
     * Credit a charge the operator saw as paid in the AmploPay panel, when its notification never arrived.
     */
    public function confirm(Request $request, Deposit $deposit, DepositService $deposits): RedirectResponse
    {
        return $this->decide($request, fn (string $note) => $deposits->confirmManually($deposit, $request->user()->id, $note), 'Depósito confirmado e creditado.');
    }

    public function approve(Request $request, Deposit $deposit, DepositService $deposits): RedirectResponse
    {
        return $this->decide($request, fn (string $note) => $deposits->approveReview($deposit, $request->user()->id, $note), 'Depósito aprovado e creditado.');
    }

    public function dismiss(Request $request, Deposit $deposit, DepositService $deposits): RedirectResponse
    {
        return $this->decide($request, fn (string $note) => $deposits->dismissReview($deposit, $request->user()->id, $note), 'Depósito recusado. Devolva o valor pelo painel da AmploPay.');
    }

    /**
     * @param  callable(string): Deposit  $action
     */
    private function decide(Request $request, callable $action, string $success): RedirectResponse
    {
        $note = $request->validate(['note' => ['required', 'string', 'min:5', 'max:200']])['note'];

        try {
            $action($note);
        } catch (PaymentRejected $rejected) {
            return back()->with('error', $rejected->getMessage());
        }

        return back()->with('status', $success);
    }

    /**
     * @return array<string, mixed>
     */
    public static function row(Deposit $deposit): array
    {
        return [
            'id' => $deposit->public_id,
            'user_id' => $deposit->user_id,
            'user' => $deposit->relationLoaded('user') ? $deposit->user?->name : null,
            'email' => $deposit->relationLoaded('user') ? $deposit->user?->email : null,
            'amount_cents' => $deposit->amount_cents,
            'fee_cents' => $deposit->fee_cents,
            'status' => $deposit->status->value,
            'provider_status' => $deposit->provider_status,
            'provider_transaction_id' => $deposit->provider_transaction_id,
            'review_reason' => $deposit->review_reason,
            'failure_reason' => $deposit->failure_reason,
            'created_at' => $deposit->created_at?->toIso8601ZuluString(),
            'paid_at' => $deposit->paid_at?->toIso8601ZuluString(),
            'credited_at' => $deposit->credited_at?->toIso8601ZuluString(),
            'expires_at' => $deposit->expires_at?->toIso8601ZuluString(),
            'can_confirm' => in_array($deposit->status, [DepositStatus::Pending, DepositStatus::Expired], true) && $deposit->provider_transaction_id !== null,
            'can_review' => $deposit->status === DepositStatus::Review,
        ];
    }
}
