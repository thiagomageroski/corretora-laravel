export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public code: string | null = null,
        public errors: Record<string, string[]> = {},
    ) {
        super(message);
    }

    firstError(field: string): string | undefined {
        return this.errors[field]?.[0];
    }
}

function csrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);

    return match ? decodeURIComponent(match[1]) : '';
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };

export function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(`/api/v1${path}`, options);
}

/**
 * Session-authenticated JSON request to any same-origin route, such as Fortify's.
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;

    try {
        response = await fetch(url, {
            method: options.method ?? 'GET',
            credentials: 'same-origin',
            signal: options.signal,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': csrfToken(),
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
    } catch {
        throw new ApiError('Sem conexão com o servidor.', 0);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(payload?.message ?? 'Não foi possível concluir a solicitação.', response.status, payload?.code ?? null, payload?.errors ?? {});
    }

    return payload as T;
}

export function newIdempotencyKey(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
