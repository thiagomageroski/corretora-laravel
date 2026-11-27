<?php

namespace App\Notifications;

use App\Models\Withdrawal;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Receipt sent when a PIX withdrawal is confirmed by the provider.
 */
class WithdrawalCompleted extends Notification
{
    use Queueable;

    public function __construct(public Withdrawal $withdrawal) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $money = fn (int $cents): string => 'R$ '.number_format($cents / 100, 2, ',', '.');
        $message = (new MailMessage)
            ->subject('Saque de '.$money($this->withdrawal->amount_cents).' concluído')
            ->greeting("Olá, {$notifiable->first_name}!")
            ->line('Seu saque por PIX de '.$money($this->withdrawal->amount_cents).' foi concluído para a chave '.$this->withdrawal->maskedPixKey().'.');

        if ($this->withdrawal->received_cents !== null) {
            $message->line('Valor recebido após tarifas: '.$money($this->withdrawal->received_cents).'.');
        }

        if ($this->withdrawal->end_to_end_id !== null) {
            $message->line('Código da transação (E2E): '.$this->withdrawal->end_to_end_id);
        }

        return $message->action('Ver carteira', route('wallet'));
    }
}
