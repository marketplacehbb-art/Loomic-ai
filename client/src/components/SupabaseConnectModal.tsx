import React, { useEffect, useMemo, useState } from 'react';
import {
  api,
  type SupabaseIntegrationEnvironment,
  type SupabaseIntegrationEnvStatus,
  type SupabaseIntegrationHealthResponse,
  type SupabaseIntegrationLastErrorResponse,
} from '../lib/api';

interface SupabaseConnectModalProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  status: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus> | null;
  loading?: boolean;
  onRefresh: () => void;
  onConnect: (input: { environment: SupabaseIntegrationEnvironment; projectRef?: string }) => Promise<void>;
  onDisconnect: (environment: SupabaseIntegrationEnvironment) => Promise<void>;
}

const ENV_LABELS: Record<SupabaseIntegrationEnvironment, string> = {
  test: 'Test',
  live: 'Live',
};

const defaultStatus: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus> = {
  test: { environment: 'test', connected: false, mode: 'memory' },
  live: { environment: 'live', connected: false, mode: 'memory' },
};

const SupabaseConnectModal: React.FC<SupabaseConnectModalProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  status,
  loading = false,
  onRefresh,
  onConnect,
  onDisconnect,
}) => {
  const [activeEnv, setActiveEnv] = useState<SupabaseIntegrationEnvironment>('test');
  const [projectRef, setProjectRef] = useState('');
  const [busyEnv, setBusyEnv] = useState<SupabaseIntegrationEnvironment | null>(null);
  const [healthData, setHealthData] = useState<SupabaseIntegrationHealthResponse | null>(null);
  const [lastErrorData, setLastErrorData] = useState<SupabaseIntegrationLastErrorResponse | null>(null);

  const resolvedStatus = status || defaultStatus;
  const envStatus = resolvedStatus[activeEnv] || defaultStatus[activeEnv];
  const isBusy = busyEnv !== null || loading;
  const isConnected = Boolean(envStatus?.connected);

  const connectedSummary = useMemo(() => {
    const testConnected = resolvedStatus.test?.connected;
    const liveConnected = resolvedStatus.live?.connected;
    if (testConnected && liveConnected) return 'Test + Live connected';
    if (liveConnected) return 'Live connected';
    if (testConnected) return 'Test connected';
    return 'Not connected';
  }, [resolvedStatus.live?.connected, resolvedStatus.test?.connected]);

  useEffect(() => {
    let mounted = true;
    const loadCloudHubData = async () => {
      if (!open || !projectId) {
        if (mounted) {
          setHealthData(null);
          setLastErrorData(null);
        }
        return;
      }

      try {
        const [health, lastError] = await Promise.all([
          api.getSupabaseIntegrationHealth(projectId, activeEnv),
          api.getSupabaseIntegrationLastError(projectId, activeEnv),
        ]);
        if (!mounted) return;
        setHealthData(health);
        setLastErrorData(lastError);
      } catch {
        if (!mounted) return;
        setHealthData(null);
        setLastErrorData(null);
      }
    };

    void loadCloudHubData();
    return () => {
      mounted = false;
    };
  }, [activeEnv, open, projectId, status]);

  if (!open) return null;

  const healthClass = healthData?.degraded ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[2px] px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-[#12131d]/95">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Supabase Integration</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {projectId ? `Project: ${projectName || 'Current project'}` : 'Load or create a project first to connect Supabase.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-black/20">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Current status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{connectedSummary}</p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/60 p-1 dark:border-white/10 dark:bg-black/30">
            {(['test', 'live'] as SupabaseIntegrationEnvironment[]).map((env) => {
              const active = activeEnv === env;
              return (
                <button
                  key={env}
                  onClick={() => setActiveEnv(env)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {ENV_LABELS[env]}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Environment</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{ENV_LABELS[activeEnv]}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">State</p>
                  <p className={`mt-1 font-semibold ${isConnected ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Project ref</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{envStatus.projectRef || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Connected at</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {envStatus.connectedAt ? new Date(envStatus.connectedAt).toLocaleString() : '-'}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                <p className="text-slate-500 dark:text-slate-400">Health</p>
                <p className={`mt-1 font-semibold ${healthClass}`}>
                  {healthData?.status || (isConnected ? 'connected' : 'disconnected')}
                </p>
                {healthData?.upstreamError && (
                  <p className="mt-1 text-[11px] text-amber-500">{healthData.upstreamError}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Optional Supabase Project Ref
              </label>
              <input
                value={projectRef}
                onChange={(event) => setProjectRef(event.target.value)}
                placeholder="pranokckppomoainajib"
                className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary/60 dark:border-white/10 dark:bg-black/30 dark:text-slate-100"
              />

              {lastErrorData?.lastError?.message && (
                <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <p className="font-semibold">Last integration error</p>
                  <p className="mt-1">{lastErrorData.lastError.message}</p>
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 px-5 py-4 dark:border-white/10">
          <button
            onClick={onRefresh}
            disabled={isBusy || !projectId}
            className="rounded-lg border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            Refresh
          </button>

          {isConnected ? (
            <button
              onClick={async () => {
                if (!projectId) return;
                setBusyEnv(activeEnv);
                try {
                  await onDisconnect(activeEnv);
                } finally {
                  setBusyEnv(null);
                }
              }}
              disabled={isBusy || !projectId}
              className="rounded-lg border border-rose-300/80 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
            >
              Disconnect {ENV_LABELS[activeEnv]}
            </button>
          ) : (
            <button
              onClick={async () => {
                if (!projectId) return;
                setBusyEnv(activeEnv);
                try {
                  await onConnect({
                    environment: activeEnv,
                    projectRef: projectRef.trim() || undefined,
                  });
                } finally {
                  setBusyEnv(null);
                }
              }}
              disabled={isBusy || !projectId}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              Connect {ENV_LABELS[activeEnv]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupabaseConnectModal;
