<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('trading:settle --once')->everyMinute()->withoutOverlapping();
Schedule::command('market:poll twelvedata --limit='.(int) config('market.providers.twelvedata.credits_per_minute'))->everyMinute()->withoutOverlapping();
Schedule::command('market:sync-catalog')->daily();
Schedule::command('wallet:reconcile')->dailyAt('03:00');
Schedule::command('payments:reconcile')->everyTwoMinutes()->withoutOverlapping();
