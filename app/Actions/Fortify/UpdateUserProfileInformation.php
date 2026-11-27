<?php

namespace App\Actions\Fortify;

use App\Domain\Audit\AuditLogger;
use App\Models\User;
use App\Rules\BrazilianPhone;
use App\Rules\PlainAsciiEmail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\UpdatesUserProfileInformation;

class UpdateUserProfileInformation implements UpdatesUserProfileInformation
{
    public function __construct(private AuditLogger $audit) {}

    /**
     * Validate and update the given user's profile information.
     *
     * @param  array<string, string>  $input
     */
    public function update(User $user, array $input): void
    {
        Validator::make($input, [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'phone' => [$user->findRealWallet() !== null ? 'required' : 'nullable', 'string', 'max:20', new BrazilianPhone],
            'email' => ['required', 'string', 'email', new PlainAsciiEmail, 'max:255', Rule::unique('users')->ignore($user->id)],
        ], ['phone.required' => 'O celular é obrigatório para quem tem conta real: ele é exigido nos depósitos PIX.'])->validateWithBag('updateProfileInformation');

        $user->forceFill([
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'phone' => $input['phone'] ?? null,
            'email' => $input['email'],
        ])->save();

        $this->audit->record('account.profile_updated', $user, $user->id, ['changed' => array_keys($user->getChanges())]);
    }
}
