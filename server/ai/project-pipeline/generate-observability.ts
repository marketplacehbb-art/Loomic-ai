export interface GenerateObservabilityEvent {
  timestamp?: number;
  requestedProvider: 'gemini' | 'groq' | 'openai' | 'nvidia' | 'unknown';
  effectiveProvider: 'gemini' | 'groq' | 'openai' | 'nvidia' | 'unknown';
  generationMode: 'new' | 'edit' | 'unknown';
  success: boolean;
  durationMs: number;
  processingTimeMs?: number;
  fallbackApplied?: boolean;
  errorCategory?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateObservabilityMetrics {
  windowStartMs: number;
  windowEndMs: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  fallbackRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  avgProcessingTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providers: Record<string, {
    requests: number;
    successRate: number;
    avgDurationMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  errorCategories: Record<string, number>;
  generationModes: Record<string, number>;
  costPerRequestUsd: number;
  thresholds: GenerateObservabilityThresholds;
  alerts: GenerateObservabilityAlert[];
}

export interface GenerateObservabilityThresholds {
  minSampleSize: number;
  maxP95DurationMs: number;
  minSuccessRate: number;
  maxFallbackRate: number;
  maxCostPerRequestUsd: number;
}

export type GenerateObservabilityAlertSeverity = 'warning' | 'critical';

export interface GenerateObservabilityAlert {
  id: 'p95_latency' | 'success_rate' | 'fallback_rate' | 'cost_per_request';
  severity: GenerateObservabilityAlertSeverity;
  title: string;
  message: string;
  value: number;
  threshold: number;
}

export interface GenerateSloCheck {
  id: 'p95_latency' | 'success_rate' | 'fallback_rate' | 'cost_per_request';
  pass: boolean;
  value: number;
  threshold: number;
  comparator: '<=' | '>=';
}

export interface GenerateSloStatus {
  windowStartMs: number;
  windowEndMs: number;
  totalRequests: number;
  minSampleSize: number;
  status: 'pass' | 'fail' | 'insufficient_data';
  checks: GenerateSloCheck[];
}

const DEFAULT_OPENAI_INPUT_COST_PER_1K = 0.005;
const DEFAULT_OPENAI_OUTPUT_COST_PER_1K = 0.015;
const DEFAULT_GEMINI_INPUT_COST_PER_1K = 0.00035;
const DEFAULT_GEMINI_OUTPUT_COST_PER_1K = 0.00105;
const DEFAULT_GROQ_INPUT_COST_PER_1K = 0.0008;
const DEFAULT_GROQ_OUTPUT_COST_PER_1K = 0.0008;
const DEFAULT_NVIDIA_INPUT_COST_PER_1K = 0.0008;
const DEFAULT_NVIDIA_OUTPUT_COST_PER_1K = 0.0008;
const DEFAULT_ALERT_MIN_SAMPLE_SIZE = 5;
const DEFAULT_ALERT_MAX_P95_MS = 12000;
const DEFAULT_ALERT_MIN_SUCCESS_RATE = 0.9;
const DEFAULT_ALERT_MAX_FALLBACK_RATE = 0.2;
const DEFAULT_ALERT_MAX_COST_PER_REQUEST_USD = 0.03;

function toPositiveNumber(input: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(String(input || ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toBoundedRatio(input: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(String(input || ''));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function buildThresholds(): GenerateObservabilityThresholds {
  return {
    minSampleSize: Math.max(
      1,
      Math.floor(toPositiveNumber(process.env.OBS_ALERT_MIN_SAMPLE_SIZE, DEFAULT_ALERT_MIN_SAMPLE_SIZE))
    ),
    maxP95DurationMs: Math.max(
      0,
      Math.round(toPositiveNumber(process.env.OBS_ALERT_MAX_P95_MS, DEFAULT_ALERT_MAX_P95_MS))
    ),
    minSuccessRate: toBoundedRatio(process.env.OBS_ALERT_MIN_SUCCESS_RATE, DEFAULT_ALERT_MIN_SUCCESS_RATE),
    maxFallbackRate: toBoundedRatio(process.env.OBS_ALERT_MAX_FALLBACK_RATE, DEFAULT_ALERT_MAX_FALLBACK_RATE),
    maxCostPerRequestUsd: toPositiveNumber(
      process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD,
      DEFAULT_ALERT_MAX_COST_PER_REQUEST_USD
    ),
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return Math.round(values[0]);
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index]);
}

function round2(input: number): number {
  return Number(input.toFixed(2));
}

function round4(input: number): number {
  return Number(input.toFixed(4));
}

function estimateCostUsd(provider: string, inputTokens: number, outputTokens: number): number {
  const normalized = String(provider || '').toLowerCase();
  const inTokens = Math.max(0, Math.floor(inputTokens || 0));
  const outTokens = Math.max(0, Math.floor(outputTokens || 0));

  if (normalized === 'openai') {
    const inCost = (inTokens / 1000) * toPositiveNumber(process.env.EST_COST_OPENAI_INPUT_PER_1K, DEFAULT_OPENAI_INPUT_COST_PER_1K);
    const outCost = (outTokens / 1000) * toPositiveNumber(process.env.EST_COST_OPENAI_OUTPUT_PER_1K, DEFAULT_OPENAI_OUTPUT_COST_PER_1K);
    return inCost + outCost;
  }

  if (normalized === 'gemini') {
    const inCost = (inTokens / 1000) * toPositiveNumber(process.env.EST_COST_GEMINI_INPUT_PER_1K, DEFAULT_GEMINI_INPUT_COST_PER_1K);
    const outCost = (outTokens / 1000) * toPositiveNumber(process.env.EST_COST_GEMINI_OUTPUT_PER_1K, DEFAULT_GEMINI_OUTPUT_COST_PER_1K);
    return inCost + outCost;
  }

  if (normalized === 'groq') {
    const inCost = (inTokens / 1000) * toPositiveNumber(process.env.EST_COST_GROQ_INPUT_PER_1K, DEFAULT_GROQ_INPUT_COST_PER_1K);
    const outCost = (outTokens / 1000) * toPositiveNumber(process.env.EST_COST_GROQ_OUTPUT_PER_1K, DEFAULT_GROQ_OUTPUT_COST_PER_1K);
    return inCost + outCost;
  }

  if (normalized === 'nvidia') {
    const inCost = (inTokens / 1000) * toPositiveNumber(process.env.EST_COST_NVIDIA_INPUT_PER_1K, DEFAULT_NVIDIA_INPUT_COST_PER_1K);
    const outCost = (outTokens / 1000) * toPositiveNumber(process.env.EST_COST_NVIDIA_OUTPUT_PER_1K, DEFAULT_NVIDIA_OUTPUT_COST_PER_1K);
    return inCost + outCost;
  }

  return 0;
}

export class GenerateObservabilityCollector {
  private events: GenerateObservabilityEvent[] = [];
  private readonly maxEvents = 20_000;

  record(event: GenerateObservabilityEvent): void {
    if (!event) return;
    const timestamp = Number.isFinite(event.timestamp) ? Number(event.timestamp) : Date.now();
    this.events.push({
      ...event,
      timestamp,
      durationMs: Math.max(0, Math.round(Number(event.durationMs) || 0)),
      processingTimeMs: Number.isFinite(event.processingTimeMs)
        ? Math.max(0, Math.round(Number(event.processingTimeMs)))
        : undefined,
      inputTokens: Number.isFinite(event.inputTokens) ? Math.max(0, Math.floor(Number(event.inputTokens))) : 0,
      outputTokens: Number.isFinite(event.outputTokens) ? Math.max(0, Math.floor(Number(event.outputTokens))) : 0,
      fallbackApplied: Boolean(event.fallbackApplied),
      success: Boolean(event.success),
      requestedProvider: (event.requestedProvider || 'unknown') as GenerateObservabilityEvent['requestedProvider'],
      effectiveProvider: (event.effectiveProvider || 'unknown') as GenerateObservabilityEvent['effectiveProvider'],
      generationMode: (event.generationMode || 'unknown') as GenerateObservabilityEvent['generationMode'],
      errorCategory: typeof event.errorCategory === 'string' ? event.errorCategory : undefined,
    });

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(this.events.length - this.maxEvents);
    }
  }

  getMetrics(windowMs = 3_600_000): GenerateObservabilityMetrics {
    const now = Date.now();
    const safeWindow = Number.isFinite(windowMs) ? Math.max(60_000, Math.floor(windowMs)) : 3_600_000;
    const cutoff = now - safeWindow;
    const items = this.events.filter((event) => Number(event.timestamp) >= cutoff);

    const durations = items.map((event) => event.durationMs).filter((value) => Number.isFinite(value));
    const processingTimes = items
      .map((event) => event.processingTimeMs)
      .filter((value): value is number => Number.isFinite(value));

    const successCount = items.filter((event) => event.success).length;
    const failureCount = Math.max(0, items.length - successCount);
    const fallbackCount = items.filter((event) => event.fallbackApplied).length;

    const providers: GenerateObservabilityMetrics['providers'] = {};
    const errorCategories: Record<string, number> = {};
    const generationModes: Record<string, number> = {};

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCostUsd = 0;

    for (const event of items) {
      const provider = event.effectiveProvider || 'unknown';
      if (!providers[provider]) {
        providers[provider] = {
          requests: 0,
          successRate: 0,
          avgDurationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        };
      }

      providers[provider].requests += 1;
      if (event.success) {
        providers[provider].successRate += 1;
      }
      providers[provider].avgDurationMs += event.durationMs;
      providers[provider].inputTokens += event.inputTokens || 0;
      providers[provider].outputTokens += event.outputTokens || 0;

      totalInputTokens += event.inputTokens || 0;
      totalOutputTokens += event.outputTokens || 0;

      const eventCost = estimateCostUsd(provider, event.inputTokens || 0, event.outputTokens || 0);
      providers[provider].estimatedCostUsd += eventCost;
      estimatedCostUsd += eventCost;

      const mode = event.generationMode || 'unknown';
      generationModes[mode] = (generationModes[mode] || 0) + 1;

      if (!event.success) {
        const category = event.errorCategory || 'unknown';
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      }
    }

    Object.entries(providers).forEach(([provider, stats]) => {
      const requestCount = Math.max(1, stats.requests);
      const providerSuccessRaw = stats.successRate / requestCount;
      providers[provider].successRate = round4(providerSuccessRaw);
      providers[provider].avgDurationMs = Math.round(stats.avgDurationMs / requestCount);
      providers[provider].totalTokens = stats.inputTokens + stats.outputTokens;
      providers[provider].estimatedCostUsd = round4(stats.estimatedCostUsd);
    });

    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;
    const avgProcessingTimeMs = processingTimes.length > 0
      ? Math.round(processingTimes.reduce((sum, value) => sum + value, 0) / processingTimes.length)
      : 0;
    const costPerRequestUsd = items.length > 0 ? round4(estimatedCostUsd / items.length) : 0;
    const thresholds = buildThresholds();
    const alerts: GenerateObservabilityAlert[] = [];

    if (items.length >= thresholds.minSampleSize) {
      const p95DurationMs = percentile(durations, 0.95);
      const successRate = items.length > 0 ? round4(successCount / items.length) : 0;
      const fallbackRate = items.length > 0 ? round4(fallbackCount / items.length) : 0;

      if (p95DurationMs > thresholds.maxP95DurationMs) {
        alerts.push({
          id: 'p95_latency',
          severity: 'critical',
          title: 'High P95 latency',
          message: `P95 latency is ${p95DurationMs} ms (threshold ${thresholds.maxP95DurationMs} ms).`,
          value: p95DurationMs,
          threshold: thresholds.maxP95DurationMs,
        });
      }

      if (successRate < thresholds.minSuccessRate) {
        alerts.push({
          id: 'success_rate',
          severity: 'critical',
          title: 'Low success rate',
          message: `Success rate is ${Math.round(successRate * 100)}% (threshold ${Math.round(
            thresholds.minSuccessRate * 100
          )}%).`,
          value: successRate,
          threshold: thresholds.minSuccessRate,
        });
      }

      if (fallbackRate > thresholds.maxFallbackRate) {
        alerts.push({
          id: 'fallback_rate',
          severity: 'warning',
          title: 'High fallback rate',
          message: `Fallback rate is ${Math.round(fallbackRate * 100)}% (threshold ${Math.round(
            thresholds.maxFallbackRate * 100
          )}%).`,
          value: fallbackRate,
          threshold: thresholds.maxFallbackRate,
        });
      }

      if (costPerRequestUsd > thresholds.maxCostPerRequestUsd) {
        alerts.push({
          id: 'cost_per_request',
          severity: 'warning',
          title: 'High cost per request',
          message: `Cost/request is $${costPerRequestUsd.toFixed(4)} (threshold $${thresholds.maxCostPerRequestUsd.toFixed(
            4
          )}).`,
          value: costPerRequestUsd,
          threshold: thresholds.maxCostPerRequestUsd,
        });
      }
    }

    return {
      windowStartMs: cutoff,
      windowEndMs: now,
      totalRequests: items.length,
      successCount,
      failureCount,
      successRate: items.length > 0 ? round4(successCount / items.length) : 0,
      fallbackRate: items.length > 0 ? round4(fallbackCount / items.length) : 0,
      avgDurationMs,
      p50DurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      avgProcessingTimeMs,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCostUsd: round4(estimatedCostUsd),
      providers,
      errorCategories,
      generationModes,
      costPerRequestUsd,
      thresholds,
      alerts,
    };
  }

  getSloStatus(windowMs = 3_600_000): GenerateSloStatus {
    const metrics = this.getMetrics(windowMs);
    const thresholds = metrics.thresholds;
    const checks: GenerateSloCheck[] = [
      {
        id: 'p95_latency',
        pass: metrics.p95DurationMs <= thresholds.maxP95DurationMs,
        value: metrics.p95DurationMs,
        threshold: thresholds.maxP95DurationMs,
        comparator: '<=',
      },
      {
        id: 'success_rate',
        pass: metrics.successRate >= thresholds.minSuccessRate,
        value: metrics.successRate,
        threshold: thresholds.minSuccessRate,
        comparator: '>=',
      },
      {
        id: 'fallback_rate',
        pass: metrics.fallbackRate <= thresholds.maxFallbackRate,
        value: metrics.fallbackRate,
        threshold: thresholds.maxFallbackRate,
        comparator: '<=',
      },
      {
        id: 'cost_per_request',
        pass: metrics.costPerRequestUsd <= thresholds.maxCostPerRequestUsd,
        value: metrics.costPerRequestUsd,
        threshold: thresholds.maxCostPerRequestUsd,
        comparator: '<=',
      },
    ];

    if (metrics.totalRequests < thresholds.minSampleSize) {
      return {
        windowStartMs: metrics.windowStartMs,
        windowEndMs: metrics.windowEndMs,
        totalRequests: metrics.totalRequests,
        minSampleSize: thresholds.minSampleSize,
        status: 'insufficient_data',
        checks,
      };
    }

    return {
      windowStartMs: metrics.windowStartMs,
      windowEndMs: metrics.windowEndMs,
      totalRequests: metrics.totalRequests,
      minSampleSize: thresholds.minSampleSize,
      status: checks.every((check) => check.pass) ? 'pass' : 'fail',
      checks,
    };
  }

  reset(): void {
    this.events = [];
  }
}

export const generateObservability = new GenerateObservabilityCollector();
