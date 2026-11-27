<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'user_id', 'chart_type', 'chart_interval', 'chart_indicators', 'chart_animations',
    'default_stake_cents', 'default_duration_seconds', 'confirm_before_trade',
    'sound_on_settlement', 'hide_balance', 'timezone', 'interface_scale',
    'chart_position_lines', 'chart_stake_labels', 'chart_legend', 'keyboard_shortcuts',
    'notify_settlement_toast', 'email_transactions', 'email_product_news', 'email_promotions',
])]
class UserPreference extends Model
{
    public const CHART_TYPES = ['candles', 'bars', 'line', 'area'];

    public const INDICATORS = ['sma', 'ema', 'bb', 'volume', 'rsi', 'macd', 'stoch'];

    public const INTERFACE_SCALES = [80, 90, 100, 110, 120];

    public const DEFAULTS = [
        'chart_type' => 'candles',
        'chart_interval' => '1m',
        // A clean chart for new accounts: indicators, volume included, are switched on by choice.
        'chart_indicators' => [],
        'chart_animations' => true,
        'default_stake_cents' => 5_000,
        'default_duration_seconds' => 60,
        'confirm_before_trade' => false,
        'sound_on_settlement' => false,
        'hide_balance' => false,
        'timezone' => 'auto',
        'interface_scale' => 100,
        'chart_position_lines' => true,
        'chart_stake_labels' => true,
        'chart_legend' => true,
        'keyboard_shortcuts' => false,
        'notify_settlement_toast' => true,
        'email_transactions' => true,
        'email_product_news' => true,
        'email_promotions' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'chart_indicators' => 'array',
            'chart_animations' => 'boolean',
            'default_stake_cents' => 'integer',
            'default_duration_seconds' => 'integer',
            'confirm_before_trade' => 'boolean',
            'sound_on_settlement' => 'boolean',
            'hide_balance' => 'boolean',
            'interface_scale' => 'integer',
            'chart_position_lines' => 'boolean',
            'chart_stake_labels' => 'boolean',
            'chart_legend' => 'boolean',
            'keyboard_shortcuts' => 'boolean',
            'notify_settlement_toast' => 'boolean',
            'email_transactions' => 'boolean',
            'email_product_news' => 'boolean',
            'email_promotions' => 'boolean',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toPreferences(): array
    {
        return array_merge(self::DEFAULTS, array_filter($this->only(array_keys(self::DEFAULTS)), fn ($value) => $value !== null));
    }
}
