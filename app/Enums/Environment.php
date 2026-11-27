<?php

namespace App\Enums;

enum Environment: string
{
    case Demo = 'demo';
    case Sandbox = 'sandbox';
    case Real = 'real';
}
