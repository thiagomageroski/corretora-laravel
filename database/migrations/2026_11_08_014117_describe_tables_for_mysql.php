<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Describes each table in Portuguese, shown by phpMyAdmin next to its name.
 * Only MySQL and MariaDB keep table comments; other drivers skip it.
 */
return new class extends Migration
{
    private const DESCRIPTIONS = [
        'users' => 'Clientes: nome, e-mail, celular, data de nascimento e CPF (criptografado)',
        'user_preferences' => 'Preferências de cada cliente: gráfico, valores padrão, notificações',
        'accounts' => 'Contas de cada cliente: demo e real, com a situação (ativa, bloqueada)',
        'wallets' => 'Carteiras em reais de cada conta',
        'wallet_transactions' => 'Extrato: todas as movimentações de saldo (somente inclusão)',
        'deposits' => 'Depósitos PIX: valor, situação e dados da cobrança na AmploPay',
        'withdrawals' => 'Saques PIX: valor, chave de destino, aprovação e situação',
        'pix_keys' => 'Chaves PIX salvas pelos clientes (criptografadas)',
        'payment_webhooks' => 'Avisos recebidos da AmploPay sobre pagamentos e saques',
        'trading_orders' => 'Pedidos de operação enviados pelos clientes',
        'trading_positions' => 'Operações: ativo, direção, valor, preços de entrada e encerramento, resultado',
        'trading_executions' => 'Execuções das operações (somente inclusão)',
        'assets' => 'Ativos negociáveis: criptomoedas, forex, ações, índices',
        'asset_categories' => 'Categorias de ativos',
        'asset_views' => 'Ativos abertos por cada cliente (recentes)',
        'favorites' => 'Ativos favoritos de cada cliente',
        'market_quotes' => 'Última cotação de cada ativo',
        'market_candles' => 'Histórico de velas (candles) dos gráficos',
        'login_events' => 'Histórico de acessos: entradas, saídas e tentativas falhas, com IP e aparelho',
        'audit_logs' => 'Registro de auditoria das ações importantes (somente inclusão)',
        'sessions' => 'Sessões ativas (clientes conectados)',
        'password_reset_tokens' => 'Pedidos de redefinição de senha',
        'cache' => 'Cache da aplicação',
        'cache_locks' => 'Travas do cache',
        'jobs' => 'Fila de tarefas em segundo plano',
        'job_batches' => 'Lotes de tarefas em segundo plano',
        'failed_jobs' => 'Tarefas em segundo plano que falharam',
        'migrations' => 'Controle de versões do banco (Laravel)',
    ];

    public function up(): void
    {
        $this->describe(fn (string $table): string => self::DESCRIPTIONS[$table]);
    }

    public function down(): void
    {
        $this->describe(fn (): string => '');
    }

    /**
     * @param  Closure(string): string  $comment
     */
    private function describe(Closure $comment): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        foreach (array_keys(self::DESCRIPTIONS) as $table) {
            if (Schema::hasTable($table)) {
                DB::statement('ALTER TABLE `'.$table.'` COMMENT = '.DB::getPdo()->quote($comment($table)));
            }
        }
    }
};
