import rateLimit from 'express-rate-limit';

// Global API Limiter (Basic protection)
// 15 minutes, 100 requests per IP
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    }
});

// Strict Generation Limiter (Expensive operations)
// 1 minute, 10 requests per IP
export const generationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Generation rate limit exceeded. Please wait a moment.',
        code: 'RATE_LIMIT_EXCEEDED'
    }
});
