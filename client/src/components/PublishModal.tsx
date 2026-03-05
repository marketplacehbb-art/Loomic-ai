import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectPublication, PublishAccess } from '../lib/api';
import DeployModal, { type DeployProgressStep } from './DeployModal';

interface PublishModalProps {
  open: boolean;
  projectName?: string;
  projectId?: string;
  publication: ProjectPublication | null;
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onPublish: (input: {
    slug: string;
    access: PublishAccess;
    siteTitle?: string;
    siteDescription?: string;
  }) => Promise<void>;
  onDeployVercel: () => Promise<{
    url: string;
    deploymentId: string;
    lastDeployedAt?: string | null;
  }>;
  onUnpublish: () => Promise<void>;
}

const statusTone: Record<string, string> = {
  draft: 'border-slate-500/40 bg-slate-500/15 text-slate-200',
  publishing: 'border-blue-400/35 bg-blue-500/15 text-blue-200',
  published: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200',
  failed: 'border-red-400/35 bg-red-500/15 text-red-200',
};

const PublishModal: React.FC<PublishModalProps> = ({
  open,
  projectName,
  projectId,
  publication,
  loading,
  submitting,
  onClose,
  onRefresh,
  onPublish,
  onDeployVercel,
  onUnpublish,
}) => {
  const [slug, setSlug] = useState('');
  const [access, setAccess] = useState<PublishAccess>('public');
  const [siteTitle, setSiteTitle] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState<DeployProgressStep>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploymentUrl, setDeploymentUrl] = useState<string>('');
  const [lastDeployAt, setLastDeployAt] = useState<string | null>(null);
  const buildingStepTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSlug(publication?.slug || '');
    setAccess(publication?.access || 'public');
    setSiteTitle(publication?.siteTitle || '');
    setSiteDescription(publication?.siteDescription || '');
    setDeploymentUrl(publication?.vercelUrl || '');
    setLastDeployAt(publication?.lastDeployedAt || null);
    setDeployStep(publication?.vercelUrl ? 'live' : 'idle');
    setDeployError(null);
  }, [open, publication]);

  useEffect(() => () => {
    if (buildingStepTimerRef.current) {
      window.clearTimeout(buildingStepTimerRef.current);
    }
  }, []);

  const normalizedSlug = useMemo(
    () =>
      String(slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
    [slug]
  );

  const publishUrl = useMemo(() => {
    if (publication?.publishedUrl) return publication.publishedUrl;
    if (!normalizedSlug) return '';
    return `https://${normalizedSlug}.loomic.app`;
  }, [normalizedSlug, publication?.publishedUrl]);

  if (!open) return null;

  const isPublished = publication?.status === 'published';
  const currentStatus = publication?.status || 'draft';
  const canSubmit = Boolean(projectId && normalizedSlug && !loading && !submitting && !deploying);

  const handleDeployVercel = async () => {
    if (!projectId || deploying || loading || submitting) return;

    setDeploying(true);
    setDeployError(null);
    setDeployStep('preparing');
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setDeployStep('uploading');

      buildingStepTimerRef.current = window.setTimeout(() => {
        setDeployStep((prev) => (prev === 'uploading' ? 'building' : prev));
      }, 900);

      const result = await onDeployVercel();
      if (buildingStepTimerRef.current) {
        window.clearTimeout(buildingStepTimerRef.current);
        buildingStepTimerRef.current = null;
      }

      setDeployStep('live');
      setDeploymentUrl(result.url);
      if (result.lastDeployedAt) {
        setLastDeployAt(result.lastDeployedAt);
      }
      await Promise.resolve(onRefresh());
    } catch (error: any) {
      if (buildingStepTimerRef.current) {
        window.clearTimeout(buildingStepTimerRef.current);
        buildingStepTimerRef.current = null;
      }
      setDeployStep('error');
      setDeployError(error?.message || 'Vercel deployment failed.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#12161f] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Publish</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{projectName || 'Current project'}</h3>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-white/20 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-slate-400">Status</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${statusTone[currentStatus] || statusTone.draft}`}>
                {currentStatus}
              </span>
              <span className="text-xs text-slate-500">Release #{publication?.releaseVersion || 0}</span>
            </div>
            {publication?.publishedAt && (
              <p className="mt-2 text-xs text-slate-500">Last publish: {new Date(publication.publishedAt).toLocaleString()}</p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-slate-400">URL</p>
            <p className="mt-2 truncate text-sm font-medium text-slate-200">{publishUrl || 'Set slug to generate URL'}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void navigator.clipboard?.writeText(publishUrl || '')}
                disabled={!publishUrl}
                className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy URL
              </button>
              <button
                onClick={() => window.open(publishUrl, '_blank', 'noopener,noreferrer')}
                disabled={!publication?.publishedUrl}
                className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <DeployModal
            projectId={projectId}
            busy={deploying}
            step={deployStep}
            deploymentUrl={deploymentUrl || publication?.vercelUrl || null}
            lastDeployAt={lastDeployAt || publication?.lastDeployedAt || null}
            error={deployError}
            onDeploy={() => void handleDeployVercel()}
          />

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Slug</label>
            <div className="mt-1 flex items-center rounded-xl border border-white/10 bg-black/20 px-3">
              <span className="text-xs text-slate-500">loomic.app/</span>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="my-project"
                className="h-10 w-full bg-transparent px-1 text-sm text-slate-200 outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Access</label>
              <select
                value={access}
                onChange={(event) => setAccess(event.target.value as PublishAccess)}
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-200 outline-none"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Site title</label>
              <input
                value={siteTitle}
                onChange={(event) => setSiteTitle(event.target.value)}
                placeholder={projectName || 'Project title'}
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-200 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Description</label>
            <textarea
              value={siteDescription}
              onChange={(event) => setSiteDescription(event.target.value)}
              rows={3}
              placeholder="Short description for your published site..."
              className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading || submitting}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              Refresh
            </button>
            {isPublished && (
              <button
                onClick={() => void onUnpublish()}
                disabled={submitting || loading || !projectId}
                className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-40"
              >
                Unpublish
              </button>
            )}
          </div>
          <button
            onClick={() =>
              void onPublish({
                slug: normalizedSlug,
                access,
                siteTitle: siteTitle || undefined,
                siteDescription: siteDescription || undefined,
              })
            }
            disabled={!canSubmit}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
          >
            {submitting ? 'Publishing...' : isPublished ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublishModal;
