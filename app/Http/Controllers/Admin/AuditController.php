<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PaymentWebhook;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Read-only trail: who did what, and every notification AmploPay sent.
 */
class AuditController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'aba' => ['nullable', Rule::in(['registros', 'webhooks'])],
            'q' => ['nullable', 'string', 'max:80'],
            'grupo' => ['nullable', Rule::in(['admin', 'payments', 'account', 'trading', 'platform', 'user', 'wallet'])],
        ]);
        $tab = $filters['aba'] ?? 'registros';
        $search = trim((string) ($filters['q'] ?? ''));

        $entries = $tab === 'webhooks'
            ? PaymentWebhook::query()
                ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner->where('event', 'like', "%{$search}%")->orWhere('entity_id', 'like', "%{$search}%")->orWhere('status', $search)))
                ->latest('id')
                ->paginate(40)
                ->withQueryString()
                ->through(fn (PaymentWebhook $webhook): array => [
                    'id' => $webhook->id,
                    'event' => $webhook->event,
                    'entity_id' => $webhook->entity_id,
                    'status' => $webhook->status,
                    'token_valid' => $webhook->token_valid,
                    'error' => $webhook->error,
                    'ip_address' => $webhook->ip_address,
                    'payload' => $webhook->payload,
                    'received_at' => $webhook->received_at?->toIso8601ZuluString(),
                ])
            : AuditLog::query()
                ->with('actor:id,first_name,last_name')
                ->when($filters['grupo'] ?? null, fn ($query, string $group) => $query->where('action', 'like', "{$group}.%"))
                ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner->where('action', 'like', "%{$search}%")->orWhereHas('actor', fn ($actor) => $actor->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"))))
                ->latest('id')
                ->paginate(40)
                ->withQueryString()
                ->through(fn (AuditLog $log): array => self::row($log));

        return Inertia::render('Admin/Audit', [
            'tab' => $tab,
            'entries' => $entries,
            'filters' => ['q' => $search, 'grupo' => $filters['grupo'] ?? null],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function row(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'action' => $log->action,
            'actor_id' => $log->actor_id,
            'actor' => $log->relationLoaded('actor') ? $log->actor?->name : null,
            'subject' => $log->subject_type === null ? null : Str::afterLast((string) $log->subject_type, '\\').' #'.$log->subject_id,
            'context' => $log->context ?? [],
            'ip_address' => $log->ip_address,
            'created_at' => $log->created_at?->toIso8601ZuluString(),
        ];
    }
}
