<?php

namespace App\Domain\Platform;

use App\Domain\Audit\AuditLogger;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Platform settings an administrator can change at runtime. Values live in
 * the platform_settings table and override config/platform.php for every
 * request; settings never changed keep the configured defaults.
 */
class PlatformSettings
{
    /**
     * Editable settings: form field => where it lives under config('platform') and its bounds.
     *
     * @var array<string, array{path: string, type: 'bool'|'cents'|'int'|'durations', min?: int, max?: int}>
     */
    public const FIELDS = [
        'real_money_enabled' => ['path' => 'real_money_enabled', 'type' => 'bool'],
        'min_deposit_cents' => ['path' => 'real.min_deposit_cents', 'type' => 'cents', 'min' => 100, 'max' => 100_000_000],
        'max_deposit_cents' => ['path' => 'real.max_deposit_cents', 'type' => 'cents', 'min' => 100, 'max' => 100_000_000],
        'max_pending_deposits' => ['path' => 'real.max_pending_deposits', 'type' => 'int', 'min' => 1, 'max' => 10],
        'min_withdrawal_cents' => ['path' => 'real.min_withdrawal_cents', 'type' => 'cents', 'min' => 100, 'max' => 100_000_000],
        'max_withdrawal_cents' => ['path' => 'real.max_withdrawal_cents', 'type' => 'cents', 'min' => 100, 'max' => 100_000_000],
        'daily_withdrawal_limit_cents' => ['path' => 'real.daily_withdrawal_limit_cents', 'type' => 'cents', 'min' => 100, 'max' => 1_000_000_000],
        'auto_approve_withdrawal_max_cents' => ['path' => 'real.auto_approve_withdrawal_max_cents', 'type' => 'cents', 'min' => 0, 'max' => 100_000_000],
        'require_payer_match' => ['path' => 'real.require_payer_match', 'type' => 'bool'],
        'withdrawal_fee_paid_by_user' => ['path' => 'real.withdrawal_fee_paid_by_user', 'type' => 'bool'],
        'min_stake_cents' => ['path' => 'trading.min_stake_cents', 'type' => 'cents', 'min' => 100, 'max' => 10_000_000],
        'max_stake_cents' => ['path' => 'trading.max_stake_cents', 'type' => 'cents', 'min' => 100, 'max' => 10_000_000],
        'max_open_positions' => ['path' => 'trading.max_open_positions', 'type' => 'int', 'min' => 1, 'max' => 100],
        'default_payout_bps' => ['path' => 'trading.default_payout_bps', 'type' => 'int', 'min' => 1_000, 'max' => 9_500],
        'durations_seconds' => ['path' => 'trading.durations_seconds', 'type' => 'durations'],
        'demo_initial_balance_cents' => ['path' => 'demo.initial_balance_cents', 'type' => 'cents', 'min' => 100, 'max' => 100_000_000],
        'legal_company_name' => ['path' => 'legal.company_name', 'type' => 'text', 'max' => 120],
        'legal_company_document' => ['path' => 'legal.company_document', 'type' => 'text', 'max' => 32],
        'legal_address' => ['path' => 'legal.address', 'type' => 'text', 'max' => 240],
        'legal_contact_email' => ['path' => 'legal.contact_email', 'type' => 'email', 'max' => 120],
        'legal_privacy_email' => ['path' => 'legal.privacy_email', 'type' => 'email', 'max' => 120],
    ];

    /** Expiry times that settlement supports. */
    public const DURATION_CHOICES = [60, 120, 300, 600, 900, 1800, 3600];

    private const CACHE_KEY = 'platform-settings:v1';

    public function __construct(private AuditLogger $audit) {}

    /**
     * Puts the stored values over the configuration. Before the table exists
     * (a fresh install, the first migration) the defaults simply stay.
     */
    public function apply(): void
    {
        try {
            $stored = Cache::rememberForever(self::CACHE_KEY, fn (): array => DB::table('platform_settings')->pluck('value', 'key')
                ->map(fn (string $json): mixed => json_decode($json, true))
                ->all());
        } catch (QueryException) {
            return;
        }

        foreach ($stored as $field => $value) {
            if (isset(self::FIELDS[$field])) {
                config(['platform.'.self::FIELDS[$field]['path'] => $value]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function current(): array
    {
        return collect(self::FIELDS)->map(fn (array $field): mixed => config('platform.'.$field['path']))->all();
    }

    /**
     * Saves the given values and returns what changed, as field => [before, after].
     *
     * @param  array<string, mixed>  $values
     * @return array<string, array{0: mixed, 1: mixed}>
     */
    public function update(array $values, User $actor): array
    {
        $before = $this->current();
        $changes = [];

        DB::transaction(function () use ($values, $before, $actor, &$changes): void {
            foreach ($values as $field => $value) {
                if (! isset(self::FIELDS[$field])) {
                    continue;
                }

                $value = $this->normalize(self::FIELDS[$field]['type'], $value);

                if ($value === $before[$field]) {
                    continue;
                }

                $changes[$field] = [$before[$field], $value];
                DB::table('platform_settings')->updateOrInsert(
                    ['key' => $field],
                    ['value' => json_encode($value), 'updated_by' => $actor->id, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        });

        Cache::forget(self::CACHE_KEY);
        $this->apply();

        if ($changes !== []) {
            $this->audit->record('platform.settings_updated', null, $actor->id, ['changes' => $changes]);
        }

        return $changes;
    }

    private function normalize(string $type, mixed $value): mixed
    {
        return match ($type) {
            'bool' => (bool) $value,
            'durations' => collect((array) $value)->map(fn (mixed $seconds): int => (int) $seconds)->unique()->sort()->values()->all(),
            // A cleared field stores null, so the pages leave it out.
            'text', 'email' => trim((string) $value) === '' ? null : trim((string) $value),
            default => (int) $value,
        };
    }
}
