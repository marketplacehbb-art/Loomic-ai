export type RuntimeIssueCategory =
  | 'missing-module'
  | 'invalid-export'
  | 'router-context'
  | 'undefined-symbol'
  | 'null-access'
  | 'bundler'
  | 'runtime';

export interface PreviewRuntimeIssuePayload {
  type?: 'bundler' | 'runtime';
  message?: string;
  stack?: string;
  source?: string;
  category?: string;
  fingerprint?: string;
  routePath?: string;
  timestamp?: number;
}

export const normalizeRuntimeIssuePayload = (raw: PreviewRuntimeIssuePayload | null | undefined) => {
  if (!raw || typeof raw !== 'object') return null;
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message) return null;
  const stack = typeof raw.stack === 'string' ? raw.stack.trim() : '';
  const source = typeof raw.source === 'string' ? raw.source.trim() : 'runtime';
  const routePath = typeof raw.routePath === 'string' ? raw.routePath.trim() : '/';
  const timestamp = typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
    ? raw.timestamp
    : Date.now();
  return {
    ...raw,
    message,
    stack,
    source,
    routePath: routePath || '/',
    timestamp,
  };
};

export const classifyRuntimeIssueCategory = (message: string, source?: string): RuntimeIssueCategory => {
  const lower = `${message} ${source || ''}`.toLowerCase();
  if (/failed to resolve module specifier|cannot find module|module not found/.test(lower)) return 'missing-module';
  if (/does not provide an export named|has no exported member/.test(lower)) return 'invalid-export';
  if (/cannot destructure property 'basename'|reading 'usecontext'/.test(lower)) return 'router-context';
  if (/is not defined/.test(lower)) return 'undefined-symbol';
  if (/cannot read properties of null|cannot read properties of undefined/.test(lower)) return 'null-access';
  if (/bundl|esbuild|tsx transform|unexpected token|unterminated/.test(lower)) return 'bundler';
  return 'runtime';
};

export const buildRuntimeIssueFingerprint = (issue: ReturnType<typeof normalizeRuntimeIssuePayload>): string => {
  if (!issue) return '';
  const head = issue.stack ? issue.stack.split('\n').slice(0, 2).join(' | ') : '';
  return `${issue.category || ''}|${issue.source || ''}|${issue.routePath || ''}|${issue.message}|${head}`
    .slice(0, 720);
};

export const buildRuntimeRepairPrompt = (issue: ReturnType<typeof normalizeRuntimeIssuePayload>, category: RuntimeIssueCategory): string => {
  const safeIssue = issue!;
  const stackPreview = safeIssue.stack
    ? safeIssue.stack.split('\n').slice(0, 6).join('\n')
    : '(no stack)';

  const categoryDirective: Record<RuntimeIssueCategory, string> = {
    'missing-module': 'Fix unresolved imports and ensure required dependencies are declared in package.json. If unavailable, replace with supported alternatives.',
    'invalid-export': 'Fix incorrect named imports/exports and use valid symbols from the library.',
    'router-context': 'Ensure router consumers are rendered inside a Router provider and avoid invalid routing setup in preview.',
    'undefined-symbol': 'Define missing symbols/imports and remove invalid references.',
    'null-access': 'Add robust null guards/defaults to prevent runtime null/undefined access.',
    bundler: 'Fix syntax/transpile/module issues so TypeScript/JSX compiles cleanly.',
    runtime: 'Fix the runtime exception with minimal targeted changes.',
  };

  return [
    'AUTO_REPAIR_RUNTIME: true',
    'Task: Fix the existing project code so preview renders without runtime/build errors.',
    `Category: ${category}`,
    `Route: ${safeIssue.routePath || '/'}`,
    `Error message: ${safeIssue.message}`,
    'Stack preview:',
    stackPreview,
    '',
    'Hard constraints:',
    '- Edit only necessary files under src/ (and package.json only if strictly needed).',
    '- Preserve current app structure and user-facing intent.',
    '- Do not rewrite the whole project.',
    '- Return valid structured file output that passes TS/JS validation.',
    '',
    `Priority repair directive: ${categoryDirective[category]}`,
  ].join('\n');
};
