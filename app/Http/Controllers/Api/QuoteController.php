<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketQuote;
use Illuminate\Http\JsonResponse;

/**
 * Polling fallback for clients whose WebSocket connection is down.
 */
class QuoteController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $quotes = MarketQuote::query()
            ->get(['asset_id', 'price', 'open_24h', 'source_at'])
            ->map(fn (MarketQuote $quote): array => [
                'asset_id' => $quote->asset_id,
                'price' => $quote->price,
                'open_24h' => $quote->open_24h,
                'source_at' => $quote->source_at->format('Y-m-d H:i:s.v'),
            ]);

        return response()->json(['data' => $quotes]);
    }
}
