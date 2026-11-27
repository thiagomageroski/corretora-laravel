export type Quote = {
    price: string;
    open_24h: string | null;
    high_24h: string | null;
    low_24h: string | null;
    volume_24h: string | null;
    change_percent: number | null;
    source: string;
    source_at: string;
};

export type Asset = {
    id: number;
    symbol: string;
    name: string;
    category: string;
    category_name: string;
    price_basis: string | null;
    session_label: string;
    market_open: boolean;
    payout_rate_bps: number;
    tradable: boolean;
    provider: string | null;
    provider_configured: boolean;
    data_status: 'live' | 'delayed' | 'unavailable';
    quote: Quote | null;
    is_favorite?: boolean;
};

export type Category = { id?: number; code: string; name: string; assets_count?: number };

export type Environment = 'demo' | 'real';

export type WalletSummary = {
    environment?: Environment;
    currency?: string;
    available_cents: number;
    reserved_cents: number;
};

export type Position = {
    id: number;
    asset_id: number;
    symbol: string;
    direction: 'call' | 'put';
    stake_cents: number;
    payout_rate_bps: number;
    entry_price: string;
    entry_source: string;
    opened_at: string;
    expires_at: string;
    close_price: string | null;
    close_source: string | null;
    close_source_at: string | null;
    result: 'won' | 'lost' | 'neutral' | 'voided' | null;
    void_reason: string | null;
    returned_cents: number | null;
    result_cents: number | null;
    settled_at: string | null;
    rules_version: number;
};

export type TradingRules = {
    min_stake_cents: number;
    max_stake_cents: number;
    durations_seconds: number[];
    max_entry_quote_age_seconds: number;
    settlement_grace_seconds: number;
    rules_version: number;
    default_payout_bps: number;
};

export type Candle = {
    time: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string | null;
};

export type CandleResponse = {
    status: 'ok' | 'stale' | 'unavailable';
    source: string | null;
    candles: Candle[];
    message: string | null;
};

export type Paginated<T> = {
    data: T[];
    links?: { prev: string | null; next: string | null };
    meta?: { current_page: number; last_page: number; total: number };
};

export type Preferences = {
    chart_type: 'candles' | 'bars' | 'line' | 'area';
    chart_interval: string;
    chart_indicators: string[];
    chart_animations: boolean;
    default_stake_cents: number;
    default_duration_seconds: number;
    confirm_before_trade: boolean;
    sound_on_settlement: boolean;
    hide_balance: boolean;
    timezone: string;
    interface_scale: number;
    chart_position_lines: boolean;
    chart_stake_labels: boolean;
    chart_legend: boolean;
    keyboard_shortcuts: boolean;
    notify_settlement_toast: boolean;
    email_transactions: boolean;
    email_product_news: boolean;
    email_promotions: boolean;
};

export type AccountOverview = {
    profile: { first_name: string; last_name: string; email: string; phone: string | null; member_since: string | null; profile_id: string; avatar_url: string | null; real_account: boolean; deletion_requested_at: string | null };
    pix_keys: SavedPixKey[];
    two_factor: { enabled: boolean; confirmed: boolean };
    preferences: Preferences;
    sessions: { id: string; device: string; ip_address: string | null; last_active_at: string; is_current: boolean }[];
    login_events: { id: number; event: 'login' | 'logout' | 'failed'; ip_address: string | null; device: string; created_at: string | null }[];
    options: {
        min_stake_cents: number;
        max_stake_cents: number;
        durations_seconds: number[];
        chart_types: string[];
        chart_intervals: string[];
        indicators: string[];
        demo_reset_cents: number[];
        interface_scales: number[];
        pix_key_types: string[];
        statement_months: string[];
    };
};

export type Performance = {
    total: number;
    won: number;
    lost: number;
    neutral: number;
    voided: number;
    open: number;
    net_result_cents: number;
    equity_curve: { time: number; value: number }[];
};

export type SharedProps = {
    appName: string;
    auth: { user: { id: number; name: string; first_name: string; email: string; avatar_url: string | null; profile_id: string; member_since: string | null; is_admin?: boolean } | null };
    onboarding: Onboarding | null;
    preferences: Preferences | null;
    demoWallet: WalletSummary | null;
    environment: Environment | null;
    activeWallet: WalletSummary | null;
    realAccount: RealAccountState | null;
    flash: { status: string | null; error?: string | null };
};

export type Tick = { asset_id: number; price: string; open_24h: string | null; source_at: string; traded?: string };

export type RealAccountState = {
    enabled: boolean;
    payments_configured: boolean;
    opened: boolean;
    status: string | null;
    wallet: WalletSummary | null;
    webhook_ready: boolean;
    deposit_limits: { min_cents: number; max_cents: number; expiry_minutes?: number };
};

export type Deposit = {
    id: string;
    amount_cents: number;
    status: 'pending' | 'completed' | 'review' | 'failed' | 'expired' | 'refunded' | 'charged_back';
    review_reason: string | null;
    failure_reason: string | null;
    pix_code: string | null;
    pix_qr_svg: string | null;
    expires_at: string | null;
    paid_at: string | null;
    credited_at: string | null;
    created_at: string | null;
};

export type Withdrawal = {
    id: string;
    amount_cents: number;
    status: 'requested' | 'sending' | 'processing' | 'completed' | 'failed' | 'rejected' | 'canceled';
    pix_key_type: string;
    pix_key_masked: string;
    fee_cents: number | null;
    received_cents: number | null;
    failure_reason: string | null;
    created_at: string | null;
    completed_at: string | null;
};

export type SavedPixKey = { id: number; type: string; label: string | null; masked: string; key?: string | null };

export type Onboarding = { progress: number; done: number; total: number; steps: { key: string; title: string; done: boolean }[] };
