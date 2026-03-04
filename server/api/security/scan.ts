import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { sanitizeErrorForLog } from '../../utils/error-sanitizer.js';

const router = Router();

const MAX_SCAN_FILE_COUNT = 800;
const MAX_SCAN_FILE_BYTES = 400_000;
const MAX_SCAN_TOTAL_BYTES = 10_000_000;

const scanFileMapSchema = z.record(z.string(), z.string()).superRefine((files, ctx) => {
  const entries = Object.entries(files || {});
  if (entries.length > MAX_SCAN_FILE_COUNT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Too many files for scan (max ${MAX_SCAN_FILE_COUNT})`,
    });
    return;
  }

  let totalBytes = 0;
  for (const [path, content] of entries) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath || normalizedPath.length > 260) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: 'Invalid file path in scan payload',
      });
      continue;
    }

    const bytes = Buffer.byteLength(String(content || ''), 'utf8');
    if (bytes > MAX_SCAN_FILE_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `File too large for scan (${bytes} bytes, max ${MAX_SCAN_FILE_BYTES})`,
      });
    }
    totalBytes += bytes;
  }

  if (totalBytes > MAX_SCAN_TOTAL_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Scan payload too large (${totalBytes} bytes, max ${MAX_SCAN_TOTAL_BYTES})`,
    });
  }
});

export const scanInputSchema = z.object({
  projectId: z.string().uuid(),
  environment: z.enum(['test', 'live']).optional(),
  files: scanFileMapSchema.optional(),
});

export const scanHistoryQuerySchema = z.object({
  projectId: z.string().uuid(),
}).strict();

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface SecurityFinding {
  severity: Severity;
  category: 'rls' | 'auth' | 'policy' | 'edge' | 'secrets';
  resource: string;
  evidence: string;
  fixSuggestion: string;
  autofixPossible: boolean;
}

interface ScanSnapshot {
  timestamp: string;
  score: number;
  findings: SecurityFinding[];
}

const inMemoryScanHistory = new Map<string, ScanSnapshot[]>();

const severityPenalty: Record<Severity, number> = {
  low: 5,
  medium: 12,
  high: 25,
  critical: 45,
};

const getHistoryKey = (userId: string, projectId: string) => `${userId}:${projectId}`;

const isMissingTableError = (error: any) =>
  error?.code === 'PGRST205' ||
  String(error?.message || '').toLowerCase().includes('could not find the table');

const maskSecretEvidence = (token: string): string => {
  const normalized = String(token || '').trim();
  if (!normalized) return '[redacted]';
  return `[redacted:${Math.min(normalized.length, 128)} chars]`;
};

const parsePersistedSecurityFinding = (value: unknown): SecurityFinding | null => {
  if (!value || typeof value !== 'object') return null;
  const finding = value as Record<string, unknown>;
  const severity = finding.severity;
  const category = finding.category;
  if (
    (severity !== 'low' && severity !== 'medium' && severity !== 'high' && severity !== 'critical') ||
    (category !== 'rls' && category !== 'auth' && category !== 'policy' && category !== 'edge' && category !== 'secrets') ||
    typeof finding.resource !== 'string' ||
    typeof finding.evidence !== 'string' ||
    typeof finding.fixSuggestion !== 'string' ||
    typeof finding.autofixPossible !== 'boolean'
  ) {
    return null;
  }

  return {
    severity,
    category,
    resource: finding.resource,
    evidence: finding.evidence,
    fixSuggestion: finding.fixSuggestion,
    autofixPossible: finding.autofixPossible,
  };
};

const parsePersistedScanSnapshot = (value: any): ScanSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const timestamp = typeof value.scanned_at === 'string' ? value.scanned_at : typeof value.timestamp === 'string' ? value.timestamp : '';
  const score = Number(value.score);
  if (!timestamp || !Number.isFinite(score)) {
    return null;
  }

  const findings = Array.isArray(value.findings)
    ? value.findings.map(parsePersistedSecurityFinding).filter((item): item is SecurityFinding => Boolean(item))
    : [];

  return {
    timestamp,
    score,
    findings,
  };
};

const persistScanSnapshot = async (
  userId: string,
  projectId: string,
  environment: 'test' | 'live',
  snapshot: ScanSnapshot
): Promise<void> => {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin
    .from('project_security_scans')
    .insert({
      user_id: userId,
      project_id: projectId,
      environment,
      scanned_at: snapshot.timestamp,
      score: snapshot.score,
      findings: snapshot.findings,
    });

  if (error && !isMissingTableError(error)) {
    console.warn('[Security Scan] persist failed:', error.message);
  }
};

const loadPersistedScanHistory = async (userId: string, projectId: string): Promise<ScanSnapshot[] | null> => {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('project_security_scans')
    .select('scanned_at,score,findings')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('scanned_at', { ascending: false })
    .limit(20);

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Security Scan] history read failed:', error.message);
    }
    return null;
  }

  if (!Array.isArray(data)) return [];
  return data
    .map(parsePersistedScanSnapshot)
    .filter((item): item is ScanSnapshot => Boolean(item));
};

const hasSecretLeak = (content: string): Array<{ label: string; token: string }> => {
  const checks: Array<{ label: string; regex: RegExp }> = [
    { label: 'Supabase PAT', regex: /\bsbp_[A-Za-z0-9]{24,}\b/g },
    { label: 'Supabase secret key', regex: /\bsba_[A-Za-z0-9]{24,}\b/g },
    { label: 'OpenAI key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { label: 'Generic API key assignment', regex: /(api[_-]?key|token|secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi },
  ];

  const findings: Array<{ label: string; token: string }> = [];
  for (const check of checks) {
    const matches = Array.from(content.matchAll(check.regex));
    for (const match of matches) {
      findings.push({ label: check.label, token: String(match[0]).slice(0, 48) });
    }
  }
  return findings;
};

const isSqlLikeFile = (path: string): boolean => /\.sql$/i.test(String(path || '').trim());

const normalizeSqlTableReferences = (rawName: string): string[] => {
  const normalized = String(rawName || '')
    .trim()
    .replace(/[;,]+$/g, '')
    .replace(/"/g, '');

  if (!normalized) return [];

  const compact = normalized.replace(/\s+/g, '');
  const variants = new Set<string>();
  variants.add(compact.toLowerCase());

  const parts = compact.split('.');
  if (parts.length > 1) {
    variants.add(parts[parts.length - 1].toLowerCase());
  }

  return [...variants];
};

const collectSqlTableReferences = (source: string, pattern: RegExp): Set<string> => {
  const matches = new Set<string>();

  for (const match of source.matchAll(pattern)) {
    const rawName = match[1];
    if (typeof rawName !== 'string' || !rawName.trim()) continue;
    normalizeSqlTableReferences(rawName).forEach((name) => matches.add(name));
  }

  return matches;
};

const collectGloballyProtectedTables = (entries: Array<[string, string]>): Set<string> => {
  const protectedTables = new Set<string>();

  for (const [path, content] of entries) {
    if (!isSqlLikeFile(path)) continue;
    const source = String(content || '');
    if (!source.trim()) continue;

    collectSqlTableReferences(
      source,
      /ALTER\s+TABLE(?:\s+ONLY)?(?:\s+IF\s+EXISTS)?\s+([A-Za-z0-9_."-]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
    ).forEach((name) => protectedTables.add(name));

    collectSqlTableReferences(
      source,
      /CREATE\s+POLICY[\s\S]{0,500}?\s+ON\s+([A-Za-z0-9_."-]+)/gi
    ).forEach((name) => protectedTables.add(name));
  }

  return protectedTables;
};

const collectCreatedTables = (source: string): Set<string> =>
  collectSqlTableReferences(
    source,
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z0-9_."-]+)/gi
  );

const runStaticChecks = (files: Record<string, string> | undefined): SecurityFinding[] => {
  if (!files) return [];
  const findings: SecurityFinding[] = [];
  const entries = Object.entries(files);
  const globallyProtectedTables = collectGloballyProtectedTables(entries);

  for (const [path, content] of entries) {
    const source = String(content || '');
    if (!source.trim()) continue;

    const secretHits = hasSecretLeak(source);
    for (const hit of secretHits) {
      findings.push({
        severity: 'critical',
        category: 'secrets',
        resource: path,
        evidence: `${hit.label}: ${maskSecretEvidence(hit.token)}`,
        fixSuggestion: 'Move secrets into environment variables or server-side secret storage.',
        autofixPossible: false,
      });
    }

    if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(source)) {
      findings.push({
        severity: 'high',
        category: 'rls',
        resource: path,
        evidence: 'Detected "DISABLE ROW LEVEL SECURITY".',
        fixSuggestion: 'Enable RLS and define explicit owner-scoped policies.',
        autofixPossible: false,
      });
    }

    if (isSqlLikeFile(path)) {
      const createdTables = collectCreatedTables(source);
      const missingRlsTables = [...createdTables].filter((tableName) => !globallyProtectedTables.has(tableName));

      if (missingRlsTables.length > 0) {
        const preview = missingRlsTables.slice(0, 3).join(', ');
        const suffix = missingRlsTables.length > 3 ? '...' : '';
        findings.push({
          severity: 'medium',
          category: 'rls',
          resource: path,
          evidence: `CREATE TABLE without visible RLS/policy for: ${preview}${suffix}`,
          fixSuggestion: 'Add "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" and explicit policies.',
          autofixPossible: true,
        });
      }
    } else if (/CREATE\s+TABLE/i.test(source) && !/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(source)) {
      findings.push({
        severity: 'medium',
        category: 'rls',
        resource: path,
        evidence: 'CREATE TABLE without visible RLS enable statement.',
        fixSuggestion: 'Add "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" and explicit policies.',
        autofixPossible: true,
      });
    }

    if (/Deno\.serve|serve\(/i.test(source) && !/auth|authorization|verify/i.test(source)) {
      findings.push({
        severity: 'medium',
        category: 'edge',
        resource: path,
        evidence: 'Edge/server handler without visible auth check heuristic.',
        fixSuggestion: 'Add token/session verification before privileged operations.',
        autofixPossible: false,
      });
    }
  }

  return findings;
};

router.post('/scan', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = scanInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scan payload',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { projectId, environment = 'test', files } = parsed.data;

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Project verification is unavailable on server' });
    }

    const { data: projectRow, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (projectError || !projectRow?.id) {
      return res.status(403).json({ success: false, error: 'Project access denied' });
    }

    const findings: SecurityFinding[] = [];
    const staticFindings = runStaticChecks(files);
    findings.push(...staticFindings);

    const { data: integration, error: integrationError } = await supabaseAdmin
      .from('project_integrations')
      .select('status,project_ref,scopes,environment')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('provider', 'supabase')
      .eq('environment', environment)
      .maybeSingle();

    if (integrationError || !integration || integration.status !== 'connected') {
      findings.push({
        severity: 'high',
        category: 'auth',
        resource: `supabase:${environment}`,
        evidence: 'No active Supabase connection for selected environment.',
        fixSuggestion: 'Connect Supabase before running full cloud security checks.',
        autofixPossible: false,
      });
    } else {
      const scopes = Array.isArray((integration as any).scopes) ? ((integration as any).scopes as string[]) : [];
      const requiredScopes = ['database:read', 'auth:read'];
      const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
      if (missingScopes.length > 0) {
        findings.push({
          severity: 'medium',
          category: 'auth',
          resource: `supabase:${environment}`,
          evidence: `Missing scopes: ${missingScopes.join(', ')}`,
          fixSuggestion: 'Reconnect Supabase with least-privilege read scopes for scanning.',
          autofixPossible: false,
        });
      }

      if (!(integration as any).project_ref) {
        findings.push({
          severity: 'medium',
          category: 'policy',
          resource: `supabase:${environment}`,
          evidence: 'Connected integration without project_ref.',
          fixSuggestion: 'Store project_ref to unlock module-level checks and deep links.',
          autofixPossible: false,
        });
      }
    }

    const scoreRaw = 100 - findings.reduce((sum, finding) => sum + severityPenalty[finding.severity], 0);
    const score = Math.max(0, Math.min(100, scoreRaw));
    const timestamp = new Date().toISOString();

    const snapshot: ScanSnapshot = { timestamp, score, findings };
    const historyKey = getHistoryKey(userId, projectId);
    const history = inMemoryScanHistory.get(historyKey) || [];
    history.push(snapshot);
    inMemoryScanHistory.set(historyKey, history.slice(-20));
    await persistScanSnapshot(userId, projectId, environment, snapshot);

    return res.json({
      success: true,
      projectId,
      environment,
      timestamp,
      score,
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter((f) => f.severity === 'critical').length,
        high: findings.filter((f) => f.severity === 'high').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        low: findings.filter((f) => f.severity === 'low').length,
      },
      previous: history.length > 1 ? history[history.length - 2] : null,
      boundaries: {
        staticOnly: true,
        runtimeTrafficScanning: false,
        fullCodeAnalysis: false,
      },
    });
  } catch (error: any) {
    console.error('[Security Scan] failed:', {
      message: sanitizeErrorForLog(error),
    });
    return res.status(500).json({ success: false, error: 'Security scan failed' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsedQuery = scanHistoryQuerySchema.safeParse(req.query || {});
    if (!parsedQuery.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid history query',
        details: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const { projectId } = parsedQuery.data;

    const key = getHistoryKey(userId, projectId);
    const persistedHistory = await loadPersistedScanHistory(userId, projectId);
    const history = persistedHistory || inMemoryScanHistory.get(key) || [];
    return res.json({ success: true, projectId, history });
  } catch (error: any) {
    console.error('[Security Scan] history failed:', {
      message: sanitizeErrorForLog(error),
    });
    return res.status(500).json({ success: false, error: 'Security scan history failed' });
  }
});

export default router;
