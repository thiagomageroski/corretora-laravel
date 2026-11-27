<?php

namespace App\Actions\Fortify;

use App\Domain\Audit\AuditLogger;
use App\Domain\Wallet\DemoWalletManager;
use App\Models\User;
use App\Rules\BrazilianPhone;
use App\Rules\PlainAsciiEmail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    public function __construct(
        private DemoWalletManager $demoWallets,
        private AuditLogger $audit,
    ) {}

    /**
     * Validate and create a newly registered user with their demo wallet.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', new PlainAsciiEmail, 'max:255', Rule::unique(User::class)],
            'phone' => ['nullable', 'string', 'max:20', new BrazilianPhone],
            'password' => $this->passwordRules(),
            'accept_terms' => ['accepted'],
        ])->validate();

        return DB::transaction(function () use ($input): User {
            $user = User::query()->create([
                'first_name' => $input['first_name'],
                'last_name' => $input['last_name'],
                'email' => $input['email'],
                'phone' => $input['phone'] ?? null,
                'password' => $input['password'],
            ]);

            $this->demoWallets->provisionFor($user);
            $this->audit->record('user.registered', $user, $user->id);

            return $user;
        });
    }
}
