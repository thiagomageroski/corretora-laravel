<?php

namespace App\Domain\Wallet;

use App\Domain\Audit\AuditLogger;
use App\Domain\Payments\PaymentRejected;
use App\Enums\Environment;
use App\Models\Account;
use App\Models\User;
use App\Models\Wallet;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Opens the real-money account. It is a separate account and wallet from the
 * demo one: no entry type moves money between them.
 */
class RealAccountManager
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_FROZEN = 'frozen';

    public function __construct(private AuditLogger $audit) {}

    /**
     * @throws PaymentRejected
     */
    public function open(User $user, string $cpf, CarbonImmutable $birthDate, string $phone): Wallet
    {
        if (! config('platform.real_money_enabled')) {
            throw new PaymentRejected('real_money_disabled');
        }

        if ($user->findRealWallet() !== null) {
            throw new PaymentRejected('real_account_exists');
        }

        if ($birthDate->diffInYears(CarbonImmutable::today()) < (int) config('platform.real.minimum_age')) {
            throw new PaymentRejected('underage');
        }

        $digits = preg_replace('/\D+/', '', $cpf);

        try {
            return DB::transaction(function () use ($user, $digits, $birthDate, $phone): Wallet {
                $user->forceFill([
                    'document_number' => $digits,
                    'document_hash' => self::documentHash($digits),
                    'birth_date' => $birthDate,
                    'phone' => $phone,
                    'real_terms_accepted_at' => now(),
                ])->save();

                $account = Account::query()->create([
                    'user_id' => $user->id,
                    'environment' => Environment::Real,
                    'status' => self::STATUS_ACTIVE,
                ]);
                $wallet = Wallet::query()->create(['account_id' => $account->id, 'currency' => config('platform.real.currency')]);

                $this->audit->record('account.real_opened', $account, $user->id);

                return $wallet;
            });
        } catch (UniqueConstraintViolationException) {
            throw new PaymentRejected($user->findRealWallet() !== null ? 'real_account_exists' : 'document_in_use');
        }
    }

    /**
     * Keyed hash so the same CPF cannot open two accounts, without making the
     * column itself a readable copy of the document.
     */
    public static function documentHash(string $digits): string
    {
        return hash_hmac('sha256', $digits, (string) config('app.key'));
    }

    public function freeze(Account $account, string $reason, ?int $actorId = null): void
    {
        $account->update(['status' => self::STATUS_FROZEN]);
        $this->audit->record('account.real_frozen', $account, $actorId, ['reason' => $reason]);
    }
}
