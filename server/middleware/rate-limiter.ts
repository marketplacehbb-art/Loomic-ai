import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

function toPositiveInt(input: string | undefined, fallback: number): number {
    const value = Number.parseInt(String(input || ''), 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeScopePart(value: unknown, maxLength = 128): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const sanitized = trimmed
        .replace(/[^A-Za-z0-9._:-]/g, '')
        .replace(/\.{2,}/g, '')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '');
    return sanitized.slice(0, maxLength);
}

function extractScopedProjectId(req: Request): string {
    const bodyProjectId = normalizeScopePart((req.body as any)?.projectId, 96);
    if (bodyProjectId) return bodyProjectId;

    const queryProjectId = normalizeScopePart((req.query as any)?.projectId, 96);
    if (queryProjectId) return queryProjectId;

    return '';
}

export function resolveRateLimitScopeKey(req: Request): string {
    const authUserId = normalizeScopePart((req as any)?.authUser?.id, 96);
    const identity = authUserId
        ? `user:${authUserId}`
        : `ip:${normalizeScopePart(req.ip || req.socket?.remoteAddress || 'unknown', 96) || 'unknown'}`;

    const projectId = extractScopedProjectId(req);
    return projectId ? `${identity}|project:${projectId}` : identity;
}

function createLimiter(options: {
    windowMs: number;
    max: number;
    errorMessage: string;
}) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => resolveRateLimitScopeKey(req),
        message: {
            success: false,
            error: options.errorMessage,
            code: 'RATE_LIMIT_EXCEEDED',
        },
    });
}

const API_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_API_WINDOW_MS, toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000));
const API_MAX_REQUESTS = toPositiveInt(process.env.RATE_LIMIT_API_MAX_REQUESTS, toPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100));

const GENERATE_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_GENERATE_WINDOW_MS, 60 * 1000);
const GENERATE_MAX_REQUESTS = toPositiveInt(process.env.RATE_LIMIT_GENERATE_MAX_REQUESTS, 10);

const GIT_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_GIT_WINDOW_MS, 60 * 1000);
const GIT_MAX_REQUESTS = toPositiveInt(process.env.RATE_LIMIT_GIT_MAX_REQUESTS, 60);

const SECURITY_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_SECURITY_WINDOW_MS, 60 * 1000);
const SECURITY_MAX_REQUESTS = toPositiveInt(process.env.RATE_LIMIT_SECURITY_MAX_REQUESTS, 30);

export const apiLimiter = createLimiter({
    windowMs: API_WINDOW_MS,
    max: API_MAX_REQUESTS,
    errorMessage: 'Too many requests, please try again later.',
});

export const generationLimiter = createLimiter({
    windowMs: GENERATE_WINDOW_MS,
    max: GENERATE_MAX_REQUESTS,
    errorMessage: 'Generation rate limit exceeded. Please wait a moment.',
});

export const gitLimiter = createLimiter({
    windowMs: GIT_WINDOW_MS,
    max: GIT_MAX_REQUESTS,
    errorMessage: 'Git API rate limit exceeded. Please wait a moment.',
});

export const securityLimiter = createLimiter({
    windowMs: SECURITY_WINDOW_MS,
    max: SECURITY_MAX_REQUESTS,
    errorMessage: 'Security API rate limit exceeded. Please wait a moment.',
});
