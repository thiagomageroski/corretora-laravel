<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    /*
    | PIX deposits and payouts. Keys are read from the environment only and are
    | never sent to the browser or written to logs.
    */
    'amplopay' => [
        'base_url' => env('AMPLOPAY_BASE_URL', 'https://app.amplopay.com/api/v1'),
        'public_key' => env('AMPLOPAY_PUBLIC_KEY'),
        'secret_key' => env('AMPLOPAY_SECRET_KEY'),
        // Optional account-wide token. Each charge and transfer also returns its own.
        'webhook_token' => env('AMPLOPAY_WEBHOOK_TOKEN'),
        'timeout_seconds' => (int) env('AMPLOPAY_TIMEOUT_SECONDS', 15),
        // AmploPay blocks status lookups ("polling") and reports changes only by webhook. Enable only if your account allows lookups.
        'status_lookups' => (bool) env('AMPLOPAY_STATUS_LOOKUPS', false),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
