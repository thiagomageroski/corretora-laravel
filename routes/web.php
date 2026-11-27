<?php

use App\Http\Controllers\Admin\AssetController as AdminAssetController;
use App\Http\Controllers\Admin\AuditController as AdminAuditController;
use App\Http\Controllers\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Admin\DepositController as AdminDepositController;
use App\Http\Controllers\Admin\PositionController as AdminPositionController;
use App\Http\Controllers\Admin\SettingsController as AdminSettingsController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\Admin\WithdrawalController as AdminWithdrawalController;
use App\Http\Controllers\AmploPayWebhookController;
use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AssetController as ApiAssetController;
use App\Http\Controllers\Api\CandleController;
use App\Http\Controllers\Api\DemoWalletController;
use App\Http\Controllers\Api\DepositController;
use App\Http\Controllers\Api\FavoriteController;
use App\Http\Controllers\Api\PixKeyController;
use App\Http\Controllers\Api\PositionController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\RealAccountController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\WithdrawalController;
use App\Http\Controllers\AvatarController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\StatementController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PageController::class, 'landing'])->name('home');
Route::get('/termos', [PageController::class, 'terms'])->name('terms');
Route::get('/riscos', [PageController::class, 'risks'])->name('risks');
Route::get('/privacidade', [PageController::class, 'privacy'])->name('privacy');
Route::get('/cookies', [PageController::class, 'cookies'])->name('cookies');
Route::get('/pld', [PageController::class, 'antiMoneyLaundering'])->name('anti-money-laundering');

Route::middleware('auth')->group(function (): void {
    Route::get('/dashboard', [PageController::class, 'dashboard'])->name('dashboard');
    Route::get('/negociar', [PageController::class, 'terminal'])->name('negociar');
    Route::get('/ativos', [PageController::class, 'assets'])->name('assets.index');
    Route::get('/ativos/{asset}', [PageController::class, 'asset'])->name('assets.show');
    Route::get('/carteira', [PageController::class, 'wallet'])->name('wallet');
    Route::get('/operacoes', [PageController::class, 'history'])->name('history');

    Route::get('/conta', [PageController::class, 'account'])->name('account');
    Route::get('/conta/foto', [AvatarController::class, 'show'])->name('account.avatar');
    Route::get('/conta/extrato', StatementController::class)->middleware('throttle:20,1,account.statement:')->name('account.statement');

    Route::prefix('api/v1')->name('api.')->group(function (): void {
        Route::get('account', [AccountController::class, 'show'])->name('account.show');
        Route::patch('account/preferences', [AccountController::class, 'updatePreferences'])->middleware('throttle:60,1,account.preferences:')->name('account.preferences');
        Route::post('account/preferences/reset', [AccountController::class, 'resetPreferences'])->middleware('throttle:6,1,account.preferences.reset:')->name('account.preferences.reset');
        Route::post('account/avatar', [AvatarController::class, 'store'])->middleware('throttle:10,1,account.avatar:')->name('account.avatar.store');
        Route::delete('account/avatar', [AvatarController::class, 'destroy'])->middleware('throttle:10,1,account.avatar.destroy:')->name('account.avatar.destroy');
        Route::post('account/close', [AccountController::class, 'close'])->middleware('throttle:5,1,account.close:')->name('account.close');
        Route::post('account/deletion-request', [AccountController::class, 'requestDeletion'])->middleware('throttle:5,1,account.deletion:')->name('account.deletion');
        Route::get('pix-keys', [PixKeyController::class, 'index'])->name('pix-keys.index');
        Route::post('pix-keys', [PixKeyController::class, 'store'])->middleware('throttle:10,1,pix-keys.store:')->name('pix-keys.store');
        Route::delete('pix-keys/{pixKey}', [PixKeyController::class, 'destroy'])->middleware('throttle:10,1,pix-keys.destroy:')->name('pix-keys.destroy');
        Route::post('account/sessions/revoke', [AccountController::class, 'revokeSessions'])->middleware('throttle:6,1,account.sessions.revoke:')->name('account.sessions.revoke');

        Route::get('assets', [ApiAssetController::class, 'index'])->name('assets.index');
        Route::post('assets/{asset}/view', [ApiAssetController::class, 'recordView'])->name('assets.view');
        Route::get('assets/{asset}/sentiment', [ApiAssetController::class, 'sentiment'])->middleware('throttle:60,1,assets.sentiment:')->name('assets.sentiment');
        Route::get('assets/{asset}/candles', CandleController::class)->middleware('throttle:120,1,assets.candles:')->name('assets.candles');
        Route::put('assets/{asset}/favorite', [FavoriteController::class, 'store'])->name('favorites.store');
        Route::delete('assets/{asset}/favorite', [FavoriteController::class, 'destroy'])->name('favorites.destroy');
        Route::get('quotes', QuoteController::class)->middleware('throttle:120,1,quotes:')->name('quotes');

        Route::get('positions', [PositionController::class, 'index'])->name('positions.index');
        Route::post('positions', [PositionController::class, 'store'])->middleware('throttle:60,1,positions.store:')->name('positions.store');
        Route::get('wallet', [WalletController::class, 'show'])->name('wallet.show');
        Route::put('wallet/environment', [WalletController::class, 'select'])->middleware('throttle:30,1,wallet.environment:')->name('wallet.environment');
        Route::post('wallet/demo/reset', [DemoWalletController::class, 'reset'])->middleware('throttle:6,1,wallet.reset:')->name('wallet.reset');

        Route::post('real-account', [RealAccountController::class, 'store'])->middleware('throttle:6,1,real-account.store:')->name('real-account.store');
        Route::get('deposits', [DepositController::class, 'index'])->name('deposits.index');
        Route::post('deposits', [DepositController::class, 'store'])->middleware('throttle:10,1,deposits.store:')->name('deposits.store');
        Route::get('deposits/{deposit}', [DepositController::class, 'show'])->middleware('throttle:60,1,deposits.show:')->name('deposits.show');
        Route::get('withdrawals', [WithdrawalController::class, 'index'])->name('withdrawals.index');
        Route::post('withdrawals', [WithdrawalController::class, 'store'])->middleware('throttle:6,1,withdrawals.store:')->name('withdrawals.store');
        Route::delete('withdrawals/{withdrawal}', [WithdrawalController::class, 'destroy'])->middleware('throttle:10,1,withdrawals.destroy:')->name('withdrawals.destroy');
    });
});

/*
| Admin panel: flagged administrators only (`php artisan admin:grant`), with the
| password asked again on the way in. Every action is written to the audit log.
*/
Route::middleware(['auth', 'can:admin', 'password.confirm'])->prefix('admin')->name('admin.')->group(function (): void {
    Route::get('/', AdminDashboardController::class)->name('dashboard');

    Route::get('clientes', [AdminUserController::class, 'index'])->name('users.index');
    Route::get('clientes/{user}', [AdminUserController::class, 'show'])->name('users.show');

    Route::get('depositos', [AdminDepositController::class, 'index'])->name('deposits.index');
    Route::get('saques', [AdminWithdrawalController::class, 'index'])->name('withdrawals.index');
    Route::get('operacoes', [AdminPositionController::class, 'index'])->name('positions.index');
    Route::get('ativos', [AdminAssetController::class, 'index'])->name('assets.index');
    Route::get('configuracoes', [AdminSettingsController::class, 'show'])->name('settings.show');
    Route::get('auditoria', [AdminAuditController::class, 'index'])->name('audit.index');

    Route::middleware('throttle:60,1,admin.actions:')->group(function (): void {
        Route::put('clientes/{user}', [AdminUserController::class, 'update'])->name('users.update');
        Route::post('clientes/{user}/saldo', [AdminUserController::class, 'adjustBalance'])->name('users.balance');
        Route::post('clientes/{user}/conta-real', [AdminUserController::class, 'setRealStatus'])->name('users.real-status');
        Route::post('clientes/{user}/acesso', [AdminUserController::class, 'setAccess'])->name('users.access');
        Route::post('clientes/{user}/demo/reiniciar', [AdminUserController::class, 'resetDemo'])->name('users.demo-reset');
        Route::post('clientes/{user}/sessoes/encerrar', [AdminUserController::class, 'revokeSessions'])->name('users.sessions');
        Route::post('clientes/{user}/admin', [AdminUserController::class, 'setAdmin'])->name('users.admin');

        Route::post('depositos/{deposit:public_id}/confirmar', [AdminDepositController::class, 'confirm'])->name('deposits.confirm');
        Route::post('depositos/{deposit:public_id}/aprovar', [AdminDepositController::class, 'approve'])->name('deposits.approve');
        Route::post('depositos/{deposit:public_id}/recusar', [AdminDepositController::class, 'dismiss'])->name('deposits.dismiss');

        Route::post('saques/{withdrawal:public_id}/aprovar', [AdminWithdrawalController::class, 'approve'])->name('withdrawals.approve');
        Route::post('saques/{withdrawal:public_id}/recusar', [AdminWithdrawalController::class, 'reject'])->name('withdrawals.reject');
        Route::post('saques/{withdrawal:public_id}/reenviar', [AdminWithdrawalController::class, 'retry'])->name('withdrawals.retry');

        Route::put('ativos/{asset}', [AdminAssetController::class, 'update'])->name('assets.update');
        Route::post('ativos/retorno', [AdminAssetController::class, 'bulkPayout'])->name('assets.payout');

        Route::put('configuracoes', [AdminSettingsController::class, 'update'])->name('settings.update');
    });
});

/*
| Provider notifications: no session and no CSRF token, authenticated by the
| token in the body and confirmed by querying the provider.
*/
Route::post('/webhooks/amplopay', AmploPayWebhookController::class)->middleware('throttle:240,1,webhooks.amplopay:')->name('webhooks.amplopay');
