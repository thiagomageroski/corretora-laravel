<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A PIX key the user saved for withdrawals. The key is stored encrypted; the
 * hash only prevents saving the same key twice.
 */
#[Fillable(['user_id', 'type', 'key', 'key_hash', 'label'])]
#[Hidden(['key', 'key_hash'])]
class PixKey extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['key' => 'encrypted'];
    }

    public static function hashFor(string $type, string $normalizedKey): string
    {
        return hash_hmac('sha256', "{$type}:{$normalizedKey}", (string) config('app.key'));
    }

    public function masked(): string
    {
        $key = (string) $this->key;
        $length = mb_strlen($key);
        $visible = $length > 8 ? 4 : min(2, $length);

        return str_repeat('•', max($length - $visible, 3)).mb_substr($key, $length - $visible);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
