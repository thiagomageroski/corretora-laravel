<?php

namespace App\Enums;

enum CandleInterval: string
{
    case OneSecond = '1s';
    case OneMinute = '1m';
    case FiveMinutes = '5m';
    case FifteenMinutes = '15m';
    case ThirtyMinutes = '30m';
    case OneHour = '1h';
    case FourHours = '4h';
    case OneDay = '1d';
}
