<?php

namespace App\Http\Controllers\Api;

use App\Enums\Environment;
use App\Http\Controllers\Controller;
use App\Support\TradingEnvironment;
use App\Support\WalletSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'environment' => ['nullable', Rule::enum(Environment::class)->only([Environment::Demo, Environment::Real])],
        ]);

        $environment = isset($validated['environment']) ? Environment::from($validated['environment']) : TradingEnvironment::current($request);
        $wallet = $request->user()->findWallet($environment);

        abort_if($wallet === null, 404, 'Conta não encontrada.');

        return response()->json(WalletSummary::of($wallet));
    }

    /**
     * Choose which account the pages show.
     */
    public function select(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'environment' => ['required', Rule::enum(Environment::class)->only([Environment::Demo, Environment::Real])],
        ]);

        $environment = Environment::from($validated['environment']);

        if ($environment === Environment::Real && $request->user()->findRealWallet() === null) {
            return response()->json(['code' => 'real_account_missing', 'message' => 'Abra sua conta real antes de continuar.'], 422);
        }

        TradingEnvironment::select($request, $environment);

        return response()->json(['environment' => $environment->value]);
    }
}
