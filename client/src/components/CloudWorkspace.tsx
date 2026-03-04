import React, { useMemo, useState } from 'react';
import type {
  CloudOverviewModule,
  CloudOverviewResponse,
  CloudState,
} from '../lib/api';

type CloudNavId =
  | 'overview'
  | 'database'
  | 'sqlEditor'
  | 'users'
  | 'storage'
  | 'edgeFunctions'
  | 'ai'
  | 'secrets'
  | 'logs'
  | 'customEmails';

interface CloudWorkspaceProps {
  projectId?: string;
  projectName?: string;
  cloudState: CloudState | null;
  cloudStateLoading: boolean;
  cloudOverview: CloudOverviewResponse | null;
  cloudOverviewLoading: boolean;
  onEnableCloud: (source?: string) => Promise<void>;
  onConnectExisting: () => void;
  onRefresh: () => void;
}

const NAV_ITEMS: Array<{ id: CloudNavId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'grid_view' },
  { id: 'database', label: 'Database', icon: 'database' },
  { id: 'sqlEditor', label: 'SQL editor', icon: 'terminal' },
  { id: 'users', label: 'Users', icon: 'group' },
  { id: 'storage', label: 'Storage', icon: 'folder' },
  { id: 'edgeFunctions', label: 'Edge functions', icon: 'code' },
  { id: 'ai', label: 'AI', icon: 'auto_awesome' },
  { id: 'secrets', label: 'Secrets', icon: 'key' },
  { id: 'logs', label: 'Logs', icon: 'list' },
  { id: 'customEmails', label: 'Custom emails', icon: 'mail' },
];

const moduleById = (modules: CloudOverviewModule[] | undefined, id: CloudNavId): CloudOverviewModule | null =>
  modules?.find((item) => item.id === id) || null;

const statText = (module: CloudOverviewModule | null): string => {
  if (!module || module.count == null || !module.countLabel) return '';
  return `${module.count} ${module.countLabel}`;
};

const openExternal = (url?: string | null) => {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const CloudWorkspace: React.FC<CloudWorkspaceProps> = ({
  projectId,
  projectName,
  cloudState,
  cloudStateLoading,
  cloudOverview,
  cloudOverviewLoading,
  onEnableCloud,
  onConnectExisting,
  onRefresh,
}) => {
  const [activeNav, setActiveNav] = useState<CloudNavId>('overview');
  const [enableBusy, setEnableBusy] = useState(false);

  const enabled = Boolean(cloudOverview?.cloud?.enabled || cloudState?.enabled);
  const modules = cloudOverview?.modules || [];
  const databaseModule = moduleById(modules, 'database');
  const usersModule = moduleById(modules, 'users');
  const storageModule = moduleById(modules, 'storage');
  const overviewModules = [databaseModule, usersModule, storageModule].filter(
    (module): module is CloudOverviewModule => Boolean(module)
  );

  const selectedModule = useMemo(() => moduleById(modules, activeNav), [activeNav, modules]);

  return (
    <div className="h-full w-full overflow-y-auto p-3 text-slate-100 sm:p-4">
        <div className="h-full min-h-[560px] rounded-2xl border border-[#2b3242] bg-[#131823]">
        {!enabled ? (
          <div className="flex h-full items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-[760px] rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-3xl font-bold text-white sm:text-4xl">Loomic Cloud</h2>
                <a
                  href="https://supabase.com/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-sm font-semibold text-slate-200 underline"
                >
                  Read more
                </a>
              </div>
              <p className="mt-3 max-w-2xl text-base text-slate-300 sm:text-lg sm:leading-relaxed">
                Complete backend and AI models out of the box, so you can focus on building your app.
              </p>

              <div className="mt-8 space-y-6">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <span className="material-icons-round text-[19px] text-slate-100">database</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white">Built-in backend</p>
                    <p className="text-base text-slate-300">Database, storage, authentication, and backend logic.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <span className="material-icons-round text-[19px] text-slate-100">bolt</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white">Add an LLM to your app</p>
                    <p className="text-base text-slate-300">Powerful AI models with zero setup.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <span className="material-icons-round text-[19px] text-slate-100">trending_up</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white">Free to start, pay as you scale</p>
                    <p className="text-base text-slate-300">Track usage in Settings and scale when needed.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  setEnableBusy(true);
                  try {
                    await onEnableCloud('cloud_workspace_cta');
                  } finally {
                    setEnableBusy(false);
                  }
                }}
                disabled={!projectId || cloudStateLoading || enableBusy}
                className="mt-8 h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enableBusy ? 'Enabling Cloud...' : 'Enable Cloud'}
              </button>

              <p className="mt-7 text-center text-base text-slate-300">
                Already have a Supabase project?
                <button onClick={onConnectExisting} className="ml-2 underline">
                  Connect it here
                </button>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[640px] flex-col lg:flex-row">
            <aside className="border-b border-[#242935] bg-[#12161f] p-4 lg:w-[272px] lg:border-b-0 lg:border-r">
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Cloud</div>
              <nav className="space-y-1.5">
                {NAV_ITEMS.map((item) => {
                  const active = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                        active
                          ? 'border border-blue-400/45 bg-blue-500/15 text-blue-200'
                          : 'text-slate-300 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <span className="material-icons-round text-[18px]">{item.icon}</span>
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-slate-400">{projectName || 'Current project'}</p>
                  <h3 className="text-3xl font-semibold text-white">
                    {activeNav === 'overview' ? 'Cloud Overview' : selectedModule?.label || 'Cloud module'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onRefresh}
                    disabled={cloudOverviewLoading || cloudStateLoading}
                    className="rounded-lg border border-[#303749] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={onConnectExisting}
                    className="rounded-lg border border-blue-400/40 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/30"
                  >
                    Connect Supabase
                  </button>
                </div>
              </div>

              {activeNav === 'overview' ? (
                <div className="space-y-4">
                  {overviewModules.length > 0 ? overviewModules.map((module, index) => (
                    <article key={`${module.id}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{module.label}</p>
                          <p className="mt-1 text-sm text-slate-300 sm:text-base">{module.description}</p>
                        </div>
                        {module.countLabel && (
                          <p className="pt-1 text-base font-medium text-slate-300 sm:text-lg">{statText(module)}</p>
                        )}
                      </div>
                      <div className="mt-5 rounded-xl border border-white/10 bg-black/15 p-6 text-center text-sm leading-relaxed text-slate-300 sm:text-base">
                        {module.emptyMessage || 'No data yet.'}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {module.id === 'users' && (
                          <button
                            onClick={() => openExternal(module.url)}
                            disabled={!module.url}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Auth settings
                          </button>
                        )}
                        {module.url && module.id !== 'users' && (
                          <button
                            onClick={() => openExternal(module.url)}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                          >
                            Open in Supabase
                          </button>
                        )}
                      </div>
                    </article>
                  )) : (
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-slate-300">
                      No overview modules available yet.
                    </article>
                  )}
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-slate-300">
                      Connection status:{' '}
                      <span className="font-semibold text-white">
                        {cloudOverview?.supabase?.connected ? `Connected (${cloudOverview?.supabase?.environment || '-'})` : 'Disconnected'}
                      </span>
                    </p>
                    {!cloudOverview?.supabase?.connected && (
                      <p className="mt-2 text-sm text-slate-400">
                        Connect Supabase to unlock data sync, auth management, storage, and edge function links.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold text-white">{selectedModule?.label || 'Module'}</p>
                      <p className="mt-1 text-base text-slate-300">{selectedModule?.description || 'Cloud module details'}</p>
                    </div>
                    {selectedModule?.countLabel && selectedModule.count != null && (
                      <p className="text-lg font-semibold text-slate-200">{statText(selectedModule)}</p>
                    )}
                  </div>
                  <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5 text-base text-slate-300">
                    {selectedModule?.emptyMessage || 'No records yet.'}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    {selectedModule?.url ? (
                      <button
                        onClick={() => openExternal(selectedModule.url)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                      >
                        Open {selectedModule.label}
                      </button>
                    ) : (
                      <button
                        onClick={onConnectExisting}
                        className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                      >
                        Connect to unlock module
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        </div>
    </div>
  );
};

export default CloudWorkspace;
