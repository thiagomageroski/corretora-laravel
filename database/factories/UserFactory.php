<?php

namespace Database\Factories;

use App\Domain\Wallet\DemoWalletManager;
use App\Domain\Wallet\LedgerService;
use App\Domain\Wallet\RealAccountManager;
use App\Enums\Environment;
use App\Enums\LedgerEntryType;
use App\Models\Account;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * An administrator of the platform.
     */
    public function admin(): static
    {
        return $this->state(fn (): array => ['is_admin' => true]);
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * A user with the demo wallet that registration would have provisioned.
     */
    public function withDemoWallet(): static
    {
        return $this->afterCreating(function (User $user): void {
            app(DemoWalletManager::class)->provisionFor($user);
        });
    }

    /**
     * A user who opened the real account, optionally with a confirmed balance.
     */
    public function withRealAccount(int $balanceCents = 0): static
    {
        return $this->afterCreating(function (User $user) use ($balanceCents): void {
            $cpf = self::cpf();
            $user->forceFill([
                'document_number' => $cpf,
                'document_hash' => RealAccountManager::documentHash($cpf),
                'birth_date' => now()->subYears(30)->toDateString(),
                'phone' => '(11) 99999-9999',
                'real_terms_accepted_at' => now(),
            ])->save();

            $account = Account::query()->create(['user_id' => $user->id, 'environment' => Environment::Real, 'status' => RealAccountManager::STATUS_ACTIVE]);
            $wallet = Wallet::query()->create(['account_id' => $account->id, 'currency' => 'BRL']);

            if ($balanceCents > 0) {
                app(LedgerService::class)->post($wallet, LedgerEntryType::DepositCredit, $balanceCents, 0, 'factory-balance');
            }
        });
    }

    /**
     * A random CPF with valid check digits.
     */
    public static function cpf(): string
    {
        $digits = array_map(fn (): int => random_int(0, 9), range(1, 9));

        foreach ([9, 10] as $length) {
            $sum = 0;

            for ($i = 0; $i < $length; $i++) {
                $sum += $digits[$i] * ($length + 1 - $i);
            }

            $digits[] = ($sum * 10) % 11 % 10;
        }

        return implode('', $digits);
    }
}
