<?php

namespace App\Providers;

use App\Domain\Platform\PlatformSettings;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Behind a TLS-terminating proxy, never generate http:// links for an https site.
        if ($this->app->isProduction() && str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        // Limits and rules changed in the admin panel take the place of the configured defaults.
        $this->app->make(PlatformSettings::class)->apply();

        // The admin panel is for active accounts flagged by `php artisan admin:grant`.
        Gate::define('admin', fn (User $user): bool => $user->is_admin && $user->status === 'active');
    }
}
