/**
 * Express API Server Entry Point
 * Handles LLM API requests
 */

import dotenv from 'dotenv';

// Load environment variables FIRST - before any other imports
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import generateRouter from './api/generate.js';
import gitRouter from './api/git/routes.js';
import supabaseIntegrationRouter from './api/integrations/supabase.js';
import cloudRouter from './api/cloud.js';
import publishRouter from './api/publish.js';
import metricsRouter from './api/metrics.js';
import userRouter from './api/user.js';
import billingRouter from './api/billing.js';
import securityScanRouter from './api/security/scan.js';
import { apiLimiter, generationLimiter, gitLimiter, securityLimiter } from './middleware/rate-limiter.js';
import { usageMonitor } from './middleware/usage-monitor.js';
import { requireAuth } from './middleware/auth.js';
import {
  getReleaseStatus,
  releaseGate,
  updateReleaseConfig,
  verifyReleaseAdminToken,
} from './middleware/release-control.js';
import {
  detectClientExposedSecrets,
  getDeepSeekApiKey,
  getGeminiApiKey,
  getGroqApiKey,
  getNvidiaApiKey,
  getOpenAIApiKey,
  getOpenRouterApiKey,
} from './utils/env-security.js';
import { sanitizeErrorForLog, sanitizeErrorMessage } from './utils/error-sanitizer.js';

const app = express();
const PORT = process.env.API_PORT || 3001;
const defaultCorsOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedCorsOrigins = configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultCorsOrigins;

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

// Security Headers
app.use(helmet());

// CORS - Allow requests from Vite dev server
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedCorsOrigins.includes(origin));
    },
    credentials: true
  })
);

// JSON body parser
app.use(express.json({ limit: '10mb' }));

// Rate Limiting
app.use('/api', apiLimiter); // Global limit for all API routes
app.use('/api/generate', requireAuth);
app.use('/api/git', requireAuth);
app.use('/api/security', requireAuth);
app.use('/api/cloud', requireAuth);
app.use('/api/publish', requireAuth);
app.use('/api/metrics', requireAuth);
app.use('/api/user', requireAuth);
app.use('/api/billing', requireAuth);
app.use('/api/integrations', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/supabase/callback') return next();
  return requireAuth(req, res, next);
});
app.use('/api/generate', generationLimiter); // Strict limit for generation
app.use('/api/generate', releaseGate); // Canary/rollback release gate
app.use('/api/git', gitLimiter); // Git route class limit
app.use('/api/security', securityLimiter); // Security route class limit
app.use('/api/generate', usageMonitor); // User quota check

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  const openRouterKey = getOpenRouterApiKey();
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();
  const nvidiaKey = getNvidiaApiKey();
  const deepSeekKey = getDeepSeekApiKey();
  const openaiKey = getOpenAIApiKey();

  const geminiConfigured = Boolean(
    (openRouterKey && openRouterKey.trim()) ||
    (geminiKey && geminiKey.trim())
  );
  const openaiConfigured = Boolean(
    openaiKey && openaiKey.trim()
  );
  const groqConfigured = Boolean(
    groqKey && groqKey.trim()
  );
  const nvidiaConfigured = Boolean(
    nvidiaKey && nvidiaKey.trim()
  );
  const deepSeekConfigured = Boolean(
    deepSeekKey && deepSeekKey.trim()
  );

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    providers: {
      gemini: {
        configured: geminiConfigured,
        gateway: openRouterKey ? 'openrouter' : 'direct-or-default'
      },
      groq: {
        configured: groqConfigured
      },
      openai: {
        configured: openaiConfigured
      },
      nvidia: {
        configured: nvidiaConfigured
      },
      deepseek: {
        configured: deepSeekConfigured
      }
    },
    release: getReleaseStatus(),
  });
});

app.get('/api/release/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    release: getReleaseStatus(),
  });
});

app.post('/api/release/control', (req: Request, res: Response) => {
  if (!verifyReleaseAdminToken(req)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: invalid release admin token',
      code: 'RELEASE_ADMIN_UNAUTHORIZED',
    });
  }

  const mode = typeof req.body?.mode === 'string' ? req.body.mode : undefined;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
  const killSwitch = typeof req.body?.killSwitch === 'boolean' ? req.body.killSwitch : undefined;
  const canaryPercent = Number.isFinite(Number(req.body?.canaryPercent))
    ? Number(req.body.canaryPercent)
    : undefined;
  const enforceCanary = typeof req.body?.enforceCanary === 'boolean'
    ? req.body.enforceCanary
    : undefined;

  const release = updateReleaseConfig({
    mode: mode as any,
    reason,
    killSwitch,
    canaryPercent,
    enforceCanary,
  });

  return res.json({
    success: true,
    release,
  });
});

// Main API routes
app.use('/api', generateRouter);
app.use('/api/git', gitRouter);
app.use('/api/security', securityScanRouter);
app.use('/api/cloud', cloudRouter);
app.use('/api/publish', publishRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/user', userRouter);
app.use('/api/billing', billingRouter);
app.use('/api/integrations/supabase', supabaseIntegrationRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Server Error:', {
    path: req.path,
    method: req.method,
    message: sanitizeErrorForLog(err),
    status: Number((err as any)?.status) || undefined,
    code: typeof (err as any)?.code === 'string' ? (err as any).code : undefined,
  });
  const safeDevMessage = sanitizeErrorMessage(err, {
    fallback: 'Unexpected server error',
    maxLength: 320,
  });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? safeDevMessage : 'Something went wrong'
  });
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════

// --- Server Startup ---
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    const { iconRegistry } = await import('./utils/icon-registry.js');
    await iconRegistry.discoverIcons();
    const stats = iconRegistry.getStats();
    console.log(`📊 Icon Registry: ${stats.totalIcons} icons in ${stats.categories} categories`);
  } catch (error) {
    console.error('⚠️  Icon registry initialization failed, continuing with fallback:', error);
  }

  server = app.listen(PORT, () => {
    console.log('\n🚀 ═══════════════════════════════════════');
    console.log(`✅ API Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    const exposedSecrets = detectClientExposedSecrets();
    console.log(`🔑 Gemini API Key: ${getGeminiApiKey() ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 Groq API Key: ${getGroqApiKey() ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 OpenAI API Key: ${getOpenAIApiKey() ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 OpenRouter API Key: ${getOpenRouterApiKey() ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 NVIDIA API Key: ${getNvidiaApiKey() ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 DeepSeek API Key: ${process.env.DEEPSEEK_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 Vercel Token: ${process.env.VERCEL_TOKEN ? '✓ Configured' : '✗ Missing'}`);
    if (exposedSecrets.length > 0) {
      console.warn(
        `[Security] Client-exposed secret env keys detected: ${exposedSecrets.join(', ')}. ` +
        'Move these to server-only env names immediately.'
      );
    }
    console.log('═══════════════════════════════════════\n');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please kill the process using it.`);
    } else {
      console.error('❌ Server error:', err);
    }
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`👋 ${signal} received, shutting down gracefully...`);
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

