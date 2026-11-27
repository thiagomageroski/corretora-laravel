<?php

namespace App\Domain\Account;

use App\Domain\Market\AssetViews;
use App\Enums\DepositStatus;
use App\Models\User;

/**
 * The "first steps" checklist, computed from what the user actually did.
 * A later step proves the ones it depends on: whoever traded chose an asset,
 * and whoever deposited opened the real account.
 */
class Onboarding
{
    /**
     * @return array{progress: int, done: int, total: int, steps: list<array{key: string, title: string, done: bool}>}
     */
    public function for(User $user): array
    {
        $traded = $user->positions()->exists();
        $deposited = $user->deposits()->where('status', DepositStatus::Completed)->exists();

        $steps = [
            ['key' => 'account', 'title' => 'Crie sua conta', 'done' => true],
            ['key' => 'asset', 'title' => 'Escolha um ativo', 'done' => $traded || AssetViews::any($user)],
            ['key' => 'trade', 'title' => 'Faça sua primeira operação', 'done' => $traded],
            ['key' => 'real', 'title' => 'Abra sua conta real', 'done' => $deposited || $user->findRealWallet() !== null],
            ['key' => 'deposit', 'title' => 'Faça seu primeiro depósito', 'done' => $deposited],
        ];

        $done = count(array_filter($steps, fn (array $step): bool => $step['done']));
        $total = count($steps);

        return ['progress' => intdiv($done * 100, $total), 'done' => $done, 'total' => $total, 'steps' => $steps];
    }
}
