<?php

namespace App\Enums;

enum OrderStatus: string
{
    case Accepted = 'accepted';
    case Rejected = 'rejected';
}
