<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable()->after('phone');
            $table->timestamp('closed_at')->nullable()->after('real_terms_accepted_at');
            $table->timestamp('deletion_requested_at')->nullable()->after('closed_at');
        });

        Schema::table('user_preferences', function (Blueprint $table) {
            $table->unsignedSmallInteger('interface_scale')->default(100);
            $table->boolean('chart_position_lines')->default(true);
            $table->boolean('chart_stake_labels')->default(true);
            $table->boolean('chart_legend')->default(true);
            $table->boolean('keyboard_shortcuts')->default(false);
            $table->boolean('notify_settlement_toast')->default(true);
            $table->boolean('email_transactions')->default(true);
            $table->boolean('email_product_news')->default(true);
            $table->boolean('email_promotions')->default(false);
        });

        Schema::create('pix_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 16);
            $table->text('key');
            $table->string('key_hash', 64);
            $table->string('label', 40)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'key_hash']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pix_keys');

        Schema::table('user_preferences', function (Blueprint $table) {
            $table->dropColumn([
                'interface_scale', 'chart_position_lines', 'chart_stake_labels', 'chart_legend', 'keyboard_shortcuts',
                'notify_settlement_toast', 'email_transactions', 'email_product_news', 'email_promotions',
            ]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['avatar_path', 'closed_at', 'deletion_requested_at']);
        });
    }
};
