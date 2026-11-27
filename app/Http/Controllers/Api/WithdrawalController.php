<?php

namespace App\Http\Controllers\Api;

use App\Domain\Payments\WithdrawalService;
use App\Http\Controllers\Controller;
use App\Http\Resources\WithdrawalResource;
use App\Models\Withdrawal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class WithdrawalController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return WithdrawalResource::collection($request->user()->withdrawals()->orderByDesc('id')->limit(20)->get());
    }

    public function store(Request $request, WithdrawalService $withdrawals): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['required', 'integer', 'min:1'],
            'pix_key_type' => ['required', Rule::in(WithdrawalService::PIX_KEY_TYPES)],
            'pix_key' => ['required', 'string', 'max:120'],
            'password' => ['required', 'current_password'],
            'idempotency_key' => ['required', 'string', 'uuid'],
        ], [
            'password.current_password' => 'Senha incorreta.',
        ]);

        $withdrawal = $withdrawals->request(
            user: $request->user(),
            amountCents: (int) $validated['amount_cents'],
            pixKeyType: $validated['pix_key_type'],
            pixKey: $validated['pix_key'],
            ip: $request->ip(),
            idempotencyKey: $validated['idempotency_key'],
        );

        return WithdrawalResource::make($withdrawal)->response()->setStatusCode(201);
    }

    public function destroy(Request $request, Withdrawal $withdrawal, WithdrawalService $withdrawals): WithdrawalResource
    {
        abort_unless($withdrawal->user_id === $request->user()->id, 404);

        return WithdrawalResource::make($withdrawals->cancel($withdrawal, $request->user()->id));
    }
}
