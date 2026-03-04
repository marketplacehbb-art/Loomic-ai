import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

const router = Router();

type IntegrationEnvironment = 'test' | 'live';

interface PendingOAuthState {
  userId: string;
  projectId: string;
  environment: IntegrationEnvironment;
  projectRef?: string;
  createdAt: number;
  expiresAt: number;
  codeVerifier: string;
}

interface StatelessOAuthStatePayload {
  userId: string;
  projectId: string;
  environment: IntegrationEnvironment;
  projectRef?: string;
  nonce: string;
  iat: number;
  exp: number;
}

interface SupabaseIntegrationRecord {
  user_id: string;
  project_id: string;
  provider: 'supabase';
  environment: IntegrationEnvironment;
  status: 'connected' | 'disconnected';
  connected_at?: string | null;
  disconnected_at?: string | null;
  project_ref?: string | null;
  scopes?: string[] | null;
  token_expires_at?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  metadata?: Record<string, any> | null;
  updated_at?: string;
}

interface SupabaseOAuthTokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface SupabaseModuleLinks {
  dashboard: string;
  database: string;
  sqlEditor: string;
  usersAuth: string;
  storage: string;
  edgeFunctions: string;
  ai: string;
  secrets: string;
  logs: string;
  customEmails: string;
}

interface IntegrationErrorEntry {
  timestamp: string;
  message: string;
  environment?: IntegrationEnvironment;
  code?: string;
}

interface IntegrationAuditEntry {
  timestamp: string;
  action: string;
  environment?: IntegrationEnvironment;
  metadata?: Record<string, any>;
}

const pendingStates = new Map<string, PendingOAuthState>();
const inMemoryConnections = new Map<string, SupabaseIntegrationRecord>();
const integrationLastErrors = new Map<string, IntegrationErrorEntry>();
const integrationAuditLogs = new Map<string, IntegrationAuditEntry[]>();

const STATE_TTL_MS = 10 * 60 * 1000;

const SUPABASE_OAUTH_CLIENT_ID = process.env.SUPABASE_OAUTH_CLIENT_ID || '';
const SUPABASE_OAUTH_CLIENT_SECRET = process.env.SUPABASE_OAUTH_CLIENT_SECRET || '';
const SUPABASE_OAUTH_STATE_SECRET = process.env.SUPABASE_OAUTH_STATE_SECRET || SUPABASE_OAUTH_CLIENT_SECRET;
const SUPABASE_INTEGRATION_TOKEN_SECRET = process.env.SUPABASE_INTEGRATION_TOKEN_SECRET || SUPABASE_OAUTH_STATE_SECRET;
const SUPABASE_OAUTH_REDIRECT_URI = process.env.SUPABASE_OAUTH_REDIRECT_URI || 'http://localhost:3001/api/integrations/supabase/callback';
const SUPABASE_OAUTH_SCOPES = process.env.SUPABASE_OAUTH_SCOPES || 'database:read database:write auth:read auth:write storage:read storage:write functions:read functions:write';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const ENCRYPTED_TOKEN_PREFIX = 'enc:v1:';

const nowIso = () => new Date().toISOString();

const getConnectionKey = (userId: string, projectId: string, environment: IntegrationEnvironment) =>
  `${userId}:${projectId}:${environment}`;

const getProjectScopeKey = (userId: string, projectId: string) => `${userId}:${projectId}`;
const getProjectScopeErrorKey = (userId: string, projectId: string, environment?: IntegrationEnvironment) =>
  `${getProjectScopeKey(userId, projectId)}:${environment || '*'}`;

const base64UrlEncode = (buffer: Buffer): string =>
  buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${'='.repeat(paddingLength)}`, 'base64');
};

const generateRandomString = (size = 32): string => base64UrlEncode(crypto.randomBytes(size));

const createCodeChallenge = (verifier: string): string => {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
};

const createTokenEncryptionKey = (): Buffer | null => {
  if (!SUPABASE_INTEGRATION_TOKEN_SECRET) {
    return null;
  }
  return crypto
    .createHash('sha256')
    .update(SUPABASE_INTEGRATION_TOKEN_SECRET)
    .digest();
};

const encryptStoredToken = (value?: string | null): string | null => {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const key = createTokenEncryptionKey();
  if (!key) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_TOKEN_PREFIX}${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(encrypted)}`;
};

const decryptStoredToken = (value?: string | null): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }
  if (!value.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
    return value;
  }

  const key = createTokenEncryptionKey();
  if (!key) {
    return '';
  }

  const encoded = value.slice(ENCRYPTED_TOKEN_PREFIX.length);
  const [ivRaw, authTagRaw, encryptedRaw, ...rest] = encoded.split('.');
  if (!ivRaw || !authTagRaw || !encryptedRaw || rest.length > 0) {
    return '';
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, base64UrlDecode(ivRaw));
    decipher.setAuthTag(base64UrlDecode(authTagRaw));
    const decrypted = Buffer.concat([
      decipher.update(base64UrlDecode(encryptedRaw)),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

const signStatePayload = (encodedPayload: string): string =>
  base64UrlEncode(
    crypto
      .createHmac('sha256', SUPABASE_OAUTH_STATE_SECRET)
      .update(encodedPayload)
      .digest()
  );

const createCodeVerifierFromNonce = (nonce: string): string =>
  base64UrlEncode(
    crypto
      .createHmac('sha256', SUPABASE_OAUTH_STATE_SECRET)
      .update(`pkce:${nonce}`)
      .digest()
  );

const createOAuthState = (
  userId: string,
  projectId: string,
  environment: IntegrationEnvironment,
  projectRef?: string
): { stateId: string; state: PendingOAuthState } => {
  const createdAt = Date.now();
  const expiresAt = createdAt + STATE_TTL_MS;
  const nonce = generateRandomString(24);
  const payload: StatelessOAuthStatePayload = {
    userId,
    projectId,
    environment,
    projectRef,
    nonce,
    iat: createdAt,
    exp: expiresAt,
  };

  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = signStatePayload(encodedPayload);

  return {
    stateId: `${encodedPayload}.${signature}`,
    state: {
      userId,
      projectId,
      environment,
      projectRef,
      createdAt,
      expiresAt,
      codeVerifier: createCodeVerifierFromNonce(nonce),
    }
  };
};

const parseStatelessOAuthState = (stateId: string): PendingOAuthState | null => {
  if (!SUPABASE_OAUTH_STATE_SECRET || !stateId.includes('.')) {
    return null;
  }

  const [encodedPayload, signature, ...rest] = stateId.split('.');
  if (!encodedPayload || !signature || rest.length > 0) {
    return null;
  }

  const expectedSignature = signStatePayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as Partial<StatelessOAuthStatePayload>;
    if (
      typeof decoded.userId !== 'string' ||
      typeof decoded.projectId !== 'string' ||
      (decoded.environment !== 'test' && decoded.environment !== 'live') ||
      typeof decoded.nonce !== 'string' ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }

    if (decoded.exp <= Date.now()) {
      return null;
    }

    return {
      userId: decoded.userId,
      projectId: decoded.projectId,
      environment: decoded.environment,
      projectRef: typeof decoded.projectRef === 'string' ? decoded.projectRef : undefined,
      createdAt: decoded.iat,
      expiresAt: decoded.exp,
      codeVerifier: createCodeVerifierFromNonce(decoded.nonce),
    };
  } catch {
    return null;
  }
};

const isMissingTableError = (error: any) =>
  error?.code === 'PGRST205' ||
  String(error?.message || '').toLowerCase().includes('could not find the table');

const cleanupExpiredPendingStates = () => {
  const now = Date.now();
  for (const [stateId, payload] of pendingStates.entries()) {
    if (payload.expiresAt <= now) {
      pendingStates.delete(stateId);
    }
  }
};

const buildSupabaseLinks = (projectRef?: string | null): SupabaseModuleLinks | null => {
  const trimmedRef = typeof projectRef === 'string' ? projectRef.trim() : '';
  if (!trimmedRef) return null;
  const base = `https://supabase.com/dashboard/project/${trimmedRef}`;
  return {
    dashboard: base,
    database: `${base}/editor`,
    sqlEditor: `${base}/sql/new`,
    usersAuth: `${base}/auth/users`,
    storage: `${base}/storage/buckets`,
    edgeFunctions: `${base}/functions`,
    ai: `${base}/ai`,
    secrets: `${base}/settings/functions`,
    logs: `${base}/logs/explorer`,
    customEmails: `${base}/auth/templates`,
  };
};

const appendIntegrationAudit = (userId: string, projectId: string, entry: IntegrationAuditEntry) => {
  const key = getProjectScopeKey(userId, projectId);
  const existing = integrationAuditLogs.get(key) || [];
  existing.push(entry);
  integrationAuditLogs.set(key, existing.slice(-80));
  syncIntegrationDiagnostics(userId, projectId, entry.environment);
};

const setIntegrationError = (
  userId: string,
  projectId: string,
  message: string,
  environment?: IntegrationEnvironment,
  code?: string
) => {
  const entry: IntegrationErrorEntry = {
    timestamp: nowIso(),
    message,
    environment,
    code,
  };
  integrationLastErrors.set(getProjectScopeErrorKey(userId, projectId, environment), entry);
  integrationLastErrors.set(getProjectScopeErrorKey(userId, projectId), entry);
  syncIntegrationDiagnostics(userId, projectId, environment);
};

const clearIntegrationError = (userId: string, projectId: string, environment?: IntegrationEnvironment) => {
  integrationLastErrors.delete(getProjectScopeErrorKey(userId, projectId, environment));
  integrationLastErrors.delete(getProjectScopeErrorKey(userId, projectId));
  syncIntegrationDiagnostics(userId, projectId, environment);
};

const resolveIntegrationError = (userId: string, projectId: string, environment?: IntegrationEnvironment) => {
  if (environment) {
    const scoped = integrationLastErrors.get(getProjectScopeErrorKey(userId, projectId, environment));
    if (scoped) return scoped;
  }
  return integrationLastErrors.get(getProjectScopeErrorKey(userId, projectId)) || null;
};

const compareTimestampsDesc = (left?: string | null, right?: string | null): number =>
  String(right || '').localeCompare(String(left || ''));

const parsePersistedIntegrationError = (value: unknown): IntegrationErrorEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== 'string' || typeof entry.message !== 'string') {
    return null;
  }

  return {
    timestamp: entry.timestamp,
    message: entry.message,
    environment: entry.environment === 'test' || entry.environment === 'live'
      ? entry.environment
      : undefined,
    code: typeof entry.code === 'string' ? entry.code : undefined,
  };
};

const parsePersistedIntegrationAudit = (value: unknown): IntegrationAuditEntry[] => {
  if (!Array.isArray(value)) return [];

  const entries: IntegrationAuditEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.timestamp !== 'string' || typeof entry.action !== 'string') continue;
    entries.push({
      timestamp: entry.timestamp,
      action: entry.action,
      environment: entry.environment === 'test' || entry.environment === 'live'
        ? entry.environment
        : undefined,
      metadata: entry.metadata && typeof entry.metadata === 'object'
        ? (entry.metadata as Record<string, any>)
        : undefined,
    });
  }

  return entries;
};

const extractPersistedDiagnostics = (metadata: unknown): { lastError: IntegrationErrorEntry | null; recentAudit: IntegrationAuditEntry[] } => {
  if (!metadata || typeof metadata !== 'object') {
    return { lastError: null, recentAudit: [] };
  }

  const root = metadata as Record<string, unknown>;
  const diagnostics = root.diagnostics && typeof root.diagnostics === 'object'
    ? (root.diagnostics as Record<string, unknown>)
    : root;

  return {
    lastError: parsePersistedIntegrationError(diagnostics.lastError),
    recentAudit: parsePersistedIntegrationAudit(diagnostics.recentAudit),
  };
};

const mergeAuditEntries = (
  memoryAudit: IntegrationAuditEntry[],
  persistedAudit: IntegrationAuditEntry[]
): IntegrationAuditEntry[] => {
  const deduped = new Map<string, IntegrationAuditEntry>();

  [...memoryAudit, ...persistedAudit].forEach((entry) => {
    const key = `${entry.timestamp}|${entry.action}|${entry.environment || ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  });

  return [...deduped.values()]
    .sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp))
    .slice(0, 20);
};

const pickLatestIntegrationError = (
  memoryError: IntegrationErrorEntry | null,
  persistedError: IntegrationErrorEntry | null
): IntegrationErrorEntry | null => {
  if (!memoryError) return persistedError;
  if (!persistedError) return memoryError;
  return compareTimestampsDesc(memoryError.timestamp, persistedError.timestamp) <= 0
    ? memoryError
    : persistedError;
};

const isProjectOwnershipVerificationAvailable = (): boolean => Boolean(supabaseAdmin);

const verifyProjectOwnership = async (projectId: string, userId: string): Promise<boolean> => {
  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Supabase Integration] project ownership check failed:', error.message);
    return false;
  }
  return Boolean(data?.id);
};

const persistIntegrationDiagnostics = async (
  userId: string,
  projectId: string,
  environment: IntegrationEnvironment
): Promise<void> => {
  if (!supabaseAdmin) return;

  const projectKey = getProjectScopeKey(userId, projectId);
  const memoryLastError = integrationLastErrors.get(getProjectScopeErrorKey(userId, projectId, environment)) || null;
  const memoryAudit = (integrationAuditLogs.get(projectKey) || [])
    .filter((entry) => !entry.environment || entry.environment === environment)
    .slice(-20);

  const { data, error } = await supabaseAdmin
    .from('project_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', 'supabase')
    .eq('environment', environment)
    .maybeSingle();

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Supabase Integration] diagnostics load failed:', error.message);
    }
    return;
  }
  if (!data) return;

  const existingMetadata =
    data && typeof data === 'object' && (data as any).metadata && typeof (data as any).metadata === 'object'
      ? ((data as any).metadata as Record<string, any>)
      : {};
  const nextMetadata = {
    ...existingMetadata,
    diagnostics: {
      ...(existingMetadata.diagnostics && typeof existingMetadata.diagnostics === 'object'
        ? (existingMetadata.diagnostics as Record<string, any>)
        : {}),
      lastError: memoryLastError,
      recentAudit: memoryAudit,
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from('project_integrations')
    .update({ metadata: nextMetadata })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', 'supabase')
    .eq('environment', environment);

  if (updateError && !isMissingTableError(updateError)) {
    console.warn('[Supabase Integration] diagnostics persist failed:', updateError.message);
  }
};

const syncIntegrationDiagnostics = (
  userId: string,
  projectId: string,
  environment?: IntegrationEnvironment
) => {
  if (!environment) return;
  void persistIntegrationDiagnostics(userId, projectId, environment).catch((error: any) => {
    console.warn('[Supabase Integration] diagnostics sync failed:', error?.message || error);
  });
};

const loadPersistedIntegrationDiagnostics = async (
  userId: string,
  projectId: string,
  environment?: IntegrationEnvironment
): Promise<{ lastError: IntegrationErrorEntry | null; recentAudit: IntegrationAuditEntry[] } | null> => {
  if (!supabaseAdmin) return null;

  if (environment) {
    const { data, error } = await supabaseAdmin
      .from('project_integrations')
      .select('metadata')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('provider', 'supabase')
      .eq('environment', environment)
      .maybeSingle();

    if (error) {
      if (!isMissingTableError(error)) {
        console.warn('[Supabase Integration] diagnostics read failed:', error.message);
      }
      return null;
    }

    return extractPersistedDiagnostics((data as any)?.metadata);
  }

  const { data, error } = await supabaseAdmin
    .from('project_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', 'supabase');

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Supabase Integration] diagnostics read failed:', error.message);
    }
    return null;
  }

  const snapshots = Array.isArray(data) ? data.map((row) => extractPersistedDiagnostics((row as any)?.metadata)) : [];
  const lastError = snapshots.reduce<IntegrationErrorEntry | null>(
    (latest, snapshot) => pickLatestIntegrationError(latest, snapshot.lastError),
    null
  );
  const recentAudit = mergeAuditEntries([], snapshots.flatMap((snapshot) => snapshot.recentAudit));

  return {
    lastError,
    recentAudit,
  };
};

const persistConnection = async (record: SupabaseIntegrationRecord): Promise<'db' | 'memory'> => {
  const key = getConnectionKey(record.user_id, record.project_id, record.environment);

  if (!supabaseAdmin) {
    inMemoryConnections.set(key, record);
    return 'memory';
  }

  const payload = {
    user_id: record.user_id,
    project_id: record.project_id,
    provider: record.provider,
    environment: record.environment,
    status: record.status,
    connected_at: record.connected_at ?? null,
    disconnected_at: record.disconnected_at ?? null,
    project_ref: record.project_ref ?? null,
    scopes: record.scopes ?? [],
    token_expires_at: record.token_expires_at ?? null,
    access_token: encryptStoredToken(record.access_token),
    refresh_token: encryptStoredToken(record.refresh_token),
    metadata: record.metadata ?? {},
    updated_at: nowIso(),
  };

  const { error } = await supabaseAdmin
    .from('project_integrations')
    .upsert(payload, { onConflict: 'project_id,provider,environment' });

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Supabase Integration] DB upsert failed, fallback to memory:', error.message);
    }
    inMemoryConnections.set(key, record);
    return 'memory';
  }

  inMemoryConnections.delete(key);
  return 'db';
};

const clearConnection = async (userId: string, projectId: string, environment: IntegrationEnvironment): Promise<'db' | 'memory'> => {
  const key = getConnectionKey(userId, projectId, environment);
  inMemoryConnections.delete(key);

  if (!supabaseAdmin) return 'memory';

  const { error } = await supabaseAdmin
    .from('project_integrations')
    .update({
      status: 'disconnected',
      disconnected_at: nowIso(),
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      updated_at: nowIso(),
    })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', 'supabase')
    .eq('environment', environment);

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Supabase Integration] DB disconnect update failed, using memory only:', error.message);
    }
    return 'memory';
  }

  return 'db';
};

const mapRecordToStatus = (record: SupabaseIntegrationRecord | null, mode: 'db' | 'memory', environment: IntegrationEnvironment) => {
  const connected = Boolean(record && record.status === 'connected');
  return {
    environment,
    connected,
    connectedAt: record?.connected_at || null,
    projectRef: record?.project_ref || null,
    scopes: Array.isArray(record?.scopes) ? record?.scopes : [],
    tokenExpiresAt: record?.token_expires_at || null,
    updatedAt: record?.updated_at || null,
    mode,
    links: buildSupabaseLinks(record?.project_ref || null),
  };
};

const getConnectionRecord = async (
  userId: string,
  projectId: string,
  environment: IntegrationEnvironment
): Promise<{ record: SupabaseIntegrationRecord | null; mode: 'db' | 'memory' }> => {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('provider', 'supabase')
      .eq('environment', environment)
      .maybeSingle();

    if (!error && data) {
      return { record: data as SupabaseIntegrationRecord, mode: 'db' };
    }
  }

  const memoryKey = getConnectionKey(userId, projectId, environment);
  const memoryRecord = inMemoryConnections.get(memoryKey) || null;
  return { record: memoryRecord, mode: 'memory' };
};

const getConnectionStatus = async (userId: string, projectId: string) => {
  const testRecord = await getConnectionRecord(userId, projectId, 'test');
  const liveRecord = await getConnectionRecord(userId, projectId, 'live');

  return {
    test: mapRecordToStatus(testRecord.record, testRecord.mode, 'test'),
    live: mapRecordToStatus(liveRecord.record, liveRecord.mode, 'live'),
  };
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '');

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }

    const status = await getConnectionStatus(userId, projectId);
    return res.json({ success: true, status });
  } catch (error: any) {
    console.error('[Supabase Integration] status failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load integration status' });
  }
});

router.get('/links', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '');
    const envRaw = String(req.query.environment || '').trim().toLowerCase();
    const environment: IntegrationEnvironment | null = envRaw === 'test' || envRaw === 'live'
      ? (envRaw as IntegrationEnvironment)
      : null;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }

    const status = await getConnectionStatus(userId, projectId);
    const resolvedEnvironment: IntegrationEnvironment = environment
      || (status.live.connected ? 'live' : status.test.connected ? 'test' : 'test');
    const resolved = status[resolvedEnvironment];
    const links = resolved.links || null;

    return res.json({
      success: true,
      environment: resolvedEnvironment,
      connected: resolved.connected,
      projectRef: resolved.projectRef || null,
      requiredIds: {
        projectId,
        projectRef: resolved.projectRef || null,
      },
      links,
      connectCta: !resolved.connected,
      modules: [
        { key: 'database', label: 'Database', url: links?.database || null },
        { key: 'sqlEditor', label: 'SQL Editor', url: links?.sqlEditor || null },
        { key: 'usersAuth', label: 'Users/Auth', url: links?.usersAuth || null },
        { key: 'storage', label: 'Storage', url: links?.storage || null },
        { key: 'edgeFunctions', label: 'Edge Functions', url: links?.edgeFunctions || null },
        { key: 'ai', label: 'AI', url: links?.ai || null },
        { key: 'secrets', label: 'Secrets', url: links?.secrets || null },
        { key: 'logs', label: 'Logs', url: links?.logs || null },
        { key: 'customEmails', label: 'Custom Emails', url: links?.customEmails || null },
      ],
    });
  } catch (error: any) {
    console.error('[Supabase Integration] links failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to resolve Supabase links' });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '');
    const envRaw = String(req.query.environment || '').trim().toLowerCase();
    const environment: IntegrationEnvironment | null = envRaw === 'test' || envRaw === 'live'
      ? (envRaw as IntegrationEnvironment)
      : null;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }

    const status = await getConnectionStatus(userId, projectId);
    const resolvedEnvironment: IntegrationEnvironment = environment
      || (status.live.connected ? 'live' : status.test.connected ? 'test' : 'test');
    const resolved = status[resolvedEnvironment];
    const lastError = resolveIntegrationError(userId, projectId, resolvedEnvironment);

    if (!resolved.connected) {
      return res.json({
        success: true,
        environment: resolvedEnvironment,
        connected: false,
        degraded: true,
        status: 'disconnected',
        checkedAt: nowIso(),
        lastError,
      });
    }

    if (!resolved.projectRef) {
      return res.json({
        success: true,
        environment: resolvedEnvironment,
        connected: true,
        degraded: true,
        status: 'missing_project_ref',
        checkedAt: nowIso(),
        lastError,
      });
    }

    const recordResult = await getConnectionRecord(userId, projectId, resolvedEnvironment);
    const accessToken = decryptStoredToken(recordResult.record?.access_token);
    if (!accessToken) {
      return res.json({
        success: true,
        environment: resolvedEnvironment,
        connected: true,
        degraded: true,
        status: 'limited_check_no_token',
        checkedAt: nowIso(),
        projectRef: resolved.projectRef,
        lastError,
      });
    }

    let upstreamStatus: number | null = null;
    let upstreamHealthy = false;
    let upstreamError: string | null = null;

    try {
      const upstreamResponse = await fetch(`https://api.supabase.com/v1/projects/${resolved.projectRef}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      upstreamStatus = upstreamResponse.status;
      upstreamHealthy = upstreamResponse.ok;
      if (!upstreamHealthy) {
        const payload = await upstreamResponse.text().catch(() => '');
        upstreamError = payload?.slice(0, 220) || `HTTP ${upstreamResponse.status}`;
      }
    } catch (upstreamFailure: any) {
      upstreamError = upstreamFailure?.message || 'Supabase upstream health call failed';
    }

    if (upstreamError) {
      setIntegrationError(userId, projectId, upstreamError, resolvedEnvironment, 'SUPABASE_HEALTH_CHECK_FAILED');
    } else {
      clearIntegrationError(userId, projectId, resolvedEnvironment);
    }

    return res.json({
      success: true,
      environment: resolvedEnvironment,
      connected: true,
      degraded: !upstreamHealthy,
      status: upstreamHealthy ? 'healthy' : 'degraded',
      upstreamStatus,
      upstreamError,
      checkedAt: nowIso(),
      projectRef: resolved.projectRef,
      lastError: resolveIntegrationError(userId, projectId, resolvedEnvironment),
    });
  } catch (error: any) {
    console.error('[Supabase Integration] health failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to check Supabase health' });
  }
});

router.get('/last-error', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '');
    const envRaw = String(req.query.environment || '').trim().toLowerCase();
    const environment: IntegrationEnvironment | undefined = envRaw === 'test' || envRaw === 'live'
      ? (envRaw as IntegrationEnvironment)
      : undefined;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }

    const memoryLastError = resolveIntegrationError(userId, projectId, environment) || null;
    const memoryAudit = (integrationAuditLogs.get(getProjectScopeKey(userId, projectId)) || []).slice(-20);
    const persistedDiagnostics = await loadPersistedIntegrationDiagnostics(userId, projectId, environment);
    const lastError = pickLatestIntegrationError(memoryLastError, persistedDiagnostics?.lastError || null);
    const recentAudit = mergeAuditEntries(memoryAudit, persistedDiagnostics?.recentAudit || []);
    return res.json({
      success: true,
      environment: environment || null,
      lastError,
      recentAudit,
    });
  } catch (error: any) {
    console.error('[Supabase Integration] last-error failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to read integration errors' });
  }
});

router.post('/connect', async (req: Request, res: Response) => {
  try {
    cleanupExpiredPendingStates();
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const { projectId, environment, projectRef } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }
    if (environment !== 'test' && environment !== 'live') {
      return res.status(400).json({ success: false, error: 'Invalid environment' });
    }
    if (!SUPABASE_OAUTH_CLIENT_ID || !SUPABASE_OAUTH_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Supabase OAuth is not configured on server' });
    }
    if (!isProjectOwnershipVerificationAvailable()) {
      return res.status(503).json({ success: false, error: 'Project verification is unavailable on server' });
    }

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Project access denied' });
    }

    const nextState = createOAuthState(
      userId,
      projectId,
      environment,
      typeof projectRef === 'string' ? projectRef.trim() : undefined
    );
    const stateId = nextState.stateId;
    const codeVerifier = nextState.state.codeVerifier;
    const codeChallenge = createCodeChallenge(codeVerifier);

    appendIntegrationAudit(userId, projectId, {
      timestamp: nowIso(),
      action: 'connect_requested',
      environment,
      metadata: {
        hasProjectRef: Boolean(projectRef),
      },
    });

    const params = new URLSearchParams({
      client_id: SUPABASE_OAUTH_CLIENT_ID,
      redirect_uri: SUPABASE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: SUPABASE_OAUTH_SCOPES,
      state: stateId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizeUrl = `https://api.supabase.com/v1/oauth/authorize?${params.toString()}`;
    return res.json({
      success: true,
      authorizeUrl,
      environment,
    });
  } catch (error: any) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const { projectId, environment } = req.body || {};
    if (userId && typeof projectId === 'string') {
      setIntegrationError(userId, projectId, error?.message || 'Failed to initiate Supabase OAuth', environment, 'SUPABASE_CONNECT_FAILED');
    }
    console.error('[Supabase Integration] connect failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate Supabase OAuth' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const redirect = (projectId?: string, status: 'success' | 'error' = 'error', message?: string, environment?: IntegrationEnvironment) => {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    params.set('supabase_oauth', status);
    if (environment) params.set('supabase_env', environment);
    if (message) params.set('supabase_message', message.slice(0, 180));
    const query = params.toString();
    return res.redirect(`${APP_BASE_URL}/generator${query ? `?${query}` : ''}`);
  };

  try {
    cleanupExpiredPendingStates();
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateId = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

    if (oauthError) {
      return redirect(undefined, 'error', oauthError);
    }
    if (!code || !stateId) {
      return redirect(undefined, 'error', 'Missing OAuth callback parameters');
    }

    const state = parseStatelessOAuthState(stateId) || pendingStates.get(stateId) || null;
    if (!state || state.expiresAt <= Date.now()) {
      pendingStates.delete(stateId);
      return redirect(undefined, 'error', 'OAuth state expired');
    }
    pendingStates.delete(stateId);

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SUPABASE_OAUTH_REDIRECT_URI,
      client_id: SUPABASE_OAUTH_CLIENT_ID,
      client_secret: SUPABASE_OAUTH_CLIENT_SECRET,
      code_verifier: state.codeVerifier,
    });

    const tokenResponse = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody.toString(),
    });

    const tokenPayloadRaw = await tokenResponse.json().catch(() => ({}));
    const tokenPayload: SupabaseOAuthTokenPayload =
      typeof tokenPayloadRaw === 'object' && tokenPayloadRaw !== null
        ? (tokenPayloadRaw as SupabaseOAuthTokenPayload)
        : {};
    if (!tokenResponse.ok) {
      const reason = tokenPayload?.error_description || tokenPayload?.error || `HTTP ${tokenResponse.status}`;
      setIntegrationError(state.userId, state.projectId, `Token exchange failed: ${reason}`, state.environment, 'SUPABASE_TOKEN_EXCHANGE_FAILED');
      appendIntegrationAudit(state.userId, state.projectId, {
        timestamp: nowIso(),
        action: 'connect_failed',
        environment: state.environment,
        metadata: { reason },
      });
      return redirect(state.projectId, 'error', `Token exchange failed: ${reason}`, state.environment);
    }

    const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : '';
    const refreshToken = typeof tokenPayload.refresh_token === 'string' ? tokenPayload.refresh_token : '';
    const expiresIn = Number(tokenPayload.expires_in || 0);
    const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const scopeString = typeof tokenPayload.scope === 'string' ? tokenPayload.scope : SUPABASE_OAUTH_SCOPES;
    const scopes = scopeString.split(/\s+/).map((value: string) => value.trim()).filter(Boolean);

    await persistConnection({
      user_id: state.userId,
      project_id: state.projectId,
      provider: 'supabase',
      environment: state.environment,
      status: 'connected',
      connected_at: nowIso(),
      disconnected_at: null,
      project_ref: state.projectRef || null,
      scopes,
      token_expires_at: tokenExpiresAt,
      access_token: accessToken || null,
      refresh_token: refreshToken || null,
      metadata: {
        token_type: tokenPayload.token_type || null,
      },
      updated_at: nowIso(),
    });

    clearIntegrationError(state.userId, state.projectId, state.environment);
    appendIntegrationAudit(state.userId, state.projectId, {
      timestamp: nowIso(),
      action: 'connected',
      environment: state.environment,
      metadata: {
        projectRef: state.projectRef || null,
        scopesCount: scopes.length,
      },
    });

    return redirect(state.projectId, 'success', 'Supabase connected', state.environment);
  } catch (error: any) {
    console.error('[Supabase Integration] callback failed:', error);
    return redirect(undefined, 'error', 'OAuth callback failed');
  }
});

router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const { projectId, environment } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }
    if (environment !== 'test' && environment !== 'live') {
      return res.status(400).json({ success: false, error: 'Invalid environment' });
    }
    if (!isProjectOwnershipVerificationAvailable()) {
      return res.status(503).json({ success: false, error: 'Project verification is unavailable on server' });
    }

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Project access denied' });
    }

    const mode = await clearConnection(userId, projectId, environment);
    appendIntegrationAudit(userId, projectId, {
      timestamp: nowIso(),
      action: 'disconnected',
      environment,
      metadata: { mode },
    });
    clearIntegrationError(userId, projectId, environment);

    return res.json({
      success: true,
      environment,
      mode,
    });
  } catch (error: any) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const { projectId, environment } = req.body || {};
    if (userId && typeof projectId === 'string') {
      setIntegrationError(userId, projectId, error?.message || 'Failed to disconnect Supabase', environment, 'SUPABASE_DISCONNECT_FAILED');
    }
    console.error('[Supabase Integration] disconnect failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect Supabase' });
  }
});

export default router;
