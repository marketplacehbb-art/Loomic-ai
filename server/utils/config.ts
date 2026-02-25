/**
 * Environment Configuration
 */

export const config = {
  // App
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // LLM
  geminiApiKey: process.env.VITE_GEMINI_API_KEY || '',

  // Supabase (Legacy)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Rate Limiting
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : 900000,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 100,

  // App URL
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Features
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.geminiApiKey) {
    errors.push('VITE_GEMINI_API_KEY is not configured');
  }

  return errors;
}
