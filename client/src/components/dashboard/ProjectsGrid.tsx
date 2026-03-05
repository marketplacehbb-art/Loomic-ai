import React from 'react';
import type { Project } from '../../lib/api';

interface ProjectsGridProps {
  isInitialLoading: boolean;
  filteredProjects: Project[];
  searchQuery: string;
  activeProjectId: string | null;
  zipExportProjectId: string | null;
  dockerExportProjectId: string | null;
  emptyStateTitle: string;
  onCreateProject: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string, event: React.MouseEvent) => void;
  onExportZip: (project: Project, event: React.MouseEvent) => Promise<void>;
  onExportDocker: (project: Project, event: React.MouseEvent) => Promise<void>;
}

const statusBadgeClass = (status: Project['status']): string => {
  if (status === 'published') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'archived') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-slate-700 bg-slate-800 text-slate-300';
};

export default function ProjectsGrid({
  isInitialLoading,
  filteredProjects,
  searchQuery,
  activeProjectId,
  zipExportProjectId,
  dockerExportProjectId,
  emptyStateTitle,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onExportZip,
  onExportDocker,
}: ProjectsGridProps) {
  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {isInitialLoading ? (
        [1, 2, 3].map((index) => (
          <div key={index} className="h-[280px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
        ))
      ) : filteredProjects.length === 0 ? (
        searchQuery ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            <span className="material-symbols-rounded mb-2 block text-4xl opacity-50">search_off</span>
            <p>No projects found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800">
              <span className="material-symbols-rounded text-slate-400">inbox</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">{emptyStateTitle}</h3>
            <p className="mb-5 text-slate-400">Create your first project to start generating.</p>
            <button
              onClick={onCreateProject}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-purple-500"
            >
              <span className="material-symbols-rounded text-base">add</span>
              Create Project
            </button>
          </div>
        )
      ) : (
        filteredProjects.map((project) => (
          <div
            key={project.id}
            onClick={() => onOpenProject(project.id)}
            className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-slate-900 transition-all duration-200 hover:shadow-xl hover:shadow-black/40 ${
              activeProjectId === project.id
                ? 'border-purple-500/50 ring-1 ring-purple-500/40'
                : 'border-slate-800'
            }`}
          >
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800">
                  <span className="material-symbols-rounded text-purple-300">terminal</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(project.status)}`}>
                  {project.status}
                </span>
              </div>

              <h3 className="mb-4 line-clamp-1 text-lg font-semibold text-white transition-colors group-hover:text-purple-300">
                {project.name || 'Untitled'}
              </h3>

              <div className="space-y-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-rounded text-base">schedule</span>
                  {new Date(project.updated_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-rounded text-base">visibility</span>
                    {project.views} views
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-rounded text-base">code</span>
                    {project.template || 'React'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-2 p-4 pt-0">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProject(project.id);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 py-2.5 text-sm font-semibold text-purple-200 transition-colors hover:bg-purple-500/20"
              >
                <span className="material-symbols-rounded text-lg">edit</span>
                Edit
              </button>

              <button
                onClick={(event) => onDeleteProject(project.id, event)}
                className="group/btn flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
              >
                <span className="material-symbols-rounded text-lg group-hover/btn:text-red-200">delete</span>
                Delete
              </button>

              <button
                onClick={(event) => void onExportZip(project, event)}
                disabled={zipExportProjectId !== null}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={`material-symbols-rounded text-lg ${zipExportProjectId === project.id ? 'animate-spin' : ''}`}>
                  {zipExportProjectId === project.id ? 'sync' : 'download'}
                </span>
                ZIP
              </button>

              <button
                onClick={(event) => void onExportDocker(project, event)}
                disabled={dockerExportProjectId !== null}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={`material-symbols-rounded text-lg ${dockerExportProjectId === project.id ? 'animate-spin' : ''}`}>
                  {dockerExportProjectId === project.id ? 'sync' : 'docker'}
                </span>
                Docker
              </button>
            </div>
          </div>
        ))
      )}

      <div
        onClick={onCreateProject}
        className="group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 p-8 text-slate-500 transition-colors hover:border-purple-500/50 hover:text-purple-300"
      >
        <span className="material-symbols-rounded mb-3 text-4xl">add_circle</span>
        <p className="font-medium">Create New Project</p>
      </div>

      <div className="hidden rounded-2xl border-2 border-dashed border-slate-800 opacity-50 lg:block" />
    </section>
  );
}
