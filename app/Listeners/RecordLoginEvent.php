<?php

namespace App\Listeners;

use App\Models\LoginEvent;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

class RecordLoginEvent
{
    public function handleLogin(Login $event): void
    {
        $this->record($event->user, 'login');
    }

    public function handleFailed(Failed $event): void
    {
        $this->record($event->user, 'failed');
    }

    public function handleLogout(Logout $event): void
    {
        $this->record($event->user, 'logout');
    }

    private function record(mixed $user, string $event): void
    {
        if (! $user instanceof User) {
            return;
        }

        LoginEvent::query()->create([
            'user_id' => $user->id,
            'event' => $event,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }
}
