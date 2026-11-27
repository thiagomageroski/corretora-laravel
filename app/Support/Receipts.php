<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Transaction receipts by e-mail. Sent only after the database transaction
 * commits, only when the user wants them, and a mail failure never undoes the
 * money movement it describes.
 */
final class Receipts
{
    public static function send(User $user, Notification $notification): void
    {
        DB::afterCommit(function () use ($user, $notification): void {
            if (! $user->preference->toPreferences()['email_transactions']) {
                return;
            }

            try {
                $user->notify($notification);
            } catch (Throwable $exception) {
                report($exception);
            }
        });
    }
}
