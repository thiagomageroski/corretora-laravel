<?php

return [
    /*
    | DNS server for the asynchronous stream client. Set explicitly because its
    | automatic discovery relies on wmic, which no longer ships with Windows 11.
    */
    'stream_dns_server' => env('MARKET_STREAM_DNS_SERVER', '1.1.1.1'),

    'providers' => [
        'binance' => [
            'name' => 'Binance (dados públicos)',
            'rest_url' => env('BINANCE_REST_URL', 'https://data-api.binance.vision'),
            'stream_url' => env('BINANCE_STREAM_URL', 'wss://data-stream.binance.vision'),
            'license_note' => 'Dados públicos. Uso comercial pode exigir consentimento escrito da Binance.',
        ],
        'twelvedata' => [
            'name' => 'Twelve Data',
            'rest_url' => env('TWELVEDATA_REST_URL', 'https://api.twelvedata.com'),
            'api_key' => env('TWELVEDATA_API_KEY'),
            'credits_per_minute' => (int) env('TWELVEDATA_CREDITS_PER_MINUTE', 8),
            'license_note' => 'O plano gratuito não permite exibição a terceiros. Exibição pública exige plano Venture ou superior.',
        ],
    ],

    /*
    | Regular trading sessions. Exchange holidays are not modelled yet, and the
    | interface says so.
    */
    'sessions' => [
        'always' => ['label' => '24 horas, 7 dias', 'timezone' => 'UTC', 'always_open' => true],
        'fx' => ['label' => 'Dom 17h a sex 17h (Nova York)', 'timezone' => 'America/New_York', 'week_open' => [0, '17:00'], 'week_close' => [5, '17:00']],
        'us_equities' => ['label' => 'Seg a sex, 09:30 às 16:00 (Nova York)', 'timezone' => 'America/New_York', 'days' => [1, 2, 3, 4, 5], 'open' => '09:30', 'close' => '16:00'],
        'eu_equities' => ['label' => 'Seg a sex, 09:00 às 17:30 (Frankfurt)', 'timezone' => 'Europe/Berlin', 'days' => [1, 2, 3, 4, 5], 'open' => '09:00', 'close' => '17:30'],
        'uk_equities' => ['label' => 'Seg a sex, 08:00 às 16:30 (Londres)', 'timezone' => 'Europe/London', 'days' => [1, 2, 3, 4, 5], 'open' => '08:00', 'close' => '16:30'],
        'jp_equities' => ['label' => 'Seg a sex, 09:00 às 15:30 (Tóquio)', 'timezone' => 'Asia/Tokyo', 'days' => [1, 2, 3, 4, 5], 'open' => '09:00', 'close' => '15:30'],
        'br_equities' => ['label' => 'Seg a sex, 10:00 às 17:00 (São Paulo)', 'timezone' => 'America/Sao_Paulo', 'days' => [1, 2, 3, 4, 5], 'open' => '10:00', 'close' => '17:00'],
        'commodities' => ['label' => 'Dom 18h a sex 17h (Nova York), com pausas diárias não modeladas', 'timezone' => 'America/New_York', 'week_open' => [0, '18:00'], 'week_close' => [5, '17:00']],
    ],
];
