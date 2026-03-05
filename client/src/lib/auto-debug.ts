import type { StructuredBuildErrorInfo } from './bundler';

export interface RuntimeErrorPayload {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  stack?: string;
  type?: string;
  source?: string;
  routePath?: string;
  buildError?: StructuredBuildErrorInfo;
}

export type ErrorClassificationType =
  | 'build-error'
  | 'missing-import'
  | 'null-reference'
  | 'invalid-component'
  | 'database-error'
  | 'hook-violation'
  | 'unknown';

export interface ErrorClassification {
  type: ErrorClassificationType;
  confidence: number;
  autoFixable: boolean;
}

export type FixTargetFiles =
  | 'error-file-only'
  | 'error-file-and-imports'
  | 'all-supabase-files';

export interface FixStrategy {
  prompt: string;
  maxTokens: number;
  targetFiles: FixTargetFiles;
}

export const FIX_STRATEGIES: Record<Exclude<ErrorClassificationType, 'unknown'>, FixStrategy> = {
  'build-error': {
    prompt: "Fix build error: '{error}' at line {line}. Resolve compile/syntax/import issues and keep changes minimal.",
    maxTokens: 1200,
    targetFiles: 'error-file-and-imports',
  },
  'missing-import': {
    prompt: "Fix the missing import error: '{error}'. Find the component/function that is not defined and add the correct import statement. Only change the import section.",
    maxTokens: 500,
    targetFiles: 'error-file-only',
  },
  'null-reference': {
    prompt: "Fix null reference error: '{error}' at line {line}. Add null checks: use optional chaining (?.) and nullish coalescing (??) to prevent the error. Add loading/empty states.",
    maxTokens: 1000,
    targetFiles: 'error-file-only',
  },
  'invalid-component': {
    prompt: "Fix invalid React component error: '{error}'. The component being rendered is not a valid React component. Either fix the export/import or replace with a valid component.",
    maxTokens: 1000,
    targetFiles: 'error-file-and-imports',
  },
  'hook-violation': {
    prompt: "Fix React hooks violation: '{error}'. Move all hooks to the top level of the component, before any conditional returns. Never call hooks inside conditions, loops, or nested functions.",
    maxTokens: 1500,
    targetFiles: 'error-file-only',
  },
  'database-error': {
    prompt: "Fix Supabase database error: '{error}'. Check the table name, column names, and data types. Add proper error handling with try/catch. If table doesn't exist, use mock data as fallback.",
    maxTokens: 1500,
    targetFiles: 'all-supabase-files',
  },
};

export function classifyError(error: RuntimeErrorPayload): ErrorClassification {
  const msg = String(error?.message || '').toLowerCase();

  if (error?.buildError?.type === 'build-error' || msg.includes('bundl') || msg.includes('build error')) {
    return { type: 'build-error', confidence: 0.98, autoFixable: true };
  }

  if (msg.includes('is not defined') || msg.includes('cannot find module')) {
    return { type: 'missing-import', confidence: 0.95, autoFixable: true };
  }

  if (
    msg.includes('is not a function')
    || msg.includes('cannot read prop')
    || msg.includes('cannot read properties of')
  ) {
    return { type: 'null-reference', confidence: 0.9, autoFixable: true };
  }

  if (msg.includes('element type is invalid')) {
    return { type: 'invalid-component', confidence: 0.85, autoFixable: true };
  }

  if (msg.includes('supabase') || msg.includes('relation') || msg.includes('column')) {
    return { type: 'database-error', confidence: 0.8, autoFixable: true };
  }

  if (msg.includes('hooks can only') || msg.includes('rendered fewer hooks')) {
    return { type: 'hook-violation', confidence: 0.9, autoFixable: true };
  }

  return { type: 'unknown', confidence: 0.3, autoFixable: false };
}

export function applyStrategyPromptTemplate(
  strategyPrompt: string,
  error: RuntimeErrorPayload
): string {
  const safeLine = Number.isFinite(error?.line) ? String(error.line) : 'unknown';
  return strategyPrompt
    .replace('{error}', error?.message || 'Unknown error')
    .replace('{line}', safeLine);
}
