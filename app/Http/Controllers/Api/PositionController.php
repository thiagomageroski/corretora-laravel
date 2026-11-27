<?php

namespace App\Http\Controllers\Api;

use App\Domain\Trading\OpenPosition;
use App\Enums\Environment;
use App\Enums\TradeDirection;
use App\Http\Controllers\Controller;
use App\Http\Requests\OpenPositionRequest;
use App\Http\Resources\PositionResource;
use App\Models\Asset;
use App\Support\TradingEnvironment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PositionController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate(['status' => ['nullable', 'in:open,closed']]);

        $positions = $request->user()->positions()
            ->inEnvironment(TradingEnvironment::current($request))
            ->with('asset')
            ->when(($validated['status'] ?? null) === 'open', fn ($query) => $query->open()->orderBy('expires_at'))
            ->when(($validated['status'] ?? null) === 'closed', fn ($query) => $query->closed()->orderByDesc('settled_at'))
            ->when(! isset($validated['status']), fn ($query) => $query->orderByDesc('id'))
            ->paginate(30);

        return PositionResource::collection($positions);
    }

    public function store(OpenPositionRequest $request, OpenPosition $openPosition): JsonResponse
    {
        $position = $openPosition->handle(
            user: $request->user(),
            asset: Asset::query()->with('quote')->findOrFail($request->integer('asset_id')),
            direction: TradeDirection::from($request->string('direction')->value()),
            stakeCents: $request->integer('stake_cents'),
            durationSeconds: $request->integer('duration_seconds'),
            idempotencyKey: $request->string('idempotency_key')->value(),
            environment: $request->enum('environment', Environment::class) ?? Environment::Demo,
        );

        return PositionResource::make($position->load('asset'))->response()->setStatusCode(201);
    }
}
