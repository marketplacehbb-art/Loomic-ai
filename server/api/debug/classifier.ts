export interface RuntimeError {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  stack?: string;
  type?: string;
}

export type ErrorClassificationType =
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

export function classifyError(error: RuntimeError): ErrorClassification {
  const msg = String(error?.message || '').toLowerCase();

  // Missing import
  if (msg.includes('is not defined') || msg.includes('cannot find module')) {
    return { type: 'missing-import', confidence: 0.95, autoFixable: true };
  }

  // Type error / null access
  if (
    msg.includes('is not a function')
    || msg.includes('cannot read prop')
    || msg.includes('cannot read properties of')
  ) {
    return { type: 'null-reference', confidence: 0.9, autoFixable: true };
  }

  // Missing/invalid component
  if (msg.includes('element type is invalid')) {
    return { type: 'invalid-component', confidence: 0.85, autoFixable: true };
  }

  // Supabase/database error
  if (msg.includes('supabase') || msg.includes('relation') || msg.includes('column')) {
    return { type: 'database-error', confidence: 0.8, autoFixable: true };
  }

  // Hooks rule violation
  if (msg.includes('hooks can only') || msg.includes('rendered fewer hooks')) {
    return { type: 'hook-violation', confidence: 0.9, autoFixable: true };
  }

  // Unknown
  return { type: 'unknown', confidence: 0.3, autoFixable: false };
}
