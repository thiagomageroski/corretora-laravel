<?php

namespace App\Domain\Audit;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

class AuditLogger
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function record(string $action, ?Model $subject = null, ?int $actorId = null, array $context = []): AuditLog
    {
        return AuditLog::query()->create([
            'actor_id' => $actorId,
            'action' => $action,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'context' => $context,
            'ip_address' => request()?->ip(),
        ]);
    }
}
