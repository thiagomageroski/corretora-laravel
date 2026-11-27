<?php

namespace App\Domain\Trading;

use RuntimeException;

final class TradeRejected extends RuntimeException
{
    private const MESSAGES = [
        'account_inactive' => 'Sua conta não está ativa.',
        'asset_inactive' => 'Este ativo está desativado.',
        'asset_not_tradable' => 'Este ativo está disponível só para acompanhar, sem negociação no momento.',
        'market_closed' => 'O mercado deste ativo está fechado.',
        'quote_unavailable' => 'Sem cotação recente para este ativo. Tente novamente em instantes.',
        'stake_out_of_range' => 'O valor está fora dos limites permitidos.',
        'duration_not_allowed' => 'Prazo não disponível.',
        'too_many_open_positions' => 'Você atingiu o limite de operações abertas.',
        'insufficient_funds' => 'Saldo insuficiente para esta operação.',
        'real_account_missing' => 'Abra sua conta real para operar com dinheiro real.',
        'real_money_disabled' => 'As operações com dinheiro real estão temporariamente suspensas.',
    ];

    public function __construct(public readonly string $reason)
    {
        parent::__construct(self::MESSAGES[$reason] ?? 'Operação recusada.');
    }
}
