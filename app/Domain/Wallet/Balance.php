<?php

namespace App\Domain\Wallet;

final readonly class Balance
{
    public function __construct(
        public int $availableCents,
        public int $reservedCents,
    ) {}
}
