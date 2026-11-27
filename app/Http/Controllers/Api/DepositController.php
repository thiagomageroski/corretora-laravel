<?php

namespace App\Http\Controllers\Api;

use App\Domain\Payments\AmploPayClient;
use App\Domain\Payments\DepositService;
use App\Domain\Payments\PaymentProviderError;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\DepositStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\DepositResource;
use App\Models\Deposit;
use App\Rules\Cpf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

class DepositController extends Controller
{
    /**
     * Seconds between two lookups of the same deposit at the provider, which
     * blocks clients that poll it.
     */
    private const CHECK_INTERVAL_SECONDS = 60;

    public function index(Request $request): AnonymousResourceCollection
    {
        return DepositResource::collection($request->user()->deposits()->orderByDesc('id')->limit(20)->get());
    }

    public function store(Request $request, DepositService $deposits): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['required', 'integer', 'min:1'],
            'idempotency_key' => ['required', 'string', 'uuid'],
            'cpf' => ['required', 'string', 'max:14', new Cpf],
            'accept_terms' => ['accepted'],
        ], [
            'cpf.required' => 'Informe o CPF do titular que vai pagar o PIX.',
            'accept_terms.accepted' => 'Aceite os termos de depósito para continuar.',
        ]);

        // The PIX must come from the account holder: the CPF typed here has to be the one of the real account.
        $user = $request->user();
        $typed = RealAccountManager::documentHash((string) preg_replace('/\D+/', '', $validated['cpf']));

        if ($user->document_hash !== null && ! hash_equals($user->document_hash, $typed)) {
            throw ValidationException::withMessages(['cpf' => 'Use o CPF do titular da conta: o PIX precisa sair de uma conta bancária no seu CPF.']);
        }

        $deposit = $deposits->create($user, (int) $validated['amount_cents'], $validated['idempotency_key']);

        return DepositResource::make($deposit)->response()->setStatusCode(201);
    }

    /**
     * Current state of a deposit, as recorded from the provider's notifications.
     * With `check=1` (the "I have paid" button) the provider is also asked, at
     * most once a minute per deposit; plain polling never reaches the provider.
     */
    public function show(Request $request, Deposit $deposit, DepositService $deposits, AmploPayClient $client): DepositResource
    {
        abort_unless($deposit->user_id === $request->user()->id, 404);

        $due = $deposit->last_checked_at === null || $deposit->last_checked_at->diffInSeconds(now()) >= self::CHECK_INTERVAL_SECONDS;

        if ($request->boolean('check') && $client->lookupsEnabled() && $deposit->status === DepositStatus::Pending && $due) {
            try {
                $deposit = $deposits->refresh($deposit);
            } catch (PaymentProviderError) {
                $deposit->update(['last_checked_at' => now()]);
            }
        }

        return DepositResource::make($deposit);
    }
}
