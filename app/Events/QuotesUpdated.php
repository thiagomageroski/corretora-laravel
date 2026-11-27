<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

class QuotesUpdated implements ShouldBroadcastNow
{
    use Dispatchable;

    /**
     * @param  list<array{asset_id: int, price: string, open_24h: ?string, source_at: string, traded?: string}>  $quotes
     */
    public function __construct(public array $quotes) {}

    public function broadcastOn(): Channel
    {
        return new Channel('market.quotes');
    }

    public function broadcastAs(): string
    {
        return 'quotes.updated';
    }
}
