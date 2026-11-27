<?php

namespace App\Models;

use App\Enums\Environment;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Appends;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;

#[Fillable(['first_name', 'last_name', 'email', 'phone', 'password'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'document_number', 'document_hash', 'avatar_path'])]
#[Appends(['name'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable;

    /**
     * Mirrors the column default so a just-created user is complete in memory.
     *
     * @var array<string, string>
     */
    protected $attributes = ['status' => 'active', 'is_admin' => false];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'two_factor_confirmed_at' => 'datetime',
            'password' => 'hashed',
            'document_number' => 'encrypted',
            'birth_date' => 'immutable_date',
            'real_terms_accepted_at' => 'immutable_datetime',
            'closed_at' => 'immutable_datetime',
            'deletion_requested_at' => 'immutable_datetime',
            'is_admin' => 'boolean',
        ];
    }

    /**
     * @return Attribute<string, never>
     */
    protected function name(): Attribute
    {
        return Attribute::get(fn (): string => trim("{$this->first_name} {$this->last_name}"));
    }

    /**
     * @return HasMany<Account, $this>
     */
    public function accounts(): HasMany
    {
        return $this->hasMany(Account::class);
    }

    /**
     * @return BelongsToMany<Asset, $this>
     */
    public function favoriteAssets(): BelongsToMany
    {
        return $this->belongsToMany(Asset::class, 'favorites')->withPivot('created_at');
    }

    /**
     * @return HasOne<UserPreference, $this>
     */
    public function preference(): HasOne
    {
        return $this->hasOne(UserPreference::class)->withDefault(UserPreference::DEFAULTS);
    }

    /**
     * @return HasMany<TradingPosition, $this>
     */
    public function positions(): HasMany
    {
        return $this->hasMany(TradingPosition::class);
    }

    /**
     * @return HasMany<PixKey, $this>
     */
    public function pixKeys(): HasMany
    {
        return $this->hasMany(PixKey::class);
    }

    /**
     * Address of the profile photo, versioned so a new upload is not served from cache.
     */
    public function avatarUrl(): ?string
    {
        return $this->avatar_path === null ? null : route('account.avatar', ['v' => substr(md5($this->avatar_path), 0, 8)], absolute: false);
    }

    /**
     * @return HasMany<Deposit, $this>
     */
    public function deposits(): HasMany
    {
        return $this->hasMany(Deposit::class);
    }

    /**
     * @return HasMany<Withdrawal, $this>
     */
    public function withdrawals(): HasMany
    {
        return $this->hasMany(Withdrawal::class);
    }

    public function demoWallet(): Wallet
    {
        return $this->walletQuery(Environment::Demo)->firstOrFail();
    }

    public function findDemoWallet(): ?Wallet
    {
        return $this->walletQuery(Environment::Demo)->first();
    }

    public function findRealWallet(): ?Wallet
    {
        return $this->walletQuery(Environment::Real)->first();
    }

    public function findWallet(Environment $environment): ?Wallet
    {
        return $this->walletQuery($environment)->first();
    }

    /**
     * @return Builder<Wallet>
     */
    private function walletQuery(Environment $environment): Builder
    {
        return Wallet::query()
            ->with('account')
            ->whereRelation('account', 'user_id', $this->id)
            ->whereRelation('account', 'environment', $environment->value);
    }
}
