<?php

namespace App\Enums;

enum TradeResult: string
{
    case Won = 'won';
    case Lost = 'lost';
    case Neutral = 'neutral';
    case Voided = 'voided';
}
