import { Project } from '../../lib/api';

interface RecentProjectsSectionProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
}

const CARD_GRADIENTS = [
  'from-indigo-700 via-violet-700 to-slate-900',
  'from-emerald-700 via-teal-700 to-slate-900',
  'from-amber-700 via-orange-700 to-slate-900',
  'from-blue-700 via-cyan-700 to-slate-900',
  'from-fuchsia-700 via-pink-700 to-slate-900',
  'from-rose-700 via-red-700 to-slate-900',
];

const statusStyles: Record<Project['status'], string> = {
  draft: 'border-slate-600 bg-slate-800/80 text-slate-200',
  published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  archived: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

const formatLastEdited = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function RecentProjectsSection({
  projects,
  onCreateProject,
  onOpenProject,
}: RecentProjectsSectionProps) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Recent Projects</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Open your latest work and continue where you left off.
          </p>
        </div>
        <button
          onClick={onCreateProject}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-border-dark dark:bg-card-dark dark:text-slate-200 dark:hover:bg-white/10"
        >
          <span className="material-symbols-rounded text-base">add</span>
          Create Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-border-dark dark:bg-card-dark">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5">
            <span className="material-symbols-rounded text-slate-500 dark:text-slate-400">grid_view</span>
          </div>
          <p className="text-xl font-semibold text-slate-900 dark:text-white">No projects yet — Start your first project</p>
          <button
            onClick={onCreateProject}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="material-symbols-rounded">add</span>
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, index) => (
            <article
              key={project.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-border-dark dark:bg-card-dark"
            >
              <div className={`relative h-28 bg-gradient-to-br ${CARD_GRADIENTS[index % CARD_GRADIENTS.length]} p-4`}>
                <span
                  className={`absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    statusStyles[project.status]
                  }`}
                >
                  {project.status}
                </span>
                <p className="line-clamp-2 max-w-[80%] text-sm font-semibold text-white">
                  {project.name || 'Untitled Project'}
                </p>
              </div>

              <div className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last edited: {formatLastEdited(project.updated_at)}
                </p>
                <button
                  onClick={() => onOpenProject(project.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-primary dark:hover:bg-primary/90"
                >
                  <span className="material-symbols-rounded text-base">open_in_new</span>
                  Open
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
