<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Rows still holding the previous defaults move to the new ones. Any other
     * combination was chosen by the user and stays untouched.
     */
    public function up(): void
    {
        DB::table('user_preferences')
            ->where('chart_type', 'area')
            ->where('chart_interval', '1s')
            ->update([
                'chart_type' => 'candles',
                'chart_interval' => '1m',
                'chart_indicators' => json_encode(['volume']),
            ]);
    }

    /**
     * The previous defaults cannot be told apart from later choices, so there is nothing to undo.
     */
    public function down(): void
    {
        //
    }
};
