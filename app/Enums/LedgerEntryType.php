<?php

namespace App\Enums;

enum LedgerEntryType: string
{
    case DemoGrant = 'demo_grant';
    case DemoReset = 'demo_reset';
    case PositionReserve = 'position_reserve';
    case PositionSettlement = 'position_settlement';
    case DepositCredit = 'deposit_credit';
    case DepositReversal = 'deposit_reversal';
    case WithdrawalReserve = 'withdrawal_reserve';
    case WithdrawalPayout = 'withdrawal_payout';
    case WithdrawalRelease = 'withdrawal_release';
    /** A correction made by an administrator, always with a written reason. */
    case AdminAdjustment = 'admin_adjustment';

    /**
     * Movements that open new real-money exposure. Everything else settles or
     * returns money that is already on the platform, and must keep working
     * when real mode is switched off, or balances would be stranded.
     */
    public function opensExposure(): bool
    {
        return $this === self::PositionReserve;
    }
}
