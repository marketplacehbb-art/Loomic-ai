import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import {
  api,
  type Project,
  type SecurityFinding,
  type SecurityFindingCategory,
  type SecurityFindingSeverity,
  type SecurityScanSnapshot,
  type SupabaseIntegrationEnvironment,
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const SEVERITY_OPTIONS: Array<SecurityFindingSeverity | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];
const CATEGORY_OPTIONS: Array<SecurityFindingCategory | 'all'> = ['all', 'rls', 'auth', 'policy', 'edge', 'secrets'];

const severityTone: Record<SecurityFindingSeverity, string> = {
  critical: 'text-red-500',
  high: 'text-orange-500',
  medium: 'text-amber-500',
  low: 'text-emerald-500',
};

function parseProjectFiles(project: Project | null): Record<string, string> | undefined {
  if (!project?.code || typeof project.code !== 'string') return undefined;
  try {
    const parsed = JSON.parse(project.code);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [path, value]) => {
      if (typeof path === 'string' && typeof value === 'string') acc[path] = value;
      return acc;
    }, {});
  } catch {
    return undefined;
  }
}

export default function SecurityDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [environment, setEnvironment] = useState<SupabaseIntegrationEnvironment>('test');
  const [loading, setLoading] = useState(true);
  const [runningScan, setRunningScan] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SecurityFindingSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<SecurityFindingCategory | 'all'>('all');
  const [score, setScore] = useState<number | null>(null);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [history, setHistory] = useState<SecurityScanSnapshot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data } = await api.getProjects(1, 100);
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id);
        }
      } catch (error: any) {
        setNotice(error?.message || 'Projekte konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedProjectId) {
        setHistory([]);
        return;
      }
      try {
        const response = await api.getSecurityScanHistory(selectedProjectId);
        if (response.success) {
          setHistory(response.history || []);
        }
      } catch {
        setHistory([]);
      }
    };
    void loadHistory();
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      const severityOk = severityFilter === 'all' || finding.severity === severityFilter;
      const categoryOk = categoryFilter === 'all' || finding.category === categoryFilter;
      return severityOk && categoryOk;
    });
  }, [categoryFilter, findings, severityFilter]);

  const runScan = async () => {
    if (!selectedProject) {
      setNotice('Bitte zuerst ein Projekt waehlen.');
      return;
    }
    setRunningScan(true);
    setNotice(null);
    try {
      const files = parseProjectFiles(selectedProject);
      const response = await api.runSecurityScan({
        projectId: selectedProject.id,
        environment,
        files,
      });
      if (!response.success) {
        setNotice(response.error || 'Security-Scan fehlgeschlagen.');
        return;
      }
      setScore(response.score ?? null);
      setFindings(response.findings || []);
      const historyResponse = await api.getSecurityScanHistory(selectedProject.id);
      if (historyResponse.success) {
        setHistory(historyResponse.history || []);
      }
      if ((response.summary?.critical || 0) > 0 || (response.summary?.high || 0) > 0) {
        setNotice('Kritische/hohe Findings gefunden. Bitte vor Deploy beheben.');
      } else {
        setNotice('Scan abgeschlossen.');
      }
    } catch (error: any) {
      setNotice(error?.message || 'Security-Scan fehlgeschlagen.');
    } finally {
      setRunningScan(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Security Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Statische Konfigurations-Checks (RLS/Auth/Policies/Secrets). Kein Runtime-Traffic-Scanning.
            </p>
          </div>
          <button
            onClick={() => void runScan()}
            disabled={runningScan || !selectedProjectId}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {runningScan ? 'Scanning...' : 'Run Scan'}
          </button>
        </header>

        {notice && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
            {notice}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <p className="text-xs uppercase tracking-wide text-slate-500">Project</p>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            >
              {loading && <option value="">Loading...</option>}
              {!loading && projects.length === 0 && <option value="">No projects</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || 'Untitled'}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <p className="text-xs uppercase tracking-wide text-slate-500">Environment</p>
            <div className="mt-2 flex gap-2">
              {(['test', 'live'] as SupabaseIntegrationEnvironment[]).map((env) => (
                <button
                  key={env}
                  onClick={() => setEnvironment(env)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${environment === env ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'}`}
                >
                  {env.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <p className="text-xs uppercase tracking-wide text-slate-500">Score</p>
            <p className="mt-2 text-3xl font-bold">{score ?? '-'}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <p className="text-xs uppercase tracking-wide text-slate-500">Findings</p>
            <p className="mt-2 text-3xl font-bold">{findings.length}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <h2 className="text-sm font-semibold">Filters</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value as SecurityFindingSeverity | 'all')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    Severity: {option}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as SecurityFindingCategory | 'all')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    Category: {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
            <h2 className="text-sm font-semibold">Scan History</h2>
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine Scans.</p>
              ) : (
                history
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <div key={`${entry.timestamp}-${entry.score}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-white/10">
                      <p className="font-semibold">Score {entry.score}</p>
                      <p className="text-slate-500">{new Date(entry.timestamp).toLocaleString()}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card-dark">
          <h2 className="text-sm font-semibold">Findings</h2>
          <div className="mt-3 space-y-3">
            {filteredFindings.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Findings fuer den aktuellen Filter.</p>
            ) : (
              filteredFindings.map((finding, index) => (
                <div key={`${finding.resource}-${index}`} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{finding.resource}</p>
                    <span className={`text-xs font-bold uppercase ${severityTone[finding.severity]}`}>
                      {finding.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Category: {finding.category}</p>
                  <p className="mt-2 text-sm">{finding.evidence}</p>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Fix: {finding.fixSuggestion}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
