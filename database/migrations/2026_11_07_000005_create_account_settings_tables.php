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
        Schema::create('user_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('chart_type', 16);
            $table->string('chart_interval', 8);
            $table->json('chart_indicators');
            $table->boolean('chart_animations');
            $table->bigInteger('default_stake_cents');
            $table->unsignedInteger('default_duration_seconds');
            $table->boolean('confirm_before_trade');
            $table->boolean('sound_on_settlement');
            $table->boolean('hide_balance');
            $table->string('timezone', 64);
            $table->timestamps();
        });

        Schema::create('login_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event', 16);
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('created_at');

            $table->index(['user_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('login_events');
        Schema::dropIfExists('user_preferences');
    }
};
