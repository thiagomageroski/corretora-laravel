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
            $table->text('document_number')->nullable()->after('phone');
            $table->string('document_hash', 64)->nullable()->unique()->after('document_number');
            $table->date('birth_date')->nullable()->after('document_hash');
            $table->timestamp('real_terms_accepted_at')->nullable()->after('birth_date');
        });

        Schema::create('deposits', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount_cents');
            $table->string('currency', 8);
            $table->string('status', 16)->index();
            $table->string('provider', 16);
            $table->string('provider_transaction_id', 64)->nullable()->unique();
            $table->string('provider_status', 24)->nullable();
            $table->string('webhook_token_hash', 64)->nullable();
            $table->text('pix_code')->nullable();
            $table->text('pix_image_url')->nullable();
            $table->unsignedBigInteger('fee_cents')->nullable();
            $table->string('review_reason')->nullable();
            $table->string('failure_reason')->nullable();
            $table->string('idempotency_key', 64);
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('credited_at')->nullable();
            $table->timestamp('reversed_at')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('withdrawals', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount_cents');
            $table->string('currency', 8);
            $table->string('status', 16)->index();
            $table->string('pix_key_type', 16);
            $table->text('pix_key');
            $table->string('requested_ip', 45)->nullable();
            $table->string('provider', 16);
            $table->string('provider_transfer_id', 64)->nullable()->unique();
            $table->string('provider_status', 24)->nullable();
            $table->string('webhook_token_hash', 64)->nullable();
            $table->unsignedBigInteger('fee_cents')->nullable();
            $table->unsignedBigInteger('received_cents')->nullable();
            $table->string('end_to_end_id', 64)->nullable();
            $table->string('failure_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('review_note')->nullable();
            $table->string('idempotency_key', 64);
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('payment_webhooks', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 16);
            $table->string('event', 48)->nullable();
            $table->string('entity_id', 64)->nullable()->index();
            $table->json('payload');
            $table->boolean('token_valid')->default(false);
            $table->string('status', 16)->index();
            $table->string('error')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('received_at');
            $table->timestamp('processed_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_webhooks');
        Schema::dropIfExists('withdrawals');
        Schema::dropIfExists('deposits');

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['document_hash']);
            $table->dropColumn(['document_number', 'document_hash', 'birth_date', 'real_terms_accepted_at']);
        });
    }
};
