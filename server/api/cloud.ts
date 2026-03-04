import { Request, Response, Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

type CloudEnvironment = 'test' | 'live';
type PersistMode = 'db' | 'memory';

interface CloudStateRecord {
  user_id: string;
  project_id: string;
  enabled: boolean;
  enabled_at: string | null;
  last_action_source: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
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

interface SupabaseConnectionStatus {
  connected: boolean;
  environment: CloudEnvironment | null;
  projectRef: string | null;
  links: SupabaseModuleLinks | null;
}

const inMemoryCloudState = new Map<string, CloudStateRecord>();

const nowIso = (): string => new Date().toISOString();

const getCloudKey = (userId: string, projectId: string): string => `${userId}:${projectId}`;

const isMissingTableError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  String(error?.message || '').toLowerCase().includes('could not find the table');

const parseEnvironment = (value: unknown): CloudEnvironment | null =>
  value === 'test' || value === 'live' ? value : null;

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

const isProjectOwnershipVerificationAvailable = (): boolean => Boolean(supabaseAdmin);

const verifyProjectOwnership = async (projectId: string, userId: string): Promise<boolean> => {
  if (!supabaseAdmin) return true;

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Cloud] project ownership check failed:', error.message);
    return false;
  }
  return Boolean(data?.id);
};

const getCloudState = async (
  userId: string,
  projectId: string
): Promise<{ state: CloudStateRecord; mode: PersistMode }> => {
  const key = getCloudKey(userId, projectId);

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_cloud_state')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (!error && data) {
      const record = data as CloudStateRecord;
      return { state: record, mode: 'db' };
    }

    if (error && !isMissingTableError(error)) {
      console.warn('[Cloud] project_cloud_state read failed:', error.message);
    }
  }

  const memoryState = inMemoryCloudState.get(key);
  if (memoryState) {
    return {
      state: memoryState,
      mode: 'memory',
    };
  }

  const fallback: CloudStateRecord = {
    user_id: userId,
    project_id: projectId,
    enabled: false,
    enabled_at: null,
    last_action_source: null,
    metadata: {},
    updated_at: nowIso(),
  };

  return {
    state: fallback,
    mode: 'memory',
  };
};

const persistCloudState = async (
  record: CloudStateRecord
): Promise<{ state: CloudStateRecord; mode: PersistMode }> => {
  const key = getCloudKey(record.user_id, record.project_id);

  if (supabaseAdmin) {
    const payload = {
      user_id: record.user_id,
      project_id: record.project_id,
      enabled: record.enabled,
      enabled_at: record.enabled_at,
      last_action_source: record.last_action_source,
      metadata: record.metadata || {},
      updated_at: record.updated_at,
    };

    const { data, error } = await supabaseAdmin
      .from('project_cloud_state')
      .upsert(payload, { onConflict: 'user_id,project_id' })
      .select('*')
      .maybeSingle();

    if (!error && data) {
      inMemoryCloudState.delete(key);
      return {
        state: data as CloudStateRecord,
        mode: 'db',
      };
    }

    if (error && !isMissingTableError(error)) {
      console.warn('[Cloud] project_cloud_state write failed, fallback to memory:', error.message);
    }
  }

  inMemoryCloudState.set(key, record);
  return {
    state: record,
    mode: 'memory',
  };
};

const resolveSupabaseConnectionStatus = async (
  userId: string,
  projectId: string,
  requestedEnvironment: CloudEnvironment | null
): Promise<SupabaseConnectionStatus> => {
  if (!supabaseAdmin) {
    return {
      connected: false,
      environment: requestedEnvironment,
      projectRef: null,
      links: null,
    };
  }

  let query = supabaseAdmin
    .from('project_integrations')
    .select('status,environment,project_ref')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', 'supabase');

  if (requestedEnvironment) {
    query = query.eq('environment', requestedEnvironment);
  }

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[Cloud] project_integrations read failed:', error.message);
    }
    return {
      connected: false,
      environment: requestedEnvironment,
      projectRef: null,
      links: null,
    };
  }

  const rows = Array.isArray(data) ? data : [];
  const connectedRows = rows.filter((row: any) => row?.status === 'connected');
  const preferred =
    connectedRows.find((row: any) => row?.environment === 'live') ||
    connectedRows.find((row: any) => row?.environment === 'test') ||
    rows.find((row: any) => row?.environment === requestedEnvironment) ||
    rows[0];

  const environment = parseEnvironment(preferred?.environment);
  const projectRef =
    typeof preferred?.project_ref === 'string' && preferred.project_ref.trim().length > 0
      ? preferred.project_ref.trim()
      : null;
  const connected = Boolean(preferred?.status === 'connected');

  return {
    connected,
    environment,
    projectRef,
    links: buildSupabaseLinks(projectRef),
  };
};

router.get('/state', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '').trim();

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }
    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const { state, mode } = await getCloudState(userId, projectId);
    return res.json({
      success: true,
      state: {
        projectId,
        enabled: Boolean(state.enabled),
        enabledAt: state.enabled_at,
        updatedAt: state.updated_at,
        lastActionSource: state.last_action_source,
        mode,
      },
    });
  } catch (error: any) {
    console.error('[Cloud] state failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load cloud state' });
  }
});

router.post('/enable', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.body?.projectId || '').trim();
    const sourceRaw = String(req.body?.source || 'manual').trim();
    const source = sourceRaw.length > 50 ? sourceRaw.slice(0, 50) : sourceRaw;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }
    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const current = await getCloudState(userId, projectId);
    const record: CloudStateRecord = {
      ...current.state,
      user_id: userId,
      project_id: projectId,
      enabled: true,
      enabled_at: current.state.enabled_at || nowIso(),
      last_action_source: source || 'manual',
      metadata: {
        ...(current.state.metadata || {}),
      },
      updated_at: nowIso(),
    };

    const persisted = await persistCloudState(record);
    return res.json({
      success: true,
      state: {
        projectId,
        enabled: true,
        enabledAt: persisted.state.enabled_at,
        updatedAt: persisted.state.updated_at,
        lastActionSource: persisted.state.last_action_source,
        mode: persisted.mode,
      },
    });
  } catch (error: any) {
    console.error('[Cloud] enable failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to enable cloud' });
  }
});

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '').trim();
    const requestedEnvironment = parseEnvironment(String(req.query.environment || '').trim().toLowerCase());

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId' });
    }
    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const [{ state, mode }, supabaseStatus] = await Promise.all([
      getCloudState(userId, projectId),
      resolveSupabaseConnectionStatus(userId, projectId, requestedEnvironment),
    ]);

    const links = supabaseStatus.links;
    const modules = [
      {
        id: 'database',
        label: 'Database',
        description: 'View tables and edit data',
        countLabel: 'Tables',
        count: 0,
        emptyMessage: 'Tables will populate as soon as your app saves information.',
        url: links?.database || null,
      },
      {
        id: 'users',
        label: 'Users',
        description: 'View user data and configure sign-up flows',
        countLabel: 'Signups',
        count: 0,
        emptyMessage: 'Signups appear here after users register.',
        url: links?.usersAuth || null,
      },
      {
        id: 'storage',
        label: 'Storage',
        description: 'View and manage files, images, and documents',
        countLabel: 'Buckets',
        count: 0,
        emptyMessage: 'Buckets will appear here when you create storage buckets.',
        url: links?.storage || null,
      },
      {
        id: 'sqlEditor',
        label: 'SQL Editor',
        description: 'Run SQL directly on your project',
        countLabel: null,
        count: null,
        emptyMessage: 'Use SQL editor to inspect and evolve your schema.',
        url: links?.sqlEditor || null,
      },
      {
        id: 'edgeFunctions',
        label: 'Edge Functions',
        description: 'Deploy server-side logic',
        countLabel: null,
        count: null,
        emptyMessage: 'Edge functions can power payments, emails, and AI jobs.',
        url: links?.edgeFunctions || null,
      },
      {
        id: 'ai',
        label: 'AI',
        description: 'Manage AI features and models',
        countLabel: null,
        count: null,
        emptyMessage: 'AI settings become available after connecting your backend.',
        url: links?.ai || null,
      },
      {
        id: 'secrets',
        label: 'Secrets',
        description: 'Store encrypted secrets for runtime',
        countLabel: null,
        count: null,
        emptyMessage: 'Store provider keys and credentials securely.',
        url: links?.secrets || null,
      },
      {
        id: 'logs',
        label: 'Logs',
        description: 'Inspect runtime and request logs',
        countLabel: null,
        count: null,
        emptyMessage: 'Logs will show activity from your app and functions.',
        url: links?.logs || null,
      },
      {
        id: 'customEmails',
        label: 'Custom Emails',
        description: 'Configure auth email templates',
        countLabel: null,
        count: null,
        emptyMessage: 'Customize onboarding and password reset emails.',
        url: links?.customEmails || null,
      },
    ];

    return res.json({
      success: true,
      projectId,
      cloud: {
        enabled: Boolean(state.enabled),
        enabledAt: state.enabled_at,
        updatedAt: state.updated_at,
        lastActionSource: state.last_action_source,
        mode,
      },
      supabase: {
        connected: supabaseStatus.connected,
        environment: supabaseStatus.environment,
        projectRef: supabaseStatus.projectRef,
      },
      links: links || null,
      modules,
    });
  } catch (error: any) {
    console.error('[Cloud] overview failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load cloud overview' });
  }
});

export default router;
