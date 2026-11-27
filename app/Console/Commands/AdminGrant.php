<?php

namespace App\Console\Commands;

use App\Domain\Audit\AuditLogger;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Grants or removes access to the admin panel. The first administrator can
 * only be created here, from the server; afterwards admins can also manage
 * each other from the panel.
 */
#[Signature('admin:grant {email : E-mail of an existing account} {--revoke : Remove the access instead of granting it}')]
#[Description('Grant (or with --revoke, remove) access to the admin panel for an existing account')]
class AdminGrant extends Command
{
    public function handle(AuditLogger $audit): int
    {
        $user = User::query()->where('email', Str::lower(trim((string) $this->argument('email'))))->first();

        if ($user === null) {
            $this->error('Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar no site primeiro.');

            return self::FAILURE;
        }

        $grant = ! $this->option('revoke');
        $user->forceFill(['is_admin' => $grant])->save();
        $audit->record($grant ? 'admin.granted' : 'admin.revoked', $user, null, ['via' => 'console']);

        $this->info($grant ? "{$user->email} agora é administrador: acesse /admin." : "{$user->email} não é mais administrador.");

        return self::SUCCESS;
    }
}
