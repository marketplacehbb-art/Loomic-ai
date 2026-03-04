import { sanitizeErrorMessage } from '../utils/error-sanitizer.js';
import { type ClassifiedProviderError } from './generate-validation.js';

export function buildResponseWarnings(processedWarnings: string[], integrationWarnings: string[]): string[] | undefined {
  const dedupedWarnings = [...new Set([...(processedWarnings || []), ...(integrationWarnings || [])])];
  return dedupedWarnings.length > 0 ? dedupedWarnings : undefined;
}

export function buildResponseErrors(rollbackApplied: boolean, combinedErrors: string[]): string[] | undefined {
  if (rollbackApplied) return undefined;
  return combinedErrors.length > 0 ? combinedErrors : undefined;
}

export function buildGenerateSuccessResponse(input: {
  isSuccess: boolean;
  codeToProcess: string;
  responseFiles: unknown[];
  responseDependencies: string[];
  components: string[];
  responseErrors?: string[];
  responseWarnings?: string[];
  executionProviderHint: string;
  duration: number;
  processingTime: number;
  isNoOpGeneration: boolean;
  noOpReason: string;
  editOutcomeMessage: string;
  repairStatus: 'skipped' | 'succeeded' | 'failed';
  repairError?: string;
  routedPipelinePath: 'fast' | 'deep';
  hydratedContextForResponse?: unknown;
  finalRateLimit?: unknown;
  pipeline: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    success: input.isSuccess,
    code: input.codeToProcess,
    files: input.responseFiles,
    dependencies: input.responseDependencies,
    components: input.components,
    errors: input.responseErrors,
    warnings: input.responseWarnings,
    provider: input.executionProviderHint,
    timestamp: new Date().toISOString(),
    duration: input.duration,
    processingTime: input.processingTime,
    noOp: {
      detected: input.isNoOpGeneration,
      reason: input.isNoOpGeneration ? input.noOpReason : input.editOutcomeMessage,
    },
    repairStatus: input.repairStatus,
    repairError: input.repairError,
    pipelinePath: input.routedPipelinePath,
    latencyMs: input.duration,
    routing: {
      pipeline: input.routedPipelinePath,
      latencyMs: input.duration,
    },
    metadata: input.hydratedContextForResponse
      ? { hydratedContext: input.hydratedContextForResponse }
      : undefined,
    rateLimit: input.finalRateLimit,
    pipeline: input.pipeline,
  };
}

export function buildGenerateErrorResponse(input: {
  error: any;
  duration: number;
  requestedProvider: unknown;
  isMalformedOutput: boolean;
  classified: ClassifiedProviderError;
}): { statusCode: number; payload: Record<string, unknown> } {
  const statusCode = input.isMalformedOutput ? 422 : input.classified.statusCode;
  const errorCode = input.isMalformedOutput ? 'MALFORMED_STRUCTURED_OUTPUT' : input.classified.code;

  const payload: Record<string, unknown> = {
    success: false,
    error: sanitizeErrorMessage(input.error, { fallback: 'Code generation failed', maxLength: 280 }),
    provider: input.requestedProvider || 'unknown',
    timestamp: new Date().toISOString(),
    duration: input.duration,
    code: errorCode,
  };

  if (!input.isMalformedOutput && input.classified.category !== 'unknown') {
    payload.errorCategory = input.classified.category;
    payload.retryable = input.classified.retryable;
    if (input.classified.suggestedProvider) {
      payload.suggestedProvider = input.classified.suggestedProvider;
    }
  }

  return { statusCode, payload };
}
