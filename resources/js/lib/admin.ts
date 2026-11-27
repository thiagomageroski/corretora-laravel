/**
 * Types and Portuguese labels shared by the admin panel pages.
 */

/** A Laravel length-aware paginator as serialized to JSON. */
export type AdminPage<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};

export type Tone = 'up' | 'down' | 'demo' | 'real' | 'neutral' | 'accent';

export type AdminBalance = { available_cents: number; reserved_cents: number };

export type AdminUserRow = {
    id: number;
    profile_id: string;
    name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    status: string;
    is_admin: boolean;
    created_at: string | null;
    real: (AdminBalance & { status: string }) | null;
    demo: AdminBalance | null;
};

export type AdminDeposit = {
    id: string;
    user_id: number;
    user: string | null;
    email: string | null;
    amount_cents: number;
    fee_cents: number | null;
    status: string;
    provider_status: string | null;
    provider_transaction_id: string | null;
    review_reason: string | null;
    failure_reason: string | null;
    created_at: string | null;
    paid_at: string | null;
    credited_at: string | null;
    expires_at: string | null;
    can_confirm: boolean;
    can_review: boolean;
};

export type AdminWithdrawal = {
    id: string;
    user_id: number;
    user: string | null;
    email: string | null;
    amount_cents: number;
    fee_cents: number | null;
    received_cents: number | null;
    status: string;
    pix_key_type: string;
    pix_key: string;
    provider_transfer_id: string | null;
    end_to_end_id: string | null;
    failure_reason: string | null;
    review_note: string | null;
    reviewer: string | null;
    created_at: string | null;
    approved_at: string | null;
    completed_at: string | null;
    can_decide: boolean;
    can_retry: boolean;
};

export type AdminPosition = {
    id: number;
    user_id: number;
    user: string | null;
    symbol: string;
    environment: 'real' | 'demo';
    direction: 'call' | 'put';
    stake_cents: number;
    payout_rate_bps: number;
    entry_price: string;
    close_price: string | null;
    result: string | null;
    returned_cents: number | null;
    void_reason: string | null;
    opened_at: string | null;
    expires_at: string | null;
    settled_at: string | null;
};

export type AdminAudit = {
    id: number;
    action: string;
    actor_id: number | null;
    actor: string | null;
    subject: string | null;
    context: Record<string, unknown>;
    ip_address: string | null;
    created_at: string | null;
};

export const DEPOSIT_STATUS: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'Aguardando PIX', tone: 'demo' },
    completed: { label: 'Creditado', tone: 'up' },
    review: { label: 'Em análise', tone: 'accent' },
    failed: { label: 'Recusado', tone: 'down' },
    expired: { label: 'Expirado', tone: 'neutral' },
    refunded: { label: 'Estornado', tone: 'down' },
    charged_back: { label: 'Contestado', tone: 'down' },
};

export const WITHDRAWAL_STATUS: Record<string, { label: string; tone: Tone }> = {
    requested: { label: 'Aguardando aprovação', tone: 'accent' },
    sending: { label: 'Enviando', tone: 'real' },
    processing: { label: 'Processando', tone: 'real' },
    completed: { label: 'Pago', tone: 'up' },
    failed: { label: 'Falhou', tone: 'down' },
    rejected: { label: 'Recusado', tone: 'down' },
    canceled: { label: 'Cancelado', tone: 'neutral' },
};

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
    active: { label: 'Ativo', tone: 'up' },
    suspended: { label: 'Suspenso', tone: 'down' },
    closed: { label: 'Encerrado', tone: 'neutral' },
};

export const REAL_ACCOUNT_STATUS: Record<string, { label: string; tone: Tone }> = {
    active: { label: 'Conta real ativa', tone: 'real' },
    frozen: { label: 'Conta real bloqueada', tone: 'down' },
};

export const REVIEW_REASONS: Record<string, string> = {
    currency_mismatch: 'Moeda diferente',
    amount_mismatch: 'Valor pago menor que o cobrado',
    payer_mismatch: 'Pago por CPF de outra pessoa',
};

export const AUDIT_ACTIONS: Record<string, string> = {
    'user.registered': 'Cadastro criado',
    'account.closed': 'Conta encerrada pelo cliente',
    'account.deletion_requested': 'Pediu exclusão da conta',
    'account.password_changed': 'Trocou a senha',
    'account.pix_key_added': 'Salvou chave PIX',
    'account.pix_key_removed': 'Removeu chave PIX',
    'account.preferences_reset': 'Restaurou preferências',
    'account.profile_updated': 'Atualizou o perfil',
    'account.real_opened': 'Abriu a conta real',
    'account.real_frozen': 'Conta real bloqueada',
    'account.real_unfrozen': 'Conta real desbloqueada',
    'account.sessions_revoked': 'Encerrou outras sessões',
    'admin.user_updated': 'Admin editou dados do cliente',
    'admin.balance_adjusted': 'Admin ajustou saldo',
    'admin.user_suspended': 'Admin suspendeu o acesso',
    'admin.user_reactivated': 'Admin reativou o acesso',
    'admin.demo_reset': 'Admin reiniciou o saldo demo',
    'admin.sessions_revoked': 'Admin encerrou as sessões',
    'admin.granted': 'Virou administrador',
    'admin.revoked': 'Deixou de ser administrador',
    'admin.asset_updated': 'Admin editou um ativo',
    'admin.asset_payout_bulk': 'Admin alterou o retorno em massa',
    'platform.settings_updated': 'Configurações da plataforma alteradas',
    'catalog.availability_changed': 'Disponibilidade de ativos mudou',
    'payments.deposit_created': 'Cobrança PIX gerada',
    'payments.deposit_credited': 'Depósito creditado',
    'payments.deposit_held': 'Depósito retido para análise',
    'payments.deposit_confirmed_manually': 'Depósito confirmado manualmente',
    'payments.deposit_dismissed': 'Depósito recusado na análise',
    'payments.deposit_reversed': 'Depósito estornado',
    'payments.deposit_reversal_shortfall': 'Estorno maior que o saldo',
    'payments.withdrawal_requested': 'Saque solicitado',
    'payments.withdrawal_approved': 'Saque aprovado',
    'payments.withdrawal_rejected': 'Saque recusado',
    'payments.withdrawal_canceled': 'Saque cancelado pelo cliente',
    'payments.withdrawal_completed': 'Saque pago',
    'payments.withdrawal_failed': 'Saque falhou',
    'trading.position_opened': 'Operação aberta',
    'trading.position_settled': 'Operação encerrada',
    'wallet.demo_reset': 'Reiniciou o saldo demo',
};

export const SETTING_LABELS: Record<string, string> = {
    min_deposit_cents: 'Depósito mínimo',
    max_deposit_cents: 'Depósito máximo',
    max_pending_deposits: 'Cobranças PIX em aberto por cliente',
    min_withdrawal_cents: 'Saque mínimo',
    max_withdrawal_cents: 'Saque máximo',
    daily_withdrawal_limit_cents: 'Limite diário de saque',
    auto_approve_withdrawal_max_cents: 'Aprovar saques sozinho até',
    require_payer_match: 'Exigir PIX do próprio CPF',
    withdrawal_fee_paid_by_user: 'Tarifa do saque paga pelo cliente',
    real_money_enabled: 'Modo real',
    min_stake_cents: 'Valor mínimo por operação',
    max_stake_cents: 'Valor máximo por operação',
    max_open_positions: 'Operações abertas por cliente',
    default_payout_bps: 'Retorno padrão',
    durations_seconds: 'Prazos disponíveis',
    demo_initial_balance_cents: 'Saldo demo inicial',
    legal_company_name: 'Razão social',
    legal_company_document: 'CNPJ',
    legal_address: 'Endereço',
    legal_contact_email: 'E-mail de atendimento',
    legal_privacy_email: 'E-mail de privacidade (encarregado)',
};

export function auditLabel(action: string): string {
    return AUDIT_ACTIONS[action] ?? action;
}

/** "8500" basis points as "85%". */
export function bpsPercent(bps: number): string {
    return `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
