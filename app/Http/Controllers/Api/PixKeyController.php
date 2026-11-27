<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\PaymentRejected;
use App\Domain\Payments\WithdrawalService;
use App\Http\Controllers\Controller;
use App\Models\PixKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Saved PIX keys, so withdrawals do not need the key typed each time. The full
 * key is only sent back when a withdrawal form asks for it.
 */
class PixKeyController extends Controller
{
    private const MAX_KEYS = 5;

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->pixKeys()->orderBy('id')->get()->map(fn (PixKey $key): array => $this->present($key, withKey: true))]);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(WithdrawalService::PIX_KEY_TYPES)],
            'key' => ['required', 'string', 'max:120'],
            'label' => ['nullable', 'string', 'max:40'],
        ]);

        $user = $request->user();
        $normalized = WithdrawalService::normalizedKey($validated['type'], $validated['key']);

        if ($validated['type'] === 'cpf' && $normalized !== $user->document_number) {
            throw new PaymentRejected('pix_key_not_owned');
        }

        if ($user->pixKeys()->count() >= self::MAX_KEYS) {
            throw new PaymentRejected('pix_key_limit');
        }

        $hash = PixKey::hashFor($validated['type'], $normalized);

        if ($user->pixKeys()->where('key_hash', $hash)->exists()) {
            throw new PaymentRejected('pix_key_exists');
        }

        $key = $user->pixKeys()->create([
            'type' => $validated['type'],
            'key' => $normalized,
            'key_hash' => $hash,
            'label' => $validated['label'] ?? null,
        ]);
        $audit->record('account.pix_key_added', $key, $user->id, ['type' => $key->type]);

        return response()->json(['data' => $this->present($key, withKey: true)], 201);
    }

    public function destroy(Request $request, PixKey $pixKey, AuditLogger $audit): JsonResponse
    {
        abort_unless($pixKey->user_id === $request->user()->id, 404);

        $pixKey->delete();
        $audit->record('account.pix_key_removed', $request->user(), $request->user()->id, ['type' => $pixKey->type]);

        return response()->json(['deleted' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PixKey $key, bool $withKey): array
    {
        return [
            'id' => $key->id,
            'type' => $key->type,
            'label' => $key->label,
            'masked' => $key->masked(),
            'key' => $withKey ? $key->key : null,
        ];
    }
}
