<?php

namespace App\Http\Controllers\Api;

use App\Domain\Market\CandleService;
use App\Enums\CandleInterval;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CandleController extends Controller
{
    public function __invoke(Request $request, Asset $asset, CandleService $candles): JsonResponse
    {
        $validated = $request->validate([
            'interval' => ['required', Rule::enum(CandleInterval::class)],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
            // Unix seconds: older history, for a chart dragged back past what it has.
            'before' => ['nullable', 'integer', 'min:0'],
        ]);

        return response()->json($candles->history(
            $asset,
            CandleInterval::from($validated['interval']),
            (int) ($validated['limit'] ?? 500),
            isset($validated['before']) ? (int) $validated['before'] : null,
        ));
    }
}
