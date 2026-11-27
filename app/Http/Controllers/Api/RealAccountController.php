<?php

namespace App\Http\Controllers\Api;

use App\Domain\Wallet\RealAccountManager;
use App\Enums\Environment;
use App\Http\Controllers\Controller;
use App\Rules\BrazilianPhone;
use App\Rules\Cpf;
use App\Support\TradingEnvironment;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RealAccountController extends Controller
{
    public function store(Request $request, RealAccountManager $accounts): JsonResponse
    {
        $validated = $request->validate([
            'cpf' => ['required', 'string', 'max:20', new Cpf],
            'birth_date' => ['required', 'date_format:Y-m-d', 'before:today', 'after:1900-01-01'],
            'phone' => ['required', 'string', 'max:20', new BrazilianPhone],
            'accept_real_terms' => ['accepted'],
        ], [
            'accept_real_terms.accepted' => 'Confirme que leu e aceita os riscos da conta real.',
        ]);

        $accounts->open(
            user: $request->user(),
            cpf: $validated['cpf'],
            birthDate: CarbonImmutable::createFromFormat('Y-m-d', $validated['birth_date'])->startOfDay(),
            phone: $validated['phone'],
        );

        TradingEnvironment::select($request, Environment::Real);

        return response()->json(['environment' => Environment::Real->value], 201);
    }
}
