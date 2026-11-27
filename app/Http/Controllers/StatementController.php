<?php

namespace App\Http\Controllers;

use App\Enums\Environment;
use App\Models\WalletTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Monthly account statement as a spreadsheet-friendly CSV.
 */
class StatementController extends Controller
{
    private const LABELS = [
        'demo_grant' => 'Saldo virtual inicial',
        'demo_reset' => 'Reinício do saldo demo',
        'position_reserve' => 'Reserva de operação',
        'position_settlement' => 'Liquidação de operação',
        'deposit_credit' => 'Depósito PIX',
        'deposit_reversal' => 'Estorno de depósito',
        'withdrawal_reserve' => 'Saque solicitado',
        'withdrawal_payout' => 'Saque enviado',
        'withdrawal_release' => 'Saque devolvido',
    ];

    public function __invoke(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'mes' => ['required', 'date_format:Y-m'],
            'conta' => ['required', Rule::in([Environment::Demo->value, Environment::Real->value])],
        ]);

        $environment = Environment::from($validated['conta']);
        $wallet = $request->user()->findWallet($environment);

        abort_if($wallet === null, 404);

        $start = CarbonImmutable::createFromFormat('Y-m-d', $validated['mes'].'-01', config('app.timezone'))->startOfMonth();
        $label = $environment === Environment::Real ? 'real' : 'demo';

        return response()->streamDownload(function () use ($wallet, $start): void {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Data', 'Movimentação', 'Disponível (R$)', 'Reservado (R$)', 'Saldo disponível após (R$)', 'Observação'], ';');

            $money = fn (int $cents): string => number_format($cents / 100, 2, ',', '.');

            WalletTransaction::query()
                ->where('wallet_id', $wallet->id)
                ->whereBetween('created_at', [$start, $start->endOfMonth()])
                ->orderBy('seq')
                ->each(function (WalletTransaction $entry) use ($out, $money): void {
                    fputcsv($out, [
                        $entry->created_at?->format('d/m/Y H:i:s'),
                        self::LABELS[$entry->type->value] ?? $entry->type->value,
                        $money($entry->available_delta_cents),
                        $money($entry->reserved_delta_cents),
                        $money($entry->available_after_cents),
                        (string) $entry->reason,
                    ], ';');
                });

            fclose($out);
        }, "extrato-{$label}-{$validated['mes']}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
