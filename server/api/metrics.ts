import { Request, Response, Router } from 'express';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

interface LiveChartPoint {
  time: string;
  requests: number;
  latency: number;
}

interface AuditLogRow {
  created_at: string;
  details: Record<string, unknown> | null;
}

const MIN_SAMPLE_SIZE = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const OPENAI_INPUT_PER_1K = 0.005;
const OPENAI_OUTPUT_PER_1K = 0.015;
const GEMINI_INPUT_PER_1K = 0.00035;
const GEMINI_OUTPUT_PER_1K = 0.00105;
const GROQ_INPUT_PER_1K = 0.0008;
const GROQ_OUTPUT_PER_1K = 0.0008;
const NVIDIA_INPUT_PER_1K = 0.0008;
const NVIDIA_OUTPUT_PER_1K = 0.0008;

const router = Router();

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] || 0);
};

const estimateCostPerRequest = (provider: string, inputTokens: number, outputTokens: number): number => {
  const normalized = provider.toLowerCase();
  const inTokens = Math.max(0, Math.floor(inputTokens));
  const outTokens = Math.max(0, Math.floor(outputTokens));

  if (normalized === 'openai') {
    return (inTokens / 1000) * OPENAI_INPUT_PER_1K + (outTokens / 1000) * OPENAI_OUTPUT_PER_1K;
  }
  if (normalized === 'gemini') {
    return (inTokens / 1000) * GEMINI_INPUT_PER_1K + (outTokens / 1000) * GEMINI_OUTPUT_PER_1K;
  }
  if (normalized === 'groq') {
    return (inTokens / 1000) * GROQ_INPUT_PER_1K + (outTokens / 1000) * GROQ_OUTPUT_PER_1K;
  }
  if (normalized === 'nvidia') {
    return (inTokens / 1000) * NVIDIA_INPUT_PER_1K + (outTokens / 1000) * NVIDIA_OUTPUT_PER_1K;
  }
  return 0;
};

const normalizeProvider = (details: Record<string, unknown>): string => {
  const effectiveProvider = String(
    details.effective_provider ||
    details.effectiveProvider ||
    details.provider ||
    'unknown'
  ).trim().toLowerCase();
  return effectiveProvider || 'unknown';
};

const extractSuccess = (details: Record<string, unknown>): boolean => {
  if (details.success === undefined || details.success === null) return true;
  return toBoolean(details.success);
};

const extractFallback = (details: Record<string, unknown>): boolean => {
  if (toBoolean(details.fallback_applied) || toBoolean(details.fallbackApplied) || toBoolean(details.provider_switched)) {
    return true;
  }
  const requested = String(details.requested_provider || details.requestedProvider || details.provider || '').trim().toLowerCase();
  const effective = String(details.effective_provider || details.effectiveProvider || '').trim().toLowerCase();
  return Boolean(requested && effective && requested !== effective);
};

const formatBucketTime = (timestampMs: number): string =>
  new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const buildChartData = (logs: AuditLogRow[]): LiveChartPoint[] => {
  const bucketCount = 12;
  const now = Date.now();
  const alignedNow = Math.floor(now / ONE_HOUR_MS) * ONE_HOUR_MS;
  const oldestStart = alignedNow - (bucketCount - 1) * ONE_HOUR_MS;

  const points: LiveChartPoint[] = [];
  const latencySums = new Array(bucketCount).fill(0);

  for (let i = 0; i < bucketCount; i += 1) {
    const bucketStart = oldestStart + i * ONE_HOUR_MS;
    points.push({
      time: formatBucketTime(bucketStart),
      requests: 0,
      latency: 0,
    });
  }

  for (const row of logs) {
    const timestamp = Date.parse(String(row.created_at || ''));
    if (!Number.isFinite(timestamp)) continue;
    const index = Math.floor((timestamp - oldestStart) / ONE_HOUR_MS);
    if (index < 0 || index >= bucketCount) continue;
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    const latency = Math.max(0, toNumber((details as Record<string, unknown>).duration));
    points[index].requests += 1;
    latencySums[index] += latency;
  }

  for (let i = 0; i < bucketCount; i += 1) {
    if (points[i].requests > 0) {
      points[i].latency = Math.round(latencySums[i] / points[i].requests);
    }
  }

  return points;
};

const buildPlaceholderChartData = (): LiveChartPoint[] => {
  const patternRequests = [1, 2, 1, 3, 2, 4, 3, 2, 3, 4, 3, 5];
  const patternLatency = [1900, 2100, 1800, 2400, 2200, 2500, 2300, 2100, 2250, 2450, 2320, 2480];
  const now = Date.now();
  const alignedNow = Math.floor(now / ONE_HOUR_MS) * ONE_HOUR_MS;

  return patternRequests.map((requests, index) => {
    const start = alignedNow - (patternRequests.length - 1 - index) * ONE_HOUR_MS;
    return {
      time: formatBucketTime(start),
      requests,
      latency: patternLatency[index],
    };
  });
};

router.get('/live', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const db = supabaseAdmin || supabase;
  const now = new Date();
  const recentStartIso = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const utcDayStart = new Date(now);
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  try {
    const [
      recentLogsResult,
      todayLogsResult,
      totalGenerationsResult,
      thisMonthResult,
      totalProjectsResult,
    ] = await Promise.all([
      db
        .from('audit_logs')
        .select('created_at,details')
        .eq('user_id', userId)
        .eq('action', 'generate_code')
        .gte('created_at', recentStartIso)
        .order('created_at', { ascending: true }),
      db
        .from('audit_logs')
        .select('created_at,details')
        .eq('user_id', userId)
        .eq('action', 'generate_code')
        .gte('created_at', utcDayStart.toISOString()),
      db
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'generate_code'),
      db
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'generate_code')
        .gte('created_at', monthStartUtc.toISOString()),
      db
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null),
    ]);

    if (recentLogsResult.error) {
      throw recentLogsResult.error;
    }
    if (todayLogsResult.error) {
      throw todayLogsResult.error;
    }

    const recentLogs = (recentLogsResult.data || []) as AuditLogRow[];
    const todayLogs = (todayLogsResult.data || []) as AuditLogRow[];

    const durations: number[] = [];
    let successCount = 0;
    let fallbackCount = 0;
    let estimatedCost = 0;

    for (const row of recentLogs) {
      const details = row.details && typeof row.details === 'object' ? row.details : {};
      const typedDetails = details as Record<string, unknown>;
      const duration = Math.max(0, toNumber(typedDetails.duration));
      if (duration > 0) durations.push(duration);
      if (extractSuccess(typedDetails)) successCount += 1;
      if (extractFallback(typedDetails)) fallbackCount += 1;

      const provider = normalizeProvider(typedDetails);
      const inputTokens = Math.max(0, toNumber(typedDetails.tokens_input || typedDetails.tokensInput));
      const outputTokens = Math.max(0, toNumber(typedDetails.tokens_output || typedDetails.tokensOutput));
      estimatedCost += estimateCostPerRequest(provider, inputTokens, outputTokens);
    }

    const requestsToday = todayLogs.length;
    const tokenVolumeToday = todayLogs.reduce((sum, row) => {
      const details = row.details && typeof row.details === 'object' ? row.details : {};
      const typedDetails = details as Record<string, unknown>;
      const input = Math.max(0, toNumber(typedDetails.tokens_input || typedDetails.tokensInput));
      const output = Math.max(0, toNumber(typedDetails.tokens_output || typedDetails.tokensOutput));
      return sum + input + output;
    }, 0);

    const totalRequests = recentLogs.length;
    const safeTotalRequests = Math.max(1, totalRequests);
    const p95Latency = percentile(durations, 0.95);
    const successRate = totalRequests > 0 ? Number((successCount / safeTotalRequests).toFixed(4)) : 0;
    const fallbackRate = totalRequests > 0 ? Number((fallbackCount / safeTotalRequests).toFixed(4)) : 0;
    const costPerRequest = totalRequests > 0 ? Number((estimatedCost / safeTotalRequests).toFixed(6)) : 0;
    const requestsNeeded = Math.max(0, MIN_SAMPLE_SIZE - totalRequests);

    return res.json({
      p95Latency,
      successRate,
      fallbackRate,
      costPerRequest,
      requestsToday,
      tokenVolumeToday: Math.max(0, Math.round(tokenVolumeToday)),
      chartData: totalRequests > 0 ? buildChartData(recentLogs) : buildPlaceholderChartData(),
      requestsNeeded,
      message: requestsNeeded > 0 ? 'Generate 5 projects to see your metrics' : undefined,
      totalProjects: Math.max(0, Number(totalProjectsResult.count || 0)),
      totalGenerations: Math.max(0, Number(totalGenerationsResult.count || 0)),
      thisMonthGenerations: Math.max(0, Number(thisMonthResult.count || 0)),
    });
  } catch (error: any) {
    console.warn('[Metrics] live endpoint fallback response due to error:', error?.message || error);
    return res.json({
      p95Latency: 0,
      successRate: 0,
      fallbackRate: 0,
      costPerRequest: 0,
      requestsToday: 0,
      tokenVolumeToday: 0,
      chartData: buildPlaceholderChartData(),
      requestsNeeded: MIN_SAMPLE_SIZE,
      message: 'Generate 5 projects to see your metrics',
      totalProjects: 0,
      totalGenerations: 0,
      thisMonthGenerations: 0,
    });
  }
});

export default router;
