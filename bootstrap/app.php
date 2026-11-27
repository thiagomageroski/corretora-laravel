<?php

use App\Domain\Payments\PaymentRejected;
use App\Domain\Trading\TradeRejected;
use App\Domain\Wallet\OpenPositionsBlockReset;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);

        // Payment notifications carry no CSRF token; they are verified by token and provider lookup.
        $middleware->preventRequestForgery(except: ['webhooks/*']);

        // In production the app sits behind the local nginx/Varnish chain: trust it
        // for the client IP and scheme, so rate limits and links use the real values.
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*', 'webhooks/*') || $request->expectsJson(),
        );

        $exceptions->render(fn (PaymentRejected $rejected): JsonResponse => response()->json([
            'code' => $rejected->reason,
            'message' => $rejected->getMessage(),
        ], 422));

        $exceptions->render(fn (TradeRejected $rejected): JsonResponse => response()->json([
            'code' => $rejected->reason,
            'message' => $rejected->getMessage(),
        ], 422));

        $exceptions->render(fn (OpenPositionsBlockReset $blocked): JsonResponse => response()->json([
            'code' => 'open_positions',
            'message' => $blocked->getMessage(),
        ], 409));

        $exceptions->dontReport([TradeRejected::class, OpenPositionsBlockReset::class, PaymentRejected::class]);

        // Pages get the platform's own error screen: always for an unknown address, and outside
        // local/testing for the other errors (there the debug page is more useful). API calls and
        // webhooks keep their JSON. No shared props: an unknown route never ran the web middleware.
        $exceptions->respond(function (Response $response, Throwable $exception, Request $request): Response {
            $status = $response->getStatusCode();
            $isPage = ! $request->is('api/*', 'webhooks/*') && ! $request->expectsJson();
            $styled = $status === 404 || (in_array($status, [403, 500, 503], true) && ! app()->environment(['local', 'testing']));

            if (! $isPage || ! $styled) {
                return $response;
            }

            return Inertia::render('ErrorPage', ['status' => $status])->toResponse($request)->setStatusCode($status);
        });
    })->create();
