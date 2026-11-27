<?php

namespace App\Console\Commands;

use App\Domain\Payments\DepositService;
use App\Domain\Payments\PaymentRejected;
use App\Enums\DepositStatus;
use App\Models\Deposit;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('payments:deposits
    {action=list : list, credit, confirm or dismiss}
    {deposit? : Deposit id, as shown by list}
    {--operator= : E-mail of the operator responsible, recorded in the audit log}
    {--note= : Justification, required for every decision}')]
#[Description('Review deposits: credit one held for review, confirm one paid whose notification never arrived (check the provider panel first), or dismiss one to refund through the provider panel')]
class PaymentsDeposits extends Command
{
    public function handle(DepositService $deposits): int
    {
        $action = (string) $this->argument('action');

        if ($action === 'list') {
            return $this->list();
        }

        $deposit = Deposit::query()->where('public_id', (string) $this->argument('deposit'))->first();
        $operator = User::query()->where('email', (string) $this->option('operator'))->first();
        $note = trim((string) $this->option('note'));

        if (! in_array($action, ['credit', 'confirm', 'dismiss'], true) || $deposit === null || $operator === null || mb_strlen($note) < 5) {
            $this->error('Use credit, confirm ou dismiss, com o depósito, --operator com o e-mail de um usuário existente e --note com a justificativa.');

            return self::INVALID;
        }

        try {
            $deposit = match ($action) {
                'credit' => $deposits->approveReview($deposit, $operator->id, $note),
                'confirm' => $deposits->confirmManually($deposit, $operator->id, $note),
                default => $deposits->dismissReview($deposit, $operator->id, $note),
            };
        } catch (PaymentRejected $rejected) {
            $this->error($rejected->getMessage());

            return self::FAILURE;
        }

        $this->info("Depósito {$deposit->public_id}: {$deposit->status->value}");

        return self::SUCCESS;
    }

    private function list(): int
    {
        $rows = Deposit::query()
            ->with('user')
            ->whereIn('status', [DepositStatus::Review, DepositStatus::Pending])
            ->orderBy('id')
            ->get()
            ->map(fn (Deposit $deposit): array => [
                $deposit->public_id,
                $deposit->user->email,
                number_format($deposit->amount_cents / 100, 2, ',', '.'),
                $deposit->status->value.($deposit->review_reason ? " ({$deposit->review_reason})" : ''),
                $deposit->provider_transaction_id,
                $deposit->created_at?->toDateTimeString(),
            ]);

        if ($rows->isEmpty()) {
            $this->info('Nenhum depósito pendente ou em análise.');

            return self::SUCCESS;
        }

        $this->table(['Id', 'Usuário', 'Valor (R$)', 'Estado', 'Transação no provedor', 'Criado em'], $rows);

        return self::SUCCESS;
    }
}
