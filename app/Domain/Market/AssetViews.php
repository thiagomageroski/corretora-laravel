<?php

namespace App\Domain\Market;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The assets a user opened, newest first. Feeds the "recent" list on the
 * trading page and the "choose an asset" first step.
 */
class AssetViews
{
    public static function record(User $user, int $assetId): void
    {
        DB::table('asset_views')->upsert(
            ['user_id' => $user->id, 'asset_id' => $assetId, 'viewed_at' => now()],
            ['user_id', 'asset_id'],
            ['viewed_at'],
        );
    }

    public static function any(User $user): bool
    {
        return DB::table('asset_views')->where('user_id', $user->id)->exists();
    }
}
