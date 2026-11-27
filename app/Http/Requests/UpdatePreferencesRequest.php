<?php

namespace App\Http\Requests;

use App\Enums\CandleInterval;
use App\Models\UserPreference;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Partial updates: only the fields sent are validated and changed.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $trading = config('platform.trading');

        return [
            'chart_type' => ['sometimes', Rule::in(UserPreference::CHART_TYPES)],
            'chart_interval' => ['sometimes', Rule::enum(CandleInterval::class)],
            'chart_indicators' => ['sometimes', 'array'],
            'chart_indicators.*' => ['string', Rule::in(UserPreference::INDICATORS)],
            'chart_animations' => ['sometimes', 'boolean'],
            'default_stake_cents' => ['sometimes', 'integer', "min:{$trading['min_stake_cents']}", "max:{$trading['max_stake_cents']}"],
            'default_duration_seconds' => ['sometimes', 'integer', Rule::in($trading['durations_seconds'])],
            'confirm_before_trade' => ['sometimes', 'boolean'],
            'sound_on_settlement' => ['sometimes', 'boolean'],
            'hide_balance' => ['sometimes', 'boolean'],
            'timezone' => ['sometimes', 'string', Rule::when(fn (): bool => $this->input('timezone') !== 'auto', ['timezone:all'])],
            'interface_scale' => ['sometimes', 'integer', Rule::in(UserPreference::INTERFACE_SCALES)],
            'chart_position_lines' => ['sometimes', 'boolean'],
            'chart_stake_labels' => ['sometimes', 'boolean'],
            'chart_legend' => ['sometimes', 'boolean'],
            'keyboard_shortcuts' => ['sometimes', 'boolean'],
            'notify_settlement_toast' => ['sometimes', 'boolean'],
            'email_transactions' => ['sometimes', 'boolean'],
            'email_product_news' => ['sometimes', 'boolean'],
            'email_promotions' => ['sometimes', 'boolean'],
        ];
    }
}
