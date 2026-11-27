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
        Schema::create('asset_categories', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name');
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_category_id')->constrained()->restrictOnDelete();
            $table->string('symbol', 32)->unique();
            $table->string('name');
            $table->string('provider_code', 32)->nullable()->index();
            $table->string('provider_symbol', 32)->nullable();
            $table->string('price_basis', 8)->nullable();
            $table->string('session', 32);
            $table->unsignedInteger('payout_rate_bps');
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('market_quotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->unique()->constrained()->restrictOnDelete();
            $table->decimal('price', 24, 10);
            $table->decimal('open_24h', 24, 10)->nullable();
            $table->decimal('high_24h', 24, 10)->nullable();
            $table->decimal('low_24h', 24, 10)->nullable();
            $table->decimal('volume_24h', 32, 10)->nullable();
            $table->string('source', 32);
            $table->string('delivery', 16);
            $table->timestamp('source_at', 3);
            $table->timestamp('received_at', 3);
            $table->timestamps();
        });

        Schema::create('market_candles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained()->restrictOnDelete();
            $table->string('interval', 8);
            $table->timestamp('open_time');
            $table->decimal('open', 24, 10);
            $table->decimal('high', 24, 10);
            $table->decimal('low', 24, 10);
            $table->decimal('close', 24, 10);
            $table->decimal('volume', 32, 10)->nullable();
            $table->string('source', 32);

            $table->unique(['asset_id', 'interval', 'open_time']);
        });

        Schema::create('favorites', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['user_id', 'asset_id']);
        });

        Schema::create('asset_views', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->timestamp('viewed_at');

            $table->primary(['user_id', 'asset_id']);
            $table->index(['user_id', 'viewed_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('asset_views');
        Schema::dropIfExists('favorites');
        Schema::dropIfExists('market_candles');
        Schema::dropIfExists('market_quotes');
        Schema::dropIfExists('assets');
        Schema::dropIfExists('asset_categories');
    }
};
