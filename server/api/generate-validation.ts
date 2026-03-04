export type SupportedProvider = 'gemini' | 'groq' | 'openai' | 'nvidia';

export function isSupportedProvider(value: unknown): value is SupportedProvider {
    return value === 'gemini' || value === 'groq' || value === 'openai' || value === 'nvidia';
}

export type ProviderErrorCategory = 'rate_limit' | 'provider_down' | 'auth_error' | 'unknown';

export interface ClassifiedProviderError {
    category: ProviderErrorCategory;
    statusCode: number;
    code: string;
    retryable: boolean;
    suggestedProvider?: SupportedProvider;
}

export function getAlternateProvider(provider: SupportedProvider): SupportedProvider {
    if (provider === 'gemini') return 'groq';
    if (provider === 'groq') return 'openai';
    if (provider === 'openai') return 'nvidia';
    return 'groq';
}

export function extractProviderErrorStatus(error: any): number {
    const direct = Number(error?.status ?? error?.code);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const primary = Number(error?.primaryError?.status ?? error?.primaryError?.code);
    if (Number.isFinite(primary) && primary > 0) return primary;
    return 0;
}

export function isMissingRpcError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === 'PGRST202' ||
        code === '42883' ||
        message.includes('could not find the function') ||
        (message.includes('function') && message.includes('does not exist'))
    );
}

export function toObservedProvider(value: unknown): 'gemini' | 'groq' | 'openai' | 'nvidia' | 'unknown' {
    return isSupportedProvider(value) ? value : 'unknown';
}

export function classifyProviderError(error: any, requestedProvider: unknown): ClassifiedProviderError {
    const status = extractProviderErrorStatus(error);
    const provider = isSupportedProvider(requestedProvider) ? requestedProvider : undefined;
    const suggestedProvider = provider ? getAlternateProvider(provider) : undefined;

    const messageCorpus = [
        typeof error?.message === 'string' ? error.message : '',
        typeof error?.primaryError?.message === 'string' ? error.primaryError.message : '',
        Array.isArray(error?.fallbackErrors)
            ? error.fallbackErrors.map((entry: any) => String(entry?.error || '')).join(' | ')
            : '',
        typeof error?.body === 'string' ? error.body : '',
    ].join(' | ').toLowerCase();

    const isRateLimit =
        status === 402 ||
        status === 429 ||
        error?.code === 'RESOURCE_EXHAUSTED' ||
        /rate limit|quota|too many requests|resource_exhausted|insufficient_quota|credits_or_quota/.test(messageCorpus);

    if (isRateLimit) {
        return {
            category: 'rate_limit',
            statusCode: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            retryable: true,
            suggestedProvider,
        };
    }

    const isAuthError =
        status === 401 ||
        status === 403 ||
        /api key missing|invalid api key|incorrect api key|unauthorized|forbidden|authentication|provider_auth_error/.test(messageCorpus);

    if (isAuthError) {
        return {
            category: 'auth_error',
            statusCode: 502,
            code: 'PROVIDER_AUTH_ERROR',
            retryable: false,
            suggestedProvider,
        };
    }

    const isTimeout =
        status === 408 ||
        status === 504 ||
        /timeout|timed out|request timed out|etimedout|aborted/.test(messageCorpus);

    const isProviderDown =
        isTimeout ||
        [500, 502, 503, 520, 521, 522, 523, 524].includes(status) ||
        /temporarily unavailable|service unavailable|gateway|upstream|network|fetch failed|econnreset|enotfound|overloaded/.test(
            messageCorpus
        );

    if (isProviderDown) {
        return {
            category: 'provider_down',
            statusCode: isTimeout ? 504 : 503,
            code: isTimeout ? 'REQUEST_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
            retryable: true,
            suggestedProvider,
        };
    }

    return {
        category: 'unknown',
        statusCode: 500,
        code: 'GENERATION_ERROR',
        retryable: false,
    };
}
