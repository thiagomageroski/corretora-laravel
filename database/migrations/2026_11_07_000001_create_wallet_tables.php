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
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('environment', 16);
            $table->string('status', 16)->default('active');
            $table->timestamps();

            $table->unique(['user_id', 'environment']);
        });

        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->unique()->constrained()->restrictOnDelete();
            $table->string('currency', 8);
            $table->timestamps();
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('seq');
            $table->string('type', 32);
            $table->bigInteger('available_delta_cents');
            $table->bigInteger('reserved_delta_cents');
            $table->bigInteger('available_after_cents');
            $table->bigInteger('reserved_after_cents');
            $table->string('idempotency_key', 128);
            $table->nullableMorphs('reference');
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('reason')->nullable();
            $table->timestamp('created_at');

            $table->unique(['wallet_id', 'seq']);
            $table->unique(['wallet_id', 'idempotency_key']);
        });

        DatabaseGuards::appendOnly('wallet_transactions');
        DatabaseGuards::rejectInsertWhen(
            'wallet_transactions',
            'non_negative_balance',
            'NEW.available_after_cents < 0 OR NEW.reserved_after_cents < 0',
            'Ledger balance cannot be negative',
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('wallet_transactions');
        Schema::dropIfExists('wallets');
        Schema::dropIfExists('accounts');
    }
};
