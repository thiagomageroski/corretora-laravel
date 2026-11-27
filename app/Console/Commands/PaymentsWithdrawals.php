<?php

namespace App\Console\Commands;

use App\Domain\Payments\PaymentRejected;
use App\Domain\Payments\WithdrawalService;
use App\Enums\WithdrawalStatus;
use App\Models\User;
use App\Models\Withdrawal;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('payments:withdrawals
    {action=list : list, approve, reject or retry}
    {withdrawal? : Withdrawal id, as shown by list}
    {--operator= : E-mail of the operator responsible, recorded in the audit log}
    {--note= : Justification, required for every decision}')]
#[Description('Review real-money withdrawals: list pending ones, approve and send them, reject them or retry an unconfirmed send')]
class PaymentsWithdrawals extends Command
{
    public function handle(WithdrawalService $withdrawals): int
    {
        $action = (string) $this->argument('action');

        if ($action === 'list') {
            return $this->list();
        }

        if (! in_array($action, ['approve', 'reject', 'retry'], true)) {
            $this->error('Use list, approve, reject or retry.');

            return self::INVALID;
        }

        $withdrawal = Withdrawal::query()->with('user')->where('public_id', (string) $this->argument('withdrawal'))->first();
        $operator = User::query()->where('email', (string) $this->option('operator'))->first();
        $note = trim((string) $this->option('note'));

        if ($withdrawal === null || $operator === null || mb_strlen($note) < 5) {
            $this->error('Informe o saque, --operator com o e-mail de um usuário existente e --note com a justificativa.');

            return self::INVALID;
        }

        try {
            $result = match ($action) {
                'approve' => $withdrawals->approve($withdrawal, $operator->id, $note),
                'reject' => $withdrawals->reject($withdrawal, $operator->id, $note),
                'retry' => $this->retry($withdrawals, $withdrawal),
            };
        } catch (PaymentRejected $rejected) {
            $this->error($rejected->getMessage());

            return self::FAILURE;
        }

        $this->info("Saque {$result->public_id}: {$result->status->value}".($result->failure_reason ? " ({$result->failure_reason})" : ''));

        return self::SUCCESS;
    }

    private function retry(WithdrawalService $withdrawals, Withdrawal $withdrawal): Withdrawal
    {
        if ($withdrawal->status !== WithdrawalStatus::Sending) {
            throw new PaymentRejected('invalid_state');
        }

        return $withdrawals->send($withdrawal, resendIfMissing: true);
    }

    private function list(): int
    {
        $rows = Withdrawal::query()
            ->with('user')
            ->whereIn('status', [WithdrawalStatus::Requested, WithdrawalStatus::Sending, WithdrawalStatus::Processing])
            ->orderBy('id')
            ->get()
            ->map(fn (Withdrawal $withdrawal): array => [
                $withdrawal->public_id,
                $withdrawal->user->email,
                number_format($withdrawal->amount_cents / 100, 2, ',', '.'),
                $withdrawal->pix_key_type.' '.$withdrawal->maskedPixKey(),
                $withdrawal->status->value,
                $withdrawal->created_at?->toDateTimeString(),
            ]);

        if ($rows->isEmpty()) {
            $this->info('Nenhum saque em aberto.');

            return self::SUCCESS;
        }

        $this->table(['Id', 'Usuário', 'Valor (R$)', 'Chave PIX', 'Estado', 'Pedido em'], $rows);

        return self::SUCCESS;
    }
}
