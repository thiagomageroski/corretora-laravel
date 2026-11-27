<?php

namespace App\Http\Controllers\Api;

use App\Domain\Wallet\DemoWalletManager;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DemoWalletController extends Controller
{
    public function reset(Request $request, DemoWalletManager $manager): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['nullable', 'integer', Rule::in(config('platform.demo.reset_options_cents'))],
        ]);

        $entry = $manager->reset($request->user(), $validated['amount_cents'] ?? null);

        return response()->json([
            'available_cents' => $entry->available_after_cents,
            'reserved_cents' => $entry->reserved_after_cents,
        ]);
    }
}
