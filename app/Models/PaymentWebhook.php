<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Every notification received, stored before any processing so a failure can
 * be retried and audited. The token is never stored.
 */
#[Fillable(['provider', 'event', 'entity_id', 'payload', 'token_valid', 'status', 'error', 'ip_address', 'received_at', 'processed_at'])]
class PaymentWebhook extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'token_valid' => 'boolean',
            'received_at' => 'immutable_datetime',
            'processed_at' => 'immutable_datetime',
        ];
    }
}
