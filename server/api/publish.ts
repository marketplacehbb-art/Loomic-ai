import { Request, Response, Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

type PublishStatus = 'draft' | 'publishing' | 'published' | 'failed';
type PublishAccess = 'public' | 'unlisted' | 'private';
type PersistMode = 'db' | 'memory';

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
      mode,
      updatedAt: null,
    };
  }

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
