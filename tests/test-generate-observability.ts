import assert from 'node:assert/strict';
import { GenerateObservabilityCollector } from '../server/ai/project-pipeline/generate-observability.js';

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

console.log('\nStarting Generate Observability Tests...\n');

run('Computes success, fallback and percentiles', () => {
  const collector = new GenerateObservabilityCollector();
  const base = Date.now();
  const prevSampleSize = process.env.OBS_ALERT_MIN_SAMPLE_SIZE;
  const prevP95 = process.env.OBS_ALERT_MAX_P95_MS;
  const prevSuccess = process.env.OBS_ALERT_MIN_SUCCESS_RATE;
  const prevFallback = process.env.OBS_ALERT_MAX_FALLBACK_RATE;
  const prevCost = process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD;

  process.env.OBS_ALERT_MIN_SAMPLE_SIZE = '1';
  process.env.OBS_ALERT_MAX_P95_MS = '2500';
  process.env.OBS_ALERT_MIN_SUCCESS_RATE = '0.8';
  process.env.OBS_ALERT_MAX_FALLBACK_RATE = '0.2';
  process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD = '0.0001';

  try {
    collector.record({
      timestamp: base - 1000,
      requestedProvider: 'gemini',
      effectiveProvider: 'gemini',
      generationMode: 'new',
      success: true,
      durationMs: 1000,
      processingTimeMs: 100,
      inputTokens: 500,
      outputTokens: 800,
    });

    collector.record({
      timestamp: base - 900,
      requestedProvider: 'gemini',
      effectiveProvider: 'openai',
      generationMode: 'edit',
      success: false,
      durationMs: 3000,
      processingTimeMs: 120,
      fallbackApplied: true,
      errorCategory: 'provider_down',
      inputTokens: 400,
      outputTokens: 0,
    });

    collector.record({
      timestamp: base - 800,
      requestedProvider: 'openai',
      effectiveProvider: 'openai',
      generationMode: 'edit',
      success: true,
      durationMs: 2000,
      processingTimeMs: 110,
      inputTokens: 600,
      outputTokens: 700,
    });

    const metrics = collector.getMetrics(10 * 60 * 1000);
    assert.equal(metrics.totalRequests, 3);
    assert.equal(metrics.successCount, 2);
    assert.equal(metrics.failureCount, 1);
    assert.ok(Math.abs(metrics.fallbackRate - (1 / 3)) < 0.001);
    assert.equal(metrics.p50DurationMs, 2000);
    assert.equal(metrics.p95DurationMs, 3000);
    assert.equal(metrics.totalTokens, 3000);
    assert.ok(metrics.estimatedCostUsd > 0);
    assert.equal(metrics.errorCategories.provider_down, 1);
    assert.ok(metrics.costPerRequestUsd > 0);
    assert.equal(metrics.thresholds.maxP95DurationMs, 2500);
    assert.ok(metrics.alerts.length >= 3);
  } finally {
    process.env.OBS_ALERT_MIN_SAMPLE_SIZE = prevSampleSize;
    process.env.OBS_ALERT_MAX_P95_MS = prevP95;
    process.env.OBS_ALERT_MIN_SUCCESS_RATE = prevSuccess;
    process.env.OBS_ALERT_MAX_FALLBACK_RATE = prevFallback;
    process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD = prevCost;
  }
});

run('Respects window and returns zeros when empty', () => {
  const collector = new GenerateObservabilityCollector();
  collector.record({
    timestamp: Date.now() - (2 * 60 * 60 * 1000),
    requestedProvider: 'gemini',
    effectiveProvider: 'gemini',
    generationMode: 'new',
    success: true,
    durationMs: 1234,
    inputTokens: 100,
    outputTokens: 100,
  });

  const metrics = collector.getMetrics(60_000);
  assert.equal(metrics.totalRequests, 0);
  assert.equal(metrics.successRate, 0);
  assert.equal(metrics.p95DurationMs, 0);
  assert.equal(metrics.estimatedCostUsd, 0);
  assert.equal(metrics.costPerRequestUsd, 0);
  assert.equal(metrics.alerts.length, 0);
});

run('Computes SLO status (pass/fail/insufficient_data)', () => {
  const collector = new GenerateObservabilityCollector();
  const now = Date.now();
  const prevSampleSize = process.env.OBS_ALERT_MIN_SAMPLE_SIZE;
  const prevP95 = process.env.OBS_ALERT_MAX_P95_MS;
  const prevSuccess = process.env.OBS_ALERT_MIN_SUCCESS_RATE;
  const prevFallback = process.env.OBS_ALERT_MAX_FALLBACK_RATE;
  const prevCost = process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD;

  process.env.OBS_ALERT_MIN_SAMPLE_SIZE = '2';
  process.env.OBS_ALERT_MAX_P95_MS = '2000';
  process.env.OBS_ALERT_MIN_SUCCESS_RATE = '0.8';
  process.env.OBS_ALERT_MAX_FALLBACK_RATE = '0.2';
  process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD = '0.1';

  try {
    collector.record({
      timestamp: now - 1000,
      requestedProvider: 'gemini',
      effectiveProvider: 'gemini',
      generationMode: 'new',
      success: true,
      durationMs: 900,
      inputTokens: 100,
      outputTokens: 100,
    });

    let slo = collector.getSloStatus(60_000);
    assert.equal(slo.status, 'insufficient_data');

    collector.record({
      timestamp: now - 800,
      requestedProvider: 'openai',
      effectiveProvider: 'openai',
      generationMode: 'edit',
      success: true,
      durationMs: 1100,
      inputTokens: 100,
      outputTokens: 100,
    });

    slo = collector.getSloStatus(60_000);
    assert.equal(slo.status, 'pass');

    collector.record({
      timestamp: now - 600,
      requestedProvider: 'openai',
      effectiveProvider: 'openai',
      generationMode: 'edit',
      success: false,
      durationMs: 5000,
      fallbackApplied: true,
      errorCategory: 'provider_down',
      inputTokens: 100,
      outputTokens: 0,
    });

    slo = collector.getSloStatus(60_000);
    assert.equal(slo.status, 'fail');
    assert.ok(slo.checks.some((check) => check.id === 'p95_latency' && !check.pass));
    assert.ok(slo.checks.some((check) => check.id === 'success_rate' && !check.pass));
  } finally {
    process.env.OBS_ALERT_MIN_SAMPLE_SIZE = prevSampleSize;
    process.env.OBS_ALERT_MAX_P95_MS = prevP95;
    process.env.OBS_ALERT_MIN_SUCCESS_RATE = prevSuccess;
    process.env.OBS_ALERT_MAX_FALLBACK_RATE = prevFallback;
    process.env.OBS_ALERT_MAX_COST_PER_REQUEST_USD = prevCost;
  }
});

console.log('\nAll generate observability tests passed.');
