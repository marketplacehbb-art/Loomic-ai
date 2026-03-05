import type { Project } from '../../lib/api';
import { FolderPlus, ArrowUpRight } from 'lucide-react';

interface RecentProjectsSectionProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onViewAll: () => void;
}

const GRADIENTS = [
  'from-purple-700 via-purple-800 to-slate-900',
  'from-violet-700 via-purple-800 to-slate-900',
  'from-fuchsia-700 via-purple-800 to-slate-900',
  'from-emerald-700 via-teal-800 to-slate-900',
  'from-rose-700 via-purple-800 to-slate-900',
  'from-indigo-700 via-violet-800 to-slate-900',
];

const gradientForProject = (project: Project): string => {
  const source = (project.name || project.id || 'project').toLowerCase();
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 2_147_483_647;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
};

const formatLastEdited = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.round(diffMs / day));
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const statusMeta = (status: Project['status']) => {
  if (status === 'published') {
    return {
      label: 'Live',
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    };
  }

  if (status === 'archived') {
    return {
      label: 'Archived',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    };
  }

  return {
    label: 'Draft',
    className: 'border-slate-600 bg-slate-800 text-slate-300',
  };
};

export default function RecentProjectsSection({
  projects,
  onCreateProject,
  onOpenProject,
  onViewAll,
}: RecentProjectsSectionProps) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Recent Projects</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-medium text-slate-400 transition-colors hover:text-purple-300"
        >
          View all {'->'}
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center">
          <FolderPlus className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <p className="text-lg font-semibold text-white">No projects yet</p>
          <p className="mt-1 text-sm text-slate-400">Create your first project to get started</p>
          <button
            onClick={onCreateProject}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition-all hover:bg-purple-500"
          >
            New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const meta = statusMeta(project.status);
            return (
              <article
                key={project.id}
                className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/40"
              >
                <div className={`relative h-28 bg-gradient-to-br ${gradientForProject(project)} p-4`}>
                  <span className={`absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="relative p-4">
                  <p className="line-clamp-1 pr-20 text-base font-semibold text-white">{project.name || 'Untitled Project'}</p>
                  <p className="mt-1 text-xs text-slate-400">Last edited {formatLastEdited(project.updated_at)}</p>
                  <button
                    onClick={() => onOpenProject(project.id)}
                    className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-200 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    Open <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
