<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AssetSentimentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake();
    }

    private function trade(User $user, Asset $asset, string $direction): void
    {
        $this->actingAs($user)->postJson('/api/v1/positions', [
            'asset_id' => $asset->id,
            'direction' => $direction,
            'stake_cents' => 100,
            'duration_seconds' => 60,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertCreated();
    }

    #[Test]
    public function the_share_of_call_positions_is_reported_once_there_are_enough(): void
    {
        $asset = Asset::factory()->withQuote()->create();
        $user = User::factory()->withDemoWallet()->create();

        foreach (range(1, 7) as $ignored) {
            $this->trade($user, $asset, 'call');
        }
        foreach (range(1, 3) as $ignored) {
            $this->trade($user, $asset, 'put');
        }

        $this->actingAs($user)->getJson("/api/v1/assets/{$asset->id}/sentiment")
            ->assertOk()
            ->assertExactJson(['positions' => 10, 'window_hours' => 24, 'call_percent' => 70]);
    }

    #[Test]
    public function too_few_positions_give_no_percentage_instead_of_a_made_up_one(): void
    {
        $asset = Asset::factory()->withQuote()->create();
        $user = User::factory()->withDemoWallet()->create();
        $this->trade($user, $asset, 'call');

        $this->actingAs($user)->getJson("/api/v1/assets/{$asset->id}/sentiment")
            ->assertOk()
            ->assertJsonPath('positions', 1)
            ->assertJsonPath('call_percent', null);
    }

    #[Test]
    public function guests_cannot_read_it(): void
    {
        $asset = Asset::factory()->create();

        $this->getJson("/api/v1/assets/{$asset->id}/sentiment")->assertUnauthorized();
    }
}
