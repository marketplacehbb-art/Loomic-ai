import React, { useEffect, useMemo, useState } from 'react';
import { api, type GitHubSyncStatusResponse } from '../lib/api';

interface GitHubSyncProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  status: GitHubSyncStatusResponse | null;
  loading?: boolean;
  onRefresh: () => Promise<void> | void;
}

const parseRepoNameFromUrl = (repoUrl?: string): string => {
  const raw = String(repoUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    return parts[1];
  } catch {
    return '';
  }
};

const GitHubSync: React.FC<GitHubSyncProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  status,
  loading = false,
  onRefresh,
}) => {
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState('');
  const [createNew, setCreateNew] = useState(true);
  const [commitMessage, setCommitMessage] = useState('Sync from AI Builder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setToken('');
    void Promise.resolve(onRefresh());
  }, [open, onRefresh, projectId]);

  useEffect(() => {
    if (!open) return;
    if (!repoName.trim() && status?.repoUrl) {
      const inferred = parseRepoNameFromUrl(status.repoUrl);
      if (inferred) {
        setRepoName(inferred);
      }
    }
  }, [open, repoName, status?.repoUrl]);

  const canPush = useMemo(() => {
    return Boolean(projectId) && Boolean(repoName.trim()) && !busy && !loading;
  }, [busy, loading, projectId, repoName]);

  if (!open) return null;

  const statusConnected = Boolean(status?.connected);
  const resolvedLastSync = typeof status?.lastSync === 'string' ? status.lastSync : '';
  const resolvedRepoUrl = typeof status?.repoUrl === 'string' ? status.repoUrl : '';

  const handlePush = async () => {
    if (!projectId) return;
    if (!repoName.trim()) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!statusConnected) {
        if (!token.trim()) {
          throw new Error('Enter a GitHub Personal Access Token first.');
        }
        const connectResult = await api.git.connect(token.trim(), projectId);
        if (!connectResult.connected) {
          throw new Error(connectResult.error || 'GitHub token connection failed.');
        }
        setNotice(`Connected as ${connectResult.username || 'GitHub user'}.`);
      }

      const pushResult = await api.git.pushToGitHub({
        projectId,
        repoName: repoName.trim(),
        createNew,
        commitMessage: commitMessage.trim() || undefined,
      });

      if (!pushResult.success) {
        throw new Error(pushResult.error || 'GitHub push failed.');
      }

      setToken('');
      setNotice('Push to GitHub completed.');
      await Promise.resolve(onRefresh());
    } catch (pushError: any) {
      setError(pushError?.message || 'GitHub sync failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#12161f] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">GitHub Sync</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{projectName || 'Current project'}</h3>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-white/20 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-400">Connection</p>
          <p className={`mt-1 text-sm font-semibold ${statusConnected ? 'text-emerald-300' : 'text-amber-300'}`}>
            {statusConnected ? `Connected${status?.username ? ` as ${status.username}` : ''}` : 'Not connected'}
          </p>
          {statusConnected && resolvedLastSync && (
            <p className="mt-1 text-xs text-slate-400">
              Last sync: {new Date(resolvedLastSync).toLocaleString()}
            </p>
          )}
          {resolvedRepoUrl && (
            <a
              href={resolvedRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-xs font-semibold text-blue-300 underline"
            >
              {resolvedRepoUrl}
            </a>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              GitHub Personal Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ghp_..."
              className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-200 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Repository Name</label>
            <input
              value={repoName}
              onChange={(event) => setRepoName(event.target.value)}
              placeholder="my-pizza-site"
              className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-200 outline-none"
            />
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={createNew}
              onChange={(event) => setCreateNew(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/30"
            />
            {createNew ? 'Create new repo' : 'Push to existing'}
          </label>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Commit Message</label>
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Sync from AI Builder"
              className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-200 outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={() => void Promise.resolve(onRefresh())}
            disabled={busy || loading || !projectId}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            onClick={() => void handlePush()}
            disabled={!canPush}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? 'Pushing...' : 'Push to GitHub'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitHubSync;
