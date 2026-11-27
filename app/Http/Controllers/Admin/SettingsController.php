<?php

namespace App\Http\Controllers\Admin;

use App\Domain\Payments\AmploPayClient;
use App\Domain\Payments\PaymentCallback;
use App\Domain\Platform\PlatformSettings;
use App\Http\Controllers\Controller;
use Illuminate\Foundation\Application;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(PlatformSettings $settings, AmploPayClient $amploPay): Response
    {
        return Inertia::render('Admin/Settings', [
            'settings' => $settings->current(),
            'durationChoices' => PlatformSettings::DURATION_CHOICES,
            'bounds' => collect(PlatformSettings::FIELDS)->map(fn (array $field): array => ['min' => $field['min'] ?? null, 'max' => $field['max'] ?? null])->all(),
            'system' => [
                'payments_configured' => $amploPay->isConfigured(),
                'webhook_url' => PaymentCallback::url(),
                'environment' => app()->environment(),
                'laravel' => Application::VERSION,
                'php' => PHP_VERSION,
                'database' => DB::connection()->getDriverName().' / '.DB::connection()->getDatabaseName(),
            ],
        ]);
    }

    public function update(Request $request, PlatformSettings $settings): RedirectResponse
    {
        $validated = $request->validate(self::rules(), [
            'max_deposit_cents.gte' => 'O depósito máximo não pode ser menor que o mínimo.',
            'max_withdrawal_cents.gte' => 'O saque máximo não pode ser menor que o mínimo.',
            'daily_withdrawal_limit_cents.gte' => 'O limite diário não pode ser menor que o saque mínimo.',
            'max_stake_cents.gte' => 'O valor máximo por operação não pode ser menor que o mínimo.',
            'durations_seconds.min' => 'Escolha pelo menos um prazo.',
            'legal_contact_email.email' => 'Informe um e-mail válido.',
            'legal_privacy_email.email' => 'Informe um e-mail válido.',
        ]);

        $changes = $settings->update($validated, $request->user());

        return back()->with('status', $changes === [] ? 'Nada mudou.' : count($changes).' configuração(ões) salva(s). Já valem para todo o site.');
    }

    /**
     * @return array<string, list<mixed>>
     */
    private static function rules(): array
    {
        $rules = [];

        foreach (PlatformSettings::FIELDS as $name => $field) {
            $rules[$name] = match ($field['type']) {
                'bool' => ['required', 'boolean'],
                'durations' => ['required', 'array', 'min:1'],
                'text' => ['nullable', 'string', 'max:'.$field['max']],
                'email' => ['nullable', 'email', 'max:'.$field['max']],
                default => ['required', 'integer', 'min:'.$field['min'], 'max:'.$field['max']],
            };
        }

        $rules['durations_seconds.*'] = ['integer', Rule::in(PlatformSettings::DURATION_CHOICES)];
        $rules['max_deposit_cents'][] = 'gte:min_deposit_cents';
        $rules['max_withdrawal_cents'][] = 'gte:min_withdrawal_cents';
        $rules['daily_withdrawal_limit_cents'][] = 'gte:min_withdrawal_cents';
        $rules['max_stake_cents'][] = 'gte:min_stake_cents';

        return $rules;
    }
}
