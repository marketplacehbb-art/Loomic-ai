type VisualEditAnchor = {
  nodeId?: string;
  tagName?: string;
  className?: string;
  id?: string;
  innerText?: string;
  selector?: string;
  domPath?: string;
  sectionId?: string;
  routePath?: string;
  href?: string;
  role?: string;
  sourceId?: string;
} | null | undefined;

type SupabaseIntegrationPromptContext = {
  connected?: boolean;
  environment?: 'test' | 'live' | null;
  projectRef?: string | null;
  projectUrl?: string | null;
  hasTestConnection?: boolean;
  hasLiveConnection?: boolean;
} | null | undefined;

export function trimAnchorValue(value: unknown, maxLength: number = 180): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function buildVisualAnchorPrompt(anchor: VisualEditAnchor): string {
  if (!anchor || typeof anchor !== 'object') return '';

  const lines: string[] = [];
  const nodeId = trimAnchorValue(anchor.nodeId, 120);
  const selector = trimAnchorValue(anchor.selector, 220);
  const domPath = trimAnchorValue(anchor.domPath, 220);
  const sectionId = trimAnchorValue(anchor.sectionId, 120);
  const routePath = trimAnchorValue(anchor.routePath, 120);
  const tagName = trimAnchorValue(anchor.tagName, 60);
  const className = trimAnchorValue(anchor.className, 180);
  const elementId = trimAnchorValue(anchor.id, 120);
  const role = trimAnchorValue(anchor.role, 60);
  const href = trimAnchorValue(anchor.href, 180);
  const innerText = trimAnchorValue(anchor.innerText, 200);
  const sourceId = trimAnchorValue(anchor.sourceId, 220);

  if (nodeId) lines.push(`- nodeId: ${nodeId}`);
  if (selector) lines.push(`- selector: ${selector}`);
  if (domPath) lines.push(`- domPath: ${domPath}`);
  if (sectionId) lines.push(`- sectionId: ${sectionId}`);
  if (routePath) lines.push(`- routePath: ${routePath}`);
  if (tagName) lines.push(`- tagName: ${tagName}`);
  if (className) lines.push(`- className: ${className}`);
  if (elementId) lines.push(`- id: ${elementId}`);
  if (role) lines.push(`- role: ${role}`);
  if (href) lines.push(`- href: ${href}`);
  if (innerText) lines.push(`- text: ${innerText}`);
  if (sourceId) lines.push(`- sourceId: ${sourceId}`);

  if (lines.length === 0) return '';

  return `Visual edit target (authoritative):
${lines.join('\n')}
Treat this as the primary edit anchor. Apply a minimal local diff around this target before considering global rewrites.
If sourceId is available, prefer selector-based edits with [data-source-id="..."].`;
}

const SUPABASE_BACKEND_INTENT_KEYWORDS = [
  'supabase',
  'backend',
  'fullstack',
  'full-stack',
  'api',
  'server',
  'database',
  'db',
  'postgres',
  'sql',
  'table',
  'auth',
  'authentication',
  'login',
  'signup',
  'register',
  'user account',
  'storage',
  'upload',
  'bucket',
  'realtime',
  'edge function',
  'admin panel',
];

export function detectBackendIntent(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const normalized = prompt.toLowerCase();
  return SUPABASE_BACKEND_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function buildSupabaseIntegrationPrompt(
  integration: SupabaseIntegrationPromptContext,
  backendIntentDetected: boolean
): string {
  const connected = Boolean(integration && typeof integration === 'object' && integration.connected);
  const environment =
    integration && typeof integration === 'object' && (integration.environment === 'test' || integration.environment === 'live')
      ? integration.environment
      : null;
  const projectRef =
    integration && typeof integration === 'object' && typeof integration.projectRef === 'string' && integration.projectRef.trim().length > 0
      ? integration.projectRef.trim()
      : null;
  const projectUrl =
    integration && typeof integration === 'object' && typeof integration.projectUrl === 'string' && integration.projectUrl.trim().length > 0
      ? integration.projectUrl.trim()
      : null;
  const hasTestConnection = Boolean(integration && typeof integration === 'object' && integration.hasTestConnection);
  const hasLiveConnection = Boolean(integration && typeof integration === 'object' && integration.hasLiveConnection);

  const lines = [
    'Supabase integration context:',
    `- connected: ${connected ? 'yes' : 'no'}`,
    `- active_environment: ${environment || 'none'}`,
    `- has_test_connection: ${hasTestConnection ? 'yes' : 'no'}`,
    `- has_live_connection: ${hasLiveConnection ? 'yes' : 'no'}`,
    `- project_ref: ${projectRef || 'none'}`,
    `- project_url: ${projectUrl || 'none'}`,
  ];

  if (connected && environment) {
    lines.push(
      'If user intent needs backend/auth/data, prefer Supabase-compatible implementation (auth, tables, storage, RLS-safe patterns).',
      'Do not invent non-existing env vars. Use placeholders only where project secrets are needed.'
    );
  } else if (backendIntentDetected) {
    lines.push(
      'Backend/fullstack intent detected but Supabase is not connected.',
      'Generate connection-ready code scaffolding and clear TODO placeholders instead of pretending a live backend is already configured.'
    );
  }

  return lines.join('\n');
}
