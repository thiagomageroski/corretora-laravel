<?php

namespace App\Http\Controllers;

use App\Domain\Payments\AmploPayWebhookHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AmploPayWebhookController extends Controller
{
    public function __invoke(Request $request, AmploPayWebhookHandler $handler): JsonResponse
    {
        $payload = $request->json()->all();

        if (! is_array($payload) || $payload === []) {
            return response()->json(['received' => false], 400);
        }

        $outcome = $handler->handle($payload, $request->ip());

        return $outcome === AmploPayWebhookHandler::REJECTED
            ? response()->json(['received' => false], 401)
            : response()->json(['received' => true]);
    }
}
