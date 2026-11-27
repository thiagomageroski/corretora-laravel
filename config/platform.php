<?php

return [
    /*
    | Master switch for real money. Off: no new deposits and no new real trades.
    | Settlements, confirmations of PIX already paid and withdrawals keep
    | working, so balances are never stranded.
    */
    'real_money_enabled' => (bool) env('REAL_MONEY_ENABLED', false),

    'demo' => [
        'currency' => 'BRL',
        'initial_balance_cents' => (int) env('DEMO_INITIAL_BALANCE_CENTS', 1_000_000),
        'reset_options_cents' => [100_000, 1_000_000, 5_000_000, 10_000_000],
    ],

    'real' => [
        'currency' => 'BRL',
        'minimum_age' => 18,
        'min_deposit_cents' => (int) env('REAL_MIN_DEPOSIT_CENTS', 2_000),
        'max_deposit_cents' => (int) env('REAL_MAX_DEPOSIT_CENTS', 5_000_000),
        'max_pending_deposits' => 3,
        'deposit_expiry_minutes' => 30,
        'min_withdrawal_cents' => (int) env('REAL_MIN_WITHDRAWAL_CENTS', 2_000),
        'max_withdrawal_cents' => (int) env('REAL_MAX_WITHDRAWAL_CENTS', 5_000_000),
        'daily_withdrawal_limit_cents' => (int) env('REAL_DAILY_WITHDRAWAL_LIMIT_CENTS', 10_000_000),
        /*
        | Withdrawals up to this amount are sent without an operator. 0 means every
        | withdrawal waits for `php artisan payments:withdrawals approve`.
        */
        'auto_approve_withdrawal_max_cents' => (int) env('REAL_AUTO_APPROVE_WITHDRAWAL_MAX_CENTS', 0),
        /*
        | Hold deposits paid from a CPF other than the account holder's for review
        | instead of crediting them.
        */
        'require_payer_match' => (bool) env('REAL_REQUIRE_PAYER_MATCH', true),
        // Withdrawal fee charged by the gateway: true deducts it from what the user receives.
        'withdrawal_fee_paid_by_user' => (bool) env('REAL_WITHDRAWAL_FEE_PAID_BY_USER', true),
    ],

    'trading' => [
        'rules_version' => 1,
        'min_stake_cents' => 100,
        'max_stake_cents' => 100_000,
        'max_open_positions' => 20,
        'durations_seconds' => [60, 300, 900, 1800, 3600],
        'default_payout_bps' => (int) env('DEMO_DEFAULT_PAYOUT_BPS', 8500),
        'max_entry_quote_age_seconds' => 5,
        'settlement_grace_seconds' => 120,
    ],

    /*
    | Who runs the platform, as shown in the terms, privacy and cookie policies.
    | Editable in the admin panel; empty fields are simply left out of the pages.
    */
    'legal' => [
        'company_name' => env('LEGAL_COMPANY_NAME'),
        'company_document' => env('LEGAL_COMPANY_DOCUMENT'),
        'address' => env('LEGAL_ADDRESS'),
        'contact_email' => env('LEGAL_CONTACT_EMAIL'),
        'privacy_email' => env('LEGAL_PRIVACY_EMAIL'),
    ],
];
