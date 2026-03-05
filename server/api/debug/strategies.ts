import type { ErrorClassificationType } from './classifier.js';

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
