import { Request, Response, Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { loadProjectFilesForGitHubPush } from './git/github-integration.js';

const router = Router();

type PublishStatus = 'draft' | 'publishing' | 'published' | 'failed';
type PublishAccess = 'public' | 'unlisted' | 'private';
type PersistMode = 'db' | 'memory';
type VercelDeployState = 'building' | 'ready' | 'error';

interface PublicationRecord {
  user_id: string;
  project_id: string;
  status: PublishStatus;
  slug: string;
  published_url: string | null;
  access: PublishAccess;
  site_title: string | null;
  site_description: string | null;
  release_version: number;
  published_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const inMemoryPublications = new Map<string, PublicationRecord>();
const VERCEL_API_BASE = 'https://api.vercel.com/v13';
const VERCEL_POLL_INTERVAL_MS = 2500;
const VERCEL_POLL_TIMEOUT_MS = 180000;
const DEFAULT_VERCEL_CONFIG = {
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  framework: 'vite',
};

const nowIso = (): string => new Date().toISOString();

const publicationKey = (userId: string, projectId: string): string => `${userId}:${projectId}`;

const isMissingTableError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  String(error?.message || '').toLowerCase().includes('could not find the table');

const normalizeAccess = (value: unknown): PublishAccess => {
  if (value === 'private' || value === 'unlisted' || value === 'public') return value;
  return 'public';
};

const normalizeSlug = (value: unknown, projectId: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  const fallback = `project-${projectId.slice(0, 8)}`;
  const normalized = raw
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
};

const normalizeText = (value: unknown, maxLength: number): string | null => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const normalizeHttpUrl = (value: unknown): string | null => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text.slice(0, 1024);
  return `https://${text}`.slice(0, 1024);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mapVercelReadyState = (value: unknown): VercelDeployState => {
  const state = String(value || '').trim().toUpperCase();
  if (state === 'READY') return 'ready';
  if (state === 'ERROR' || state === 'CANCELED') return 'error';
  return 'building';
};

const resolveVercelUrlFromPayload = (payload: any): string | null => {
  const direct = normalizeHttpUrl(payload?.url);
  if (direct) return direct;
  const aliases = Array.isArray(payload?.alias) ? payload.alias : [];
  for (const aliasCandidate of aliases) {
    const alias = normalizeHttpUrl(aliasCandidate);
    if (alias) return alias;
  }
  return null;
};

const readVercelErrorMessage = async (response: globalThis.Response): Promise<string> => {
  const fallback = `${response.status} ${response.statusText || 'Unknown error'}`;
  try {
    const payload = await response.json();
    const message =
      payload?.error?.message ||
      payload?.error?.code ||
      payload?.message ||
      payload?.error;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const normalizeDeploymentName = (projectName: string, projectId: string): string => {
  const fallback = `project-${projectId.slice(0, 8)}`;
  const normalized = String(projectName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
};

const buildVercelDeploymentFiles = (files: Record<string, string>): Record<string, string> => {
  const next = { ...files };
  next['vercel.json'] = `${JSON.stringify(DEFAULT_VERCEL_CONFIG, null, 2)}\n`;
  return next;
};

const createVercelDeployment = async (input: {
  token: string;
  name: string;
  files: Record<string, string>;
}): Promise<{ deploymentId: string; status: VercelDeployState; url: string | null }> => {
  const payloadFiles = Object.entries(input.files).map(([file, data]) => ({ file, data }));
  const createResponse = await fetch(`${VERCEL_API_BASE}/deployments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      files: payloadFiles,
      projectSettings: {
        framework: 'vite',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
      },
    }),
  });

  if (!createResponse.ok) {
    const message = await readVercelErrorMessage(createResponse);
    throw new Error(`Failed to create Vercel deployment (${message})`);
  }

  const payload = await createResponse.json().catch(() => ({} as any));
  const deploymentId = String(payload?.id || payload?.uid || '').trim();
  if (!deploymentId) {
    throw new Error('Vercel deployment creation succeeded but deployment ID is missing');
  }

  return {
    deploymentId,
    status: mapVercelReadyState(payload?.readyState),
    url: resolveVercelUrlFromPayload(payload),
  };
};

const fetchVercelDeploymentStatus = async (input: {
  token: string;
  deploymentId: string;
}): Promise<{ status: VercelDeployState; url: string | null; error: string | null }> => {
  const statusResponse = await fetch(
    `${VERCEL_API_BASE}/deployments/${encodeURIComponent(input.deploymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.token}`,
      },
    }
  );

  if (!statusResponse.ok) {
    const message = await readVercelErrorMessage(statusResponse);
    throw new Error(`Failed to read deployment status (${message})`);
  }

  const payload = await statusResponse.json().catch(() => ({} as any));
  const status = mapVercelReadyState(payload?.readyState);
  const url = resolveVercelUrlFromPayload(payload);
  const error =
    status === 'error'
      ? normalizeText(payload?.errorMessage || payload?.error?.message || payload?.inspectorUrl, 400)
      : null;

  return { status, url, error };
};

const waitForVercelReady = async (input: {
  token: string;
  deploymentId: string;
}): Promise<{ status: VercelDeployState; url: string | null }> => {
  const deadline = Date.now() + VERCEL_POLL_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const statusPayload = await fetchVercelDeploymentStatus(input);
    if (statusPayload.status === 'ready') {
      return { status: statusPayload.status, url: statusPayload.url };
    }
    if (statusPayload.status === 'error') {
      throw new Error(statusPayload.error || 'Vercel deployment failed');
    }
    await sleep(VERCEL_POLL_INTERVAL_MS);
  }
  throw new Error('Vercel deployment timed out before reaching ready state');
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
    console.warn('[Publish] project ownership check failed:', error.message);
    return false;
  }
  return Boolean(data?.id);
};

const getPublication = async (
  userId: string,
  projectId: string
): Promise<{ publication: PublicationRecord | null; mode: PersistMode }> => {
  const key = publicationKey(userId, projectId);

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_publications')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (!error && data) {
      return { publication: data as PublicationRecord, mode: 'db' };
    }

    if (error && !isMissingTableError(error)) {
      console.warn('[Publish] project_publications read failed:', error.message);
    }
  }

  return {
    publication: inMemoryPublications.get(key) || null,
    mode: 'memory',
  };
};

const savePublication = async (
  publication: PublicationRecord
): Promise<{ publication: PublicationRecord; mode: PersistMode }> => {
  const key = publicationKey(publication.user_id, publication.project_id);

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_publications')
      .upsert(publication, { onConflict: 'user_id,project_id' })
      .select('*')
      .single();

    if (!error && data) {
      return { publication: data as PublicationRecord, mode: 'db' };
    }

    if (error && !isMissingTableError(error)) {
      throw error;
    }
  }

  inMemoryPublications.set(key, publication);
  return { publication, mode: 'memory' };
};

const syncProjectPublishState = async (
  projectId: string,
  access: PublishAccess,
  published: boolean
): Promise<void> => {
  if (!supabaseAdmin) return;
  const updates = published
    ? { status: 'published', is_public: access !== 'private' }
    : { status: 'draft', is_public: false };
  const { error } = await supabaseAdmin.from('projects').update(updates).eq('id', projectId);
  if (error) {
    console.warn('[Publish] failed to sync project status:', error.message);
  }
};

const toClientPublication = (
  publication: PublicationRecord | null,
  projectId: string,
  mode: PersistMode
) => {
  if (!publication) {
    return {
      projectId,
      status: 'draft' as PublishStatus,
      slug: normalizeSlug('', projectId),
      access: 'public' as PublishAccess,
      publishedUrl: null,
      siteTitle: null,
      siteDescription: null,
      releaseVersion: 0,
      publishedAt: null,
      lastError: null,
      vercelDeploymentId: null,
      vercelUrl: null,
      vercelStatus: null,
      lastDeployedAt: null,
      mode,
      updatedAt: null,
    };
  }

  const metadata = publication.metadata && typeof publication.metadata === 'object'
    ? publication.metadata
    : {};
  const vercelDeploymentId = normalizeText((metadata as Record<string, unknown>).vercelDeploymentId, 180);
  const vercelUrl = normalizeHttpUrl((metadata as Record<string, unknown>).vercelUrl);
  const rawVercelStatus = (metadata as Record<string, unknown>).vercelStatus;
  const vercelStatus = rawVercelStatus === 'ready' || rawVercelStatus === 'error' || rawVercelStatus === 'building'
    ? rawVercelStatus
    : null;
  const lastDeployedAt = normalizeText((metadata as Record<string, unknown>).lastDeployedAt, 64);

  return {
    projectId: publication.project_id,
    status: publication.status,
    slug: publication.slug,
    access: publication.access,
    publishedUrl: publication.published_url,
    siteTitle: publication.site_title,
    siteDescription: publication.site_description,
    releaseVersion: publication.release_version,
    publishedAt: publication.published_at,
    lastError: publication.last_error,
    vercelDeploymentId,
    vercelUrl,
    vercelStatus,
    lastDeployedAt,
    mode,
    updatedAt: publication.updated_at,
  };
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.query.projectId || '').trim();

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!projectId) return res.status(400).json({ success: false, error: 'Missing projectId' });

    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const { publication, mode } = await getPublication(userId, projectId);
    return res.json({
      success: true,
      publication: toClientPublication(publication, projectId, mode),
    });
  } catch (error: any) {
    console.error('[Publish] status failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load publish status' });
  }
});

router.post('/publish', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.body?.projectId || '').trim();
    const requestedAccess = normalizeAccess(req.body?.access);

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!projectId) return res.status(400).json({ success: false, error: 'Missing projectId' });

    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const current = await getPublication(userId, projectId);
    const now = nowIso();
    const slug = normalizeSlug(req.body?.slug || current.publication?.slug, projectId);
    const releaseVersion = (current.publication?.release_version || 0) + 1;
    const publishedUrl = `https://${slug}.loomic.app`;

    const record: PublicationRecord = {
      user_id: userId,
      project_id: projectId,
      status: 'published',
      slug,
      published_url: publishedUrl,
      access: requestedAccess,
      site_title: normalizeText(req.body?.siteTitle, 120),
      site_description: normalizeText(req.body?.siteDescription, 240),
      release_version: releaseVersion,
      published_at: now,
      last_error: null,
      metadata: current.publication?.metadata || {},
      created_at: current.publication?.created_at || now,
      updated_at: now,
    };

    const persisted = await savePublication(record);
    await syncProjectPublishState(projectId, requestedAccess, true);

    return res.json({
      success: true,
      publication: toClientPublication(persisted.publication, projectId, persisted.mode),
    });
  } catch (error: any) {
    console.error('[Publish] publish failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to publish project' });
  }
});

router.post('/deploy-vercel', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.body?.projectId || '').trim();

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!projectId) return res.status(400).json({ success: false, error: 'Missing projectId' });

    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const vercelToken = String(process.env.VERCEL_TOKEN || '').trim();
    if (!vercelToken) {
      return res.status(500).json({ success: false, error: 'VERCEL_TOKEN is not configured' });
    }

    const projectData = await loadProjectFilesForGitHubPush({ userId, projectId });
    const deploymentName = normalizeDeploymentName(projectData.projectName, projectId);
    const deploymentFiles = buildVercelDeploymentFiles(projectData.files);

    const created = await createVercelDeployment({
      token: vercelToken,
      name: deploymentName,
      files: deploymentFiles,
    });

    const ready = await waitForVercelReady({
      token: vercelToken,
      deploymentId: created.deploymentId,
    });

    const deploymentUrl = ready.url;
    if (!deploymentUrl) {
      throw new Error('Vercel deployment is ready but deployment URL is missing');
    }

    const current = await getPublication(userId, projectId);
    const now = nowIso();
    const metadata = {
      ...(current.publication?.metadata || {}),
      vercelDeploymentId: created.deploymentId,
      vercelUrl: deploymentUrl,
      vercelStatus: 'ready',
      lastDeployedAt: now,
    };

    const record: PublicationRecord = {
      user_id: userId,
      project_id: projectId,
      status: current.publication?.status || 'draft',
      slug: normalizeSlug(current.publication?.slug || deploymentName, projectId),
      published_url: current.publication?.published_url || null,
      access: current.publication?.access || 'public',
      site_title: current.publication?.site_title || null,
      site_description: current.publication?.site_description || null,
      release_version: current.publication?.release_version || 0,
      published_at: current.publication?.published_at || null,
      last_error: null,
      metadata,
      created_at: current.publication?.created_at || now,
      updated_at: now,
    };

    const persisted = await savePublication(record);
    return res.json({
      success: true,
      url: deploymentUrl,
      deploymentId: created.deploymentId,
      publication: toClientPublication(persisted.publication, projectId, persisted.mode),
    });
  } catch (error: any) {
    console.error('[Publish] deploy-vercel failed:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to deploy to Vercel' });
  }
});

router.get('/deploy-status/:deploymentId', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const deploymentId = String(req.params?.deploymentId || '').trim();

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!deploymentId) return res.status(400).json({ success: false, error: 'Missing deploymentId' });

    const vercelToken = String(process.env.VERCEL_TOKEN || '').trim();
    if (!vercelToken) {
      return res.status(500).json({ success: false, error: 'VERCEL_TOKEN is not configured' });
    }

    const statusPayload = await fetchVercelDeploymentStatus({
      token: vercelToken,
      deploymentId,
    });

    return res.json({
      success: true,
      status: statusPayload.status,
      url: statusPayload.url || undefined,
    });
  } catch (error: any) {
    console.error('[Publish] deploy-status failed:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load deployment status' });
  }
});

router.post('/unpublish', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    const projectId = String(req.body?.projectId || '').trim();

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!projectId) return res.status(400).json({ success: false, error: 'Missing projectId' });

    if (isProjectOwnershipVerificationAvailable()) {
      const isOwner = await verifyProjectOwnership(projectId, userId);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Project access denied' });
      }
    }

    const current = await getPublication(userId, projectId);
    const now = nowIso();
    const slug = normalizeSlug(current.publication?.slug, projectId);

    const record: PublicationRecord = {
      user_id: userId,
      project_id: projectId,
      status: 'draft',
      slug,
      published_url: null,
      access: current.publication?.access || 'public',
      site_title: current.publication?.site_title || null,
      site_description: current.publication?.site_description || null,
      release_version: current.publication?.release_version || 0,
      published_at: null,
      last_error: null,
      metadata: current.publication?.metadata || {},
      created_at: current.publication?.created_at || now,
      updated_at: now,
    };

    const persisted = await savePublication(record);
    await syncProjectPublishState(projectId, record.access, false);

    return res.json({
      success: true,
      publication: toClientPublication(persisted.publication, projectId, persisted.mode),
    });
  } catch (error: any) {
    console.error('[Publish] unpublish failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to unpublish project' });
  }
});

export default router;
