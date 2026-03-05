import React, { useEffect, useMemo, useState } from 'react';

interface SupabaseConnectProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  connected: boolean;
  projectUrl?: string | null;
  loading?: boolean;
  onConnect: (input: { projectUrl: string; anonKey: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

const SupabaseConnect: React.FC<SupabaseConnectProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  connected,
  projectUrl,
  loading = false,
  onConnect,
  onDisconnect,
}) => {
  const [localProjectUrl, setLocalProjectUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalProjectUrl(projectUrl || '');
    setAnonKey('');
    setError(null);
  }, [open, projectUrl]);

  const canSubmit = useMemo(() => {
    return Boolean(localProjectUrl.trim()) && Boolean(anonKey.trim()) && !busy && !loading && Boolean(projectId);
  }, [anonKey, busy, loading, localProjectUrl, projectId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-[#12131d]/95">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Supabase Connection</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {projectId ? `Project: ${projectName || 'Current project'}` : 'Load or create a project first.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-black/20">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</p>
            <p className={`mt-1 text-sm font-semibold ${connected ? 'text-emerald-500' : 'text-amber-500'}`}>
              {connected ? 'Connected ✓' : 'Not connected'}
            </p>
            {connected && projectUrl && (
              <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">{projectUrl}</p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Supabase Project URL</label>
              <input
                value={localProjectUrl}
                onChange={(event) => setLocalProjectUrl(event.target.value)}
                placeholder="https://your-project-ref.supabase.co"
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary/60 dark:border-white/10 dark:bg-black/30 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Supabase Anon Key</label>
              <input
                type="password"
                value={anonKey}
                onChange={(event) => setAnonKey(event.target.value)}
                placeholder="eyJhbGciOi..."
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary/60 dark:border-white/10 dark:bg-black/30 dark:text-slate-100"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 px-5 py-4 dark:border-white/10">
          {connected ? (
            <button
              onClick={async () => {
                if (!projectId || busy || loading) return;
                setBusy(true);
                setError(null);
                try {
                  await onDisconnect();
                } catch (disconnectError: any) {
                  setError(disconnectError?.message || 'Disconnect failed.');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || loading || !projectId}
              className="rounded-lg border border-rose-300/80 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
            >
              Disconnect
            </button>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">Connect to enable DB/Auth/API generation.</span>
          )}

          <button
            onClick={async () => {
              if (!canSubmit) return;
              setBusy(true);
              setError(null);
              try {
                await onConnect({
                  projectUrl: localProjectUrl.trim(),
                  anonKey: anonKey.trim(),
                });
                setAnonKey('');
              } catch (connectError: any) {
                setError(connectError?.message || 'Connect failed.');
              } finally {
                setBusy(false);
              }
            }}
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupabaseConnect;
