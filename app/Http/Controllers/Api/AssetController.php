<?php

namespace App\Http\Controllers\Api;

use App\Domain\Market\AssetCatalogQuery;
use App\Domain\Market\AssetViews;
use App\Http\Controllers\Controller;
use App\Http\Resources\AssetResource;
use App\Models\Asset;
use App\Models\TradingPosition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

class AssetController extends Controller
{
    /** Below this many positions a percentage says nothing, so none is shown. */
    public const SENTIMENT_MIN_POSITIONS = 10;

    private const SENTIMENT_WINDOW_HOURS = 24;

    public function index(Request $request, AssetCatalogQuery $catalog): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'category' => ['nullable', 'string', 'exists:asset_categories,code'],
            'favorites' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:300'],
        ]);

        return AssetResource::collection(
            $catalog->for($request->user(), $filters)->paginate($filters['per_page'] ?? 50)->withQueryString(),
        );
    }

    public function recordView(Request $request, Asset $asset): Response
    {
        AssetViews::record($request->user(), $asset->id);

        return response()->noContent();
    }

    /**
     * How the platform's traders positioned themselves on this asset: the share
     * of CALL among positions opened in the last 24 hours, demo and real alike,
     * counted across all clients so no individual can be identified.
     */
    public function sentiment(Asset $asset): JsonResponse
    {
        $counts = Cache::remember("asset-sentiment:{$asset->id}", 30, function () use ($asset): array {
            $row = TradingPosition::query()
                ->where('asset_id', $asset->id)
                ->where('opened_at', '>=', now()->subHours(self::SENTIMENT_WINDOW_HOURS))
                ->selectRaw("COUNT(*) AS total, COALESCE(SUM(CASE WHEN direction = 'call' THEN 1 ELSE 0 END), 0) AS calls")
                ->first();

            return ['total' => (int) ($row->total ?? 0), 'calls' => (int) ($row->calls ?? 0)];
        });

        $enough = $counts['total'] >= self::SENTIMENT_MIN_POSITIONS;

        return response()->json([
            'positions' => $counts['total'],
            'window_hours' => self::SENTIMENT_WINDOW_HOURS,
            'call_percent' => $enough ? (int) round($counts['calls'] / $counts['total'] * 100) : null,
        ]);
    }
}
