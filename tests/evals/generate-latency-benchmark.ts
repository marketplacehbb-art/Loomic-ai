import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import generateRouter from '../../server/api/generate.js';

dotenv.config();

type Provider = 'gemini' | 'openai';

interface PromptCase {
  id: string;
  prompt: string;
}

interface RunSample {
  run: number;
  promptId: string;
  success: boolean;
  httpStatus: number;
  e2eMs: number;
  apiDurationMs?: number;
  processingTimeMs?: number;
  errorCode?: string;
  errorMessage?: string;
  stageTimingsMs?: Record<string, number>;
}

interface MetricSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
}

const DEFAULT_PROMPTS: PromptCase[] = [
  {
    id: 'simple-landing',
    prompt:
      'Build a modern landing page with hero, features, FAQ, and contact section using React and Tailwind.',
  },
  {
    id: 'dashboard-data',
    prompt:
      'Create an admin dashboard with sidebar navigation, KPI cards, chart area, and sortable table.',
  },
  {
    id: 'edit-styling',
    prompt:
      'Improve the overall visual style: cleaner spacing, better typography hierarchy, and premium colors.',
  },
];

function toNumber(input: string | undefined, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarize(values: number[]): MetricSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
    mean: Number((sum / values.length).toFixed(2)),
    p50: Number(percentile(values, 50).toFixed(2)),
    p95: Number(percentile(values, 95).toFixed(2)),
  };
}

function pickProvider(): Provider {
  const envProvider = (process.env.BENCH_PROVIDER || '').trim().toLowerCase();
  if (envProvider === 'gemini' || envProvider === 'openai') {
    return envProvider;
  }
  if (process.env.VITE_GEMINI_API_KEY || process.env.VITE_OPENROUTER_API_KEY) {
    return 'gemini';
  }
  return 'openai';
}

function parsePromptsFromEnv(): PromptCase[] {
  const raw = (process.env.BENCH_PROMPT || '').trim();
  if (!raw) return DEFAULT_PROMPTS;
  return [{ id: 'custom', prompt: raw }];
}

async function run(): Promise<void> {
  const provider = pickProvider();
  const runs = Math.max(1, Math.floor(toNumber(process.env.BENCH_RUNS, 12)));
  const warmupRuns = Math.max(0, Math.floor(toNumber(process.env.BENCH_WARMUP, 2)));
  const maxTokens = Math.max(512, Math.floor(toNumber(process.env.BENCH_MAX_TOKENS, 4200)));
  const requestTimeoutMs = Math.max(10000, Math.floor(toNumber(process.env.BENCH_TIMEOUT_MS, 180000)));
  const prompts = parsePromptsFromEnv();
  const totalRequests = warmupRuns + runs;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', generateRouter);

  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind benchmark server on ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const samples: RunSample[] = [];
  const stageAccumulator = new Map<string, number[]>();

  console.log(
    `[Benchmark] Starting generate latency benchmark: provider=${provider}, warmup=${warmupRuns}, runs=${runs}, prompts=${prompts.length}`
  );

  for (let index = 0; index < totalRequests; index += 1) {
    const promptCase = prompts[index % prompts.length];
    const isWarmup = index < warmupRuns;
    const runLabel = isWarmup ? `warmup-${index + 1}` : `run-${index - warmupRuns + 1}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const startedAt = performance.now();

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          prompt: promptCase.prompt,
          validate: true,
          bundle: true,
          maxTokens,
        }),
        signal: controller.signal,
      });

      const e2eMs = Number((performance.now() - startedAt).toFixed(2));
      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          success: false,
          code: 'NON_JSON_RESPONSE',
          error: text.slice(0, 500),
        };
      }

      if (!isWarmup) {
        const sample: RunSample = {
          run: index - warmupRuns + 1,
          promptId: promptCase.id,
          success: Boolean(response.ok && data?.success),
          httpStatus: response.status,
          e2eMs,
          apiDurationMs: typeof data?.duration === 'number' ? data.duration : undefined,
          processingTimeMs: typeof data?.processingTime === 'number' ? data.processingTime : undefined,
          errorCode: typeof data?.code === 'string' ? data.code : undefined,
          errorMessage: typeof data?.error === 'string' ? data.error : undefined,
          stageTimingsMs:
            data?.pipeline?.timingsMs && typeof data.pipeline.timingsMs === 'object'
              ? data.pipeline.timingsMs
              : undefined,
        };
        samples.push(sample);

        if (sample.stageTimingsMs) {
          Object.entries(sample.stageTimingsMs).forEach(([stage, value]) => {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
            const list = stageAccumulator.get(stage) || [];
            list.push(value);
            stageAccumulator.set(stage, list);
          });
        }
      }

      console.log(
        `[Benchmark] ${runLabel}: status=${response.status} success=${Boolean(data?.success)} e2e=${e2eMs}ms prompt=${promptCase.id}`
      );
    } catch (error: any) {
      const e2eMs = Number((performance.now() - startedAt).toFixed(2));
      if (!isWarmup) {
        samples.push({
          run: index - warmupRuns + 1,
          promptId: promptCase.id,
          success: false,
          httpStatus: 0,
          e2eMs,
          errorCode: 'BENCH_REQUEST_FAILED',
          errorMessage: error?.message || String(error),
        });
      }
      console.log(`[Benchmark] ${runLabel}: request failed after ${e2eMs}ms (${error?.message || error})`);
    } finally {
      clearTimeout(timeout);
    }
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  const successfulSamples = samples.filter((sample) => sample.success);
  const failedSamples = samples.filter((sample) => !sample.success);

  const e2eSummary = summarize(samples.map((sample) => sample.e2eMs));
  const e2eSuccessSummary = summarize(successfulSamples.map((sample) => sample.e2eMs));
  const apiDurationSummary = summarize(
    successfulSamples
      .map((sample) => sample.apiDurationMs)
      .filter((value): value is number => typeof value === 'number')
  );
  const processingSummary = summarize(
    successfulSamples
      .map((sample) => sample.processingTimeMs)
      .filter((value): value is number => typeof value === 'number')
  );

  const stageStats = Object.fromEntries(
    [...stageAccumulator.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([stage, values]) => [stage, summarize(values)])
  );

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      provider,
      runs,
      warmupRuns,
      requestTimeoutMs,
      maxTokens,
      promptIds: prompts.map((entry) => entry.id),
      promptMode: prompts.length === 1 ? 'single' : 'round_robin',
    },
    summary: {
      totalMeasuredRuns: samples.length,
      successRuns: successfulSamples.length,
      failedRuns: failedSamples.length,
      successRate: Number(
        ((samples.length > 0 ? successfulSamples.length / samples.length : 0) * 100).toFixed(2)
      ),
      e2eMs: e2eSummary,
      e2eMsSuccessOnly: e2eSuccessSummary,
      apiDurationMs: apiDurationSummary,
      processingTimeMs: processingSummary,
    },
    stageTimingsMs: stageStats,
    failures: failedSamples.slice(0, 25).map((sample) => ({
      run: sample.run,
      promptId: sample.promptId,
      httpStatus: sample.httpStatus,
      errorCode: sample.errorCode,
      errorMessage: sample.errorMessage,
      e2eMs: sample.e2eMs,
    })),
    samples,
  };

  const evalDir = path.resolve(process.cwd(), 'tests/evals');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(evalDir, `generate-benchmark-${stamp}.json`);
  const latestPath = path.join(evalDir, 'last-generate-benchmark.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[Benchmark] Report saved: ${reportPath}`);
  console.log(`[Benchmark] Latest report: ${latestPath}`);
  console.log(
    `[Benchmark] Success=${successfulSamples.length}/${samples.length} | E2E p50=${e2eSummary.p50}ms p95=${e2eSummary.p95}ms`
  );

  if (successfulSamples.length === 0) {
    console.error('[Benchmark] All measured runs failed.');
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('[Benchmark] Runner failed:', error);
  process.exit(1);
});
