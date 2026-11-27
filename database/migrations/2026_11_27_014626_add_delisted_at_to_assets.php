<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Remembers which assets the daily catalog sync switched off because the
 * exchange stopped listing them. Only those come back on their own when they
 * are listed again; an asset an administrator switched off stays off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table): void {
            $table->timestamp('delisted_at')->nullable()->after('is_active');
        });

        // Assets already switched off by the sync, with no administrator change after it, count as delisted.
        $switchedOff = DB::table('assets')->where('is_active', false)->whereNotNull('provider_code')->pluck('id');

        foreach ($switchedOff as $assetId) {
            $latest = DB::table('audit_logs')
                ->where('subject_type', 'App\\Models\\Asset')
                ->where('subject_id', $assetId)
                ->whereIn('action', ['catalog.availability_changed', 'admin.asset_updated'])
                ->orderByDesc('id')
                ->first(['action', 'created_at']);

            if ($latest?->action === 'catalog.availability_changed') {
                DB::table('assets')->where('id', $assetId)->update(['delisted_at' => $latest->created_at]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table): void {
            $table->dropColumn('delisted_at');
        });
    }
};
