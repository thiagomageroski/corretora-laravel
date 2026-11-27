<?php

namespace App\Enums;

enum DepositStatus: string
{
    case Pending = 'pending';
    case Completed = 'completed';
    case Review = 'review';
    case Failed = 'failed';
    case Expired = 'expired';
    case Refunded = 'refunded';
    case ChargedBack = 'charged_back';

    /**
     * States the provider can still move forward.
     */
    public function isOpen(): bool
    {
        return $this === self::Pending;
    }
}
