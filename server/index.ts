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
import { apiLimiter, generationLimiter } from './middleware/rate-limiter.js';
import { usageMonitor } from './middleware/usage-monitor.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

// Security Headers
app.use(helmet());

// CORS - Allow requests from Vite dev server
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  })
);

// JSON body parser
app.use(express.json({ limit: '10mb' }));

// Rate Limiting
app.use('/api', apiLimiter); // Global limit for all API routes
app.use('/api/generate', requireAuth);
app.use('/api/git', requireAuth);
app.use('/api/integrations', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/supabase/callback') return next();
  return requireAuth(req, res, next);
});
app.use('/api/generate', generationLimiter); // Strict limit for generation
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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main API routes
app.use('/api', generateRouter);
app.use('/api/git', gitRouter);
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
  console.error('❌ Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
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
    console.log(`🔑 Gemini API Key: ${process.env.VITE_GEMINI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🔑 DeepSeek API Key: ${process.env.VITE_DEEPSEEK_API_KEY ? '✓ Configured' : '✗ Missing'}`);
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

