<?php

namespace App\Enums;

enum WithdrawalStatus: string
{
    /**
     * Funds reserved, waiting for an operator.
     */
    case Requested = 'requested';

    /**
     * Approved and being sent to the provider.
     */
    case Sending = 'sending';

    /**
     * Accepted by the provider, waiting for the bank.
     */
    case Processing = 'processing';

    case Completed = 'completed';
    case Failed = 'failed';
    case Rejected = 'rejected';
    case Canceled = 'canceled';

    public function isFinal(): bool
    {
        return in_array($this, [self::Completed, self::Failed, self::Rejected, self::Canceled], true);
    }
}
