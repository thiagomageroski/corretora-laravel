<?php

namespace App\Enums;

enum QuoteDelivery: string
{
    case Stream = 'stream';
    case Polling = 'polling';
}
