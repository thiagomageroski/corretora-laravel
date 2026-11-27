<?php

use App\Support\DatabaseGuards;
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
        Schema::create('trading_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->foreignId('asset_id')->constrained()->restrictOnDelete();
            $table->string('direction', 8);
            $table->bigInteger('stake_cents');
            $table->unsignedInteger('duration_seconds');
            $table->string('status', 16);
            $table->string('reject_reason', 64)->nullable();
            $table->string('idempotency_key', 128);
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
        });

        Schema::create('trading_positions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('trading_orders')->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->foreignId('asset_id')->constrained()->restrictOnDelete();
            $table->string('direction', 8);
            $table->bigInteger('stake_cents');
            $table->unsignedInteger('payout_rate_bps');
            $table->unsignedSmallInteger('rules_version');
            $table->decimal('entry_price', 24, 10);
            $table->string('entry_source', 32);
            $table->timestamp('entry_source_at', 3);
            $table->timestamp('opened_at', 3);
            $table->timestamp('expires_at')->index();
            $table->decimal('close_price', 24, 10)->nullable();
            $table->string('close_source', 32)->nullable();
            $table->timestamp('close_source_at', 3)->nullable();
            $table->string('result', 16)->nullable()->index();
            $table->bigInteger('returned_cents')->nullable();
            $table->string('void_reason', 64)->nullable();
            $table->timestamp('settled_at', 3)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'settled_at']);
        });

        Schema::create('trading_executions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('position_id')->constrained('trading_positions')->restrictOnDelete();
            $table->string('event', 16);
            $table->json('payload');
            $table->timestamp('created_at', 3);

            $table->unique(['position_id', 'event']);
        });

        DatabaseGuards::appendOnly('trading_executions');
        DatabaseGuards::writeOnceAfterSettlement('trading_positions');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trading_executions');
        Schema::dropIfExists('trading_positions');
        Schema::dropIfExists('trading_orders');
    }
};
