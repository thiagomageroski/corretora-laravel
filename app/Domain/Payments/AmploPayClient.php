<?php

namespace App\Domain\Payments;

use App\Domain\Payments\Data\PixCharge;
use App\Domain\Payments\Data\ProviderTransaction;
use App\Domain\Payments\Data\ProviderTransfer;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * AmploPay gateway API v1. Amounts cross this boundary as integer cents; the
 * API itself takes and returns reais as decimal numbers.
 */
class AmploPayClient
{
    public const PROVIDER = 'amplopay';

    private const PAUSE_CACHE_KEY = 'amplopay:lookups-paused-until';

    private const DEFAULT_PAUSE_SECONDS = 300;

    public function isConfigured(): bool
    {
        return filled(config('services.amplopay.public_key')) && filled(config('services.amplopay.secret_key'));
    }

    /**
     * @param  array{name: string, email: string, phone: ?string, document: ?string}  $client
     *
     * @throws PaymentProviderError
     */
    public function createPixCharge(string $identifier, int $amountCents, array $client, ?string $callbackUrl, string $productName): PixCharge
    {
        $body = array_filter([
            'identifier' => $identifier,
            'amount' => self::reais($amountCents),
            'client' => array_filter($client, fn ($value) => filled($value)),
            'products' => [[
                'id' => $identifier,
                'name' => $productName,
                'quantity' => 1,
                'price' => self::reais($amountCents),
                'physical' => false,
            ]],
            'callbackUrl' => $callbackUrl,
        ], fn ($value) => $value !== null);

        $data = $this->send('post', '/gateway/pix/receive', $body);

        if (! in_array($data['status'] ?? null, ['OK', 'PENDING'], true) || blank($data['pix']['code'] ?? null)) {
            throw new PaymentProviderError(
                (string) ($data['errorDescription'] ?? $data['details'] ?? 'O provedor recusou a cobrança.'),
                definitive: true,
                providerCode: (string) ($data['status'] ?? 'UNKNOWN'),
            );
        }

        return new PixCharge(
            transactionId: (string) $data['transactionId'],
            status: (string) ($data['transactionStatus'] ?? 'PENDING'),
            webhookToken: $data['webhookToken'] ?? null,
            pixCode: (string) $data['pix']['code'],
            pixImageUrl: $data['pix']['image'] ?? null,
            expiresAt: isset($data['pix']['expiresAt']) ? CarbonImmutable::parse($data['pix']['expiresAt'])->utc() : null,
            feeCents: isset($data['fee']) ? self::cents($data['fee']) : null,
        );
    }

    /**
     * @throws PaymentProviderError
     */
    public function findTransaction(string $transactionId): ProviderTransaction
    {
        $data = $this->first($this->send('get', '/gateway/transactions', ['id' => $transactionId]));

        if ($data === null || ($data['id'] ?? null) !== $transactionId) {
            throw new PaymentProviderError('Transação não encontrada no provedor.', definitive: true, providerCode: 'NOT_FOUND');
        }

        return new ProviderTransaction(
            id: (string) $data['id'],
            identifier: $data['clientIdentifier'] ?? null,
            status: (string) $data['status'],
            amountCents: self::cents($data['chargeAmount'] ?? $data['amount'] ?? 0),
            currency: (string) ($data['currency'] ?? 'BRL'),
            payerDocument: self::digits($data['pixMetadata']['payerDocument'] ?? null),
            paidAt: isset($data['payedAt']) ? CarbonImmutable::parse($data['payedAt'])->utc() : null,
            description: $data['errorDescription'] ?? $data['statusDescription'] ?? null,
        );
    }

    /**
     * @param  array{type: string, key: string}  $pix
     * @param  array{ip: string, name: string, document_type: string, document_number: string}  $owner
     *
     * @throws PaymentProviderError
     */
    public function createTransfer(string $identifier, int $amountCents, array $pix, array $owner, ?string $callbackUrl, bool $feePaidByReceiver): ProviderTransfer
    {
        $data = $this->send('post', '/gateway/transfers', array_filter([
            'identifier' => $identifier,
            'amount' => self::reais($amountCents),
            'discountFeeOfReceiver' => $feePaidByReceiver,
            'pix' => $pix,
            'owner' => [
                'ip' => $owner['ip'],
                'name' => $owner['name'],
                'document' => ['type' => $owner['document_type'], 'number' => $owner['document_number']],
            ],
            'callbackUrl' => $callbackUrl,
        ], fn ($value) => $value !== null));

        $withdraw = $data['withdraw'] ?? null;

        if (! is_array($withdraw) || blank($withdraw['id'] ?? null)) {
            throw new PaymentProviderError('Resposta do provedor sem identificador da transferência.', definitive: false);
        }

        return new ProviderTransfer(
            id: (string) $withdraw['id'],
            identifier: $identifier,
            status: (string) ($withdraw['status'] ?? 'PENDING'),
            amountCents: self::cents($withdraw['amount'] ?? 0),
            feeCents: isset($withdraw['feeAmount']) ? self::cents($withdraw['feeAmount']) : null,
            receivedCents: null,
            endToEndId: null,
            reason: $withdraw['rejectedReason'] ?? null,
            webhookToken: $data['webhookToken'] ?? null,
        );
    }

    /**
     * Look a transfer up by the provider's id or, when the outcome of creating it
     * is unknown, by our own identifier. Returns null when it does not exist.
     *
     * @throws PaymentProviderError
     */
    public function findTransfer(?string $transferId = null, ?string $identifier = null): ?ProviderTransfer
    {
        try {
            $data = $this->first($this->send('get', '/gateway/transfers', array_filter(['id' => $transferId, 'clientIdentifier' => $identifier])));
        } catch (PaymentProviderError $error) {
            if ($error->httpStatus === 404) {
                return null;
            }

            throw $error;
        }

        if ($data === null || blank($data['id'] ?? null)) {
            return null;
        }

        $completedSend = collect($data['withdrawSent'] ?? [])->firstWhere('status', 'COMPLETED');
        $failedSend = collect($data['withdrawSent'] ?? [])->firstWhere('status', 'FAILED');

        return new ProviderTransfer(
            id: (string) $data['id'],
            identifier: $data['clientIdentifier'] ?? null,
            status: (string) $data['status'],
            amountCents: self::cents($data['amount'] ?? 0),
            feeCents: null,
            receivedCents: $completedSend !== null ? self::cents($completedSend['amount'] ?? 0) : null,
            endToEndId: $completedSend['endToEndId'] ?? null,
            reason: $data['rejectedReason'] ?? $failedSend['message'] ?? null,
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     *
     * @throws PaymentProviderError
     */
    private function send(string $method, string $path, array $payload): array
    {
        if (! $this->isConfigured()) {
            throw new PaymentProviderError('Pagamentos não configurados: defina AMPLOPAY_PUBLIC_KEY e AMPLOPAY_SECRET_KEY.', definitive: true, providerCode: 'NOT_CONFIGURED');
        }

        if ($method === 'get' && ! $this->lookupsEnabled()) {
            throw new PaymentProviderError('Consultas de status desativadas; a confirmação chega pela notificação do provedor.', definitive: false, providerCode: 'LOOKUPS_DISABLED');
        }

        if ($method === 'get' && $this->lookupsBlockedFor() > 0) {
            throw new PaymentProviderError('Consultas ao provedor em pausa; aguardando a notificação de pagamento.', definitive: false, providerCode: 'TOO_MANY_REQUESTS', httpStatus: 429);
        }

        try {
            $response = $method === 'get' ? $this->http()->get($path, $payload) : $this->http()->post($path, $payload);
        } catch (ConnectionException) {
            throw new PaymentProviderError('Sem resposta do provedor de pagamentos.', definitive: false);
        }

        if ($response->successful()) {
            return (array) $response->json();
        }

        if ($response->status() === 429) {
            $this->pauseLookups((int) ($response->json('error.retryAfterSeconds') ?? $response->json('retryAfterSeconds') ?? $response->header('Retry-After') ?: self::DEFAULT_PAUSE_SECONDS));
        }

        throw $this->errorFrom($response);
    }

    /**
     * AmploPay blocks repeated status lookups ("polling") and expects webhooks
     * instead. After a 429 every lookup is skipped until the pause ends, since
     * each new attempt would only extend the block.
     */
    public function lookupsEnabled(): bool
    {
        return (bool) config('services.amplopay.status_lookups');
    }

    public function lookupsBlockedFor(): int
    {
        return max(0, (int) Cache::get(self::PAUSE_CACHE_KEY, 0) - now()->getTimestamp());
    }

    private function pauseLookups(int $seconds): void
    {
        $seconds = max($seconds, 60) + 5;
        Cache::put(self::PAUSE_CACHE_KEY, now()->getTimestamp() + $seconds, $seconds);
        Log::warning('AmploPay blocked status lookups', ['retry_after_seconds' => $seconds]);
    }

    private function errorFrom(Response $response): PaymentProviderError
    {
        $status = $response->status();
        $code = $response->json('errorCode') ?? $response->json('error.errorCode');
        $message = $response->json('message') ?? $response->json('error.message');

        return new PaymentProviderError(
            is_string($message) && $message !== '' ? $message : "Erro {$status} do provedor de pagamentos.",
            definitive: $status >= 400 && $status < 500 && $status !== 408 && $status !== 429,
            providerCode: is_string($code) ? $code : null,
            httpStatus: $status,
            fields: self::invalidFields((array) ($response->json('details') ?? $response->json('error.details') ?? [])),
        );
    }

    /**
     * The field paths of a validation error, e.g. ["client.phone"], for the logs.
     *
     * @param  array<mixed>  $details
     * @return list<string>
     */
    private static function invalidFields(array $details): array
    {
        $fields = [];
        $walk = function (mixed $node) use (&$walk, &$fields): void {
            if (! is_array($node)) {
                return;
            }

            if (isset($node['path']) && is_array($node['path']) && $node['path'] !== []) {
                $fields[] = implode('.', array_map('strval', $node['path']));
            }

            foreach ($node as $child) {
                $walk($child);
            }
        };
        $walk($details);

        return array_values(array_unique($fields));
    }

    private function http(): PendingRequest
    {
        return Http::baseUrl(rtrim((string) config('services.amplopay.base_url'), '/'))
            ->withHeaders([
                'x-public-key' => (string) config('services.amplopay.public_key'),
                'x-secret-key' => (string) config('services.amplopay.secret_key'),
            ])
            ->acceptJson()
            ->asJson()
            ->connectTimeout(5)
            ->timeout((int) config('services.amplopay.timeout_seconds'));
    }

    /**
     * Lookups return one object; tolerate a list in case a filter matches several.
     *
     * @param  array<mixed>  $data
     * @return array<string, mixed>|null
     */
    private function first(array $data): ?array
    {
        if (array_is_list($data)) {
            return $data[0] ?? null;
        }

        return $data['data'][0] ?? ($data === [] ? null : $data);
    }

    public static function reais(int $cents): float
    {
        return round($cents / 100, 2);
    }

    public static function cents(mixed $reais): int
    {
        return is_numeric($reais) ? (int) round(((float) $reais) * 100) : 0;
    }

    public static function digits(?string $value): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits === '' ? null : $digits;
    }
}
