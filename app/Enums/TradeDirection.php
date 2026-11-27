<?php

namespace App\Enums;

enum TradeDirection: string
{
    case Call = 'call';
    case Put = 'put';
}
