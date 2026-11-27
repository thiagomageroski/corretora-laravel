<?php

namespace App\Http\Requests;

use App\Enums\Environment;
use App\Enums\TradeDirection;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OpenPositionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Only the client's intent is accepted. Any price, result or payout field
     * sent by the browser is ignored because it never leaves this list.
     *
     * @return array<string, array<int, ValidationRule|string|object>>
     */
    public function rules(): array
    {
        return [
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'direction' => ['required', Rule::enum(TradeDirection::class)],
            'stake_cents' => ['required', 'integer'],
            'duration_seconds' => ['required', 'integer'],
            'idempotency_key' => ['required', 'string', 'uuid'],
            'environment' => ['nullable', Rule::enum(Environment::class)->only([Environment::Demo, Environment::Real])],
        ];
    }
}
