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

const pendingStates = new Map<string, PendingOAuthState>();
const inMemoryConnections = new Map<string, SupabaseIntegrationRecord>();
const STATE_TTL_MS = 10 * 60 * 1000;

const SUPABASE_OAUTH_CLIENT_ID = process.env.SUPABASE_OAUTH_CLIENT_ID || '';
const SUPABASE_OAUTH_CLIENT_SECRET = process.env.SUPABASE_OAUTH_CLIENT_SECRET || '';
const SUPABASE_OAUTH_REDIRECT_URI = process.env.SUPABASE_OAUTH_REDIRECT_URI || 'http://localhost:3001/api/integrations/supabase/callback';
const SUPABASE_OAUTH_SCOPES = process.env.SUPABASE_OAUTH_SCOPES || 'database:read database:write auth:read auth:write storage:read storage:write functions:read functions:write';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const nowIso = () => new Date().toISOString();

const getConnectionKey = (userId: string, projectId: string, environment: IntegrationEnvironment) =>
  `${userId}:${projectId}:${environment}`;

const base64UrlEncode = (buffer: Buffer): string =>
  buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const generateRandomString = (size = 32): string => base64UrlEncode(crypto.randomBytes(size));

const createCodeChallenge = (verifier: string): string => {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
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

const verifyProjectOwnership = async (projectId: string, userId: string): Promise<boolean> => {
  if (!supabaseAdmin) return true;
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
    access_token: record.access_token ?? null,
    refresh_token: record.refresh_token ?? null,
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

const getConnectionStatus = async (userId: string, projectId: string) => {
  const statuses: Record<IntegrationEnvironment, any> = {
    test: {
      environment: 'test',
      connected: false,
      mode: 'memory',
    },
    live: {
      environment: 'live',
      connected: false,
      mode: 'memory',
    },
  };

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_integrations')
      .select('environment,status,connected_at,project_ref,scopes,token_expires_at,updated_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('provider', 'supabase');

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const environment = row.environment as IntegrationEnvironment;
        if (environment !== 'test' && environment !== 'live') continue;
        statuses[environment] = {
          environment,
          connected: row.status === 'connected',
          connectedAt: row.connected_at || null,
          projectRef: row.project_ref || null,
          scopes: Array.isArray(row.scopes) ? row.scopes : [],
          tokenExpiresAt: row.token_expires_at || null,
          updatedAt: row.updated_at || null,
          mode: 'db',
        };
      }
      return statuses;
    }
  }

  for (const env of ['test', 'live'] as IntegrationEnvironment[]) {
    const key = getConnectionKey(userId, projectId, env);
    const memoryRecord = inMemoryConnections.get(key);
    if (!memoryRecord) continue;
    statuses[env] = {
      environment: env,
      connected: memoryRecord.status === 'connected',
      connectedAt: memoryRecord.connected_at || null,
      projectRef: memoryRecord.project_ref || null,
      scopes: memoryRecord.scopes || [],
      tokenExpiresAt: memoryRecord.token_expires_at || null,
      updatedAt: memoryRecord.updated_at || null,
      mode: 'memory',
    };
  }

  return statuses;
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

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Project access denied' });
    }

    const stateId = generateRandomString(24);
    const codeVerifier = generateRandomString(48);
    const codeChallenge = createCodeChallenge(codeVerifier);

    pendingStates.set(stateId, {
      userId,
      projectId,
      environment,
      projectRef: typeof projectRef === 'string' ? projectRef.trim() : undefined,
      createdAt: Date.now(),
      expiresAt: Date.now() + STATE_TTL_MS,
      codeVerifier,
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

    const state = pendingStates.get(stateId);
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

    const tokenPayload = await tokenResponse.json().catch(() => ({} as any));
    if (!tokenResponse.ok) {
      const reason = tokenPayload?.error_description || tokenPayload?.error || `HTTP ${tokenResponse.status}`;
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

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Project access denied' });
    }

    const mode = await clearConnection(userId, projectId, environment);
    return res.json({
      success: true,
      environment,
      mode,
    });
  } catch (error: any) {
    console.error('[Supabase Integration] disconnect failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect Supabase' });
  }
});

export default router;

