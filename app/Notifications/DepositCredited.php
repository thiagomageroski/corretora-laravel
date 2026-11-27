<?php

namespace App\Notifications;

use App\Models\Deposit;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Receipt sent when a PIX deposit is credited to the real account.
 */
class DepositCredited extends Notification
{
    use Queueable;

    public function __construct(public Deposit $deposit) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $amount = 'R$ '.number_format($this->deposit->amount_cents / 100, 2, ',', '.');

        return (new MailMessage)
            ->subject("Depósito de {$amount} confirmado")
            ->greeting("Olá, {$notifiable->first_name}!")
            ->line("Seu depósito por PIX de {$amount} foi confirmado e já está disponível na sua conta real.")
            ->line('Identificador: '.$this->deposit->public_id)
            ->action('Negociar agora', route('negociar'))
            ->line('Opções binárias envolvem alto risco. Opere apenas com dinheiro que pode perder.');
    }
}
