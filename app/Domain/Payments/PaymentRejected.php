<?php

namespace App\Domain\Payments;

use RuntimeException;

/**
 * A deposit, withdrawal or real-account request refused by a platform rule or
 * by the provider. The code is stable for the client; the message is for people.
 */
final class PaymentRejected extends RuntimeException
{
    private const MESSAGES = [
        'real_money_disabled' => 'A conta real está temporariamente indisponível.',
        'payments_not_configured' => 'Os pagamentos ainda não foram configurados.',
        'webhook_unavailable' => 'Depósitos e saques indisponíveis no momento.',
        'real_account_missing' => 'Abra sua conta real antes de continuar.',
        'real_account_exists' => 'Sua conta real já está aberta.',
        'account_inactive' => 'Sua conta real está bloqueada. Fale com o suporte.',
        'payer_data_missing' => 'Cadastre seu celular em Conta > Dados pessoais para depositar.',
        'document_in_use' => 'Este CPF já está vinculado a outra conta.',
        'underage' => 'A conta real é exclusiva para maiores de idade.',
        'amount_out_of_range' => 'O valor está fora dos limites permitidos.',
        'too_many_pending_deposits' => 'Você já tem cobranças PIX em aberto. Pague ou aguarde que expirem.',
        'daily_limit_reached' => 'Este saque ultrapassa o limite diário.',
        'insufficient_funds' => 'Saldo real disponível insuficiente.',
        'invalid_pix_key' => 'Chave PIX inválida para o tipo escolhido.',
        'pix_key_not_owned' => 'A chave PIX do tipo CPF precisa ser o CPF do titular da conta.',
        'open_positions' => 'Aguarde o encerramento das suas operações abertas.',
        'withdrawal_in_progress' => 'Você tem um saque em andamento. Aguarde a conclusão.',
        'balance_remaining' => 'Saque todo o saldo da conta real antes de pedir a exclusão.',
        'pix_key_exists' => 'Esta chave PIX já está salva.',
        'pix_key_limit' => 'Você atingiu o limite de chaves PIX salvas.',
        'invalid_state' => 'Esta solicitação não está mais no estado esperado.',
        'not_cancelable' => 'Este saque já está em processamento e não pode ser cancelado.',
        'provider_rejected' => 'O provedor de pagamentos recusou a solicitação.',
        'provider_unavailable' => 'O provedor de pagamentos não respondeu. Tente novamente em instantes.',
    ];

    public function __construct(public readonly string $reason, ?string $detail = null)
    {
        $message = self::MESSAGES[$reason] ?? 'Solicitação recusada.';

        parent::__construct($detail === null ? $message : "{$message} {$detail}");
    }
}
