import React from 'react';
import { Project } from '../../lib/api';

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
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {isInitialLoading ? (
        [1, 2, 3].map((index) => (
          <div key={index} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-3xl h-[280px] animate-pulse"></div>
        ))
      ) : filteredProjects.length === 0 ? (
        searchQuery ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            <span className="material-symbols-rounded text-4xl mb-2 opacity-50">search_off</span>
            <p>No projects found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="col-span-full rounded-3xl border border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark p-10 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              <span className="material-symbols-rounded text-slate-400">inbox</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">{emptyStateTitle}</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-5">Create your first project to start generating.</p>
            <button
              onClick={onCreateProject}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-full font-semibold transition-colors"
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
            className={`group relative bg-white dark:bg-card-dark border rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 cursor-pointer ${
              activeProjectId === project.id
                ? 'border-primary/60 ring-2 ring-primary/30'
                : 'border-slate-200 dark:border-border-dark'
            }`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-rounded text-primary">terminal</span>
                </div>
                <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter border border-amber-200 dark:border-amber-500/20">
                  {project.status.toUpperCase()}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-4 line-clamp-1 group-hover:text-primary transition-colors italic">
                "{project.name || 'Untitled'}"
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span className="material-symbols-rounded text-base">schedule</span>
                  {new Date(project.updated_at).toLocaleDateString()}
                  <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                  v1.0
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
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
            <div className="p-4 pt-0 mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProject(project.id);
                }}
                className="bg-slate-100 dark:bg-[#25183d] hover:bg-slate-200 dark:hover:bg-[#322152] text-slate-900 dark:text-primary font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-rounded text-lg">edit</span>
                Edit
              </button>
              <button
                onClick={(event) => onDeleteProject(project.id, event)}
                className="bg-slate-100 dark:bg-[#2d1212] hover:bg-red-50 dark:hover:bg-[#401a1a] text-slate-600 dark:text-red-400 font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm group/btn"
              >
                <span className="material-symbols-rounded text-lg group-hover/btn:text-red-500">delete</span>
                Delete
              </button>
              <button
                onClick={(event) => void onExportZip(project, event)}
                disabled={zipExportProjectId !== null}
                className="bg-slate-100 dark:bg-[#0f2136] hover:bg-slate-200 dark:hover:bg-[#16304d] text-slate-700 dark:text-cyan-300 font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-rounded text-lg ${zipExportProjectId === project.id ? 'animate-spin' : ''}`}>
                  {zipExportProjectId === project.id ? 'sync' : 'download'}
                </span>
                ZIP
              </button>
              <button
                onClick={(event) => void onExportDocker(project, event)}
                disabled={dockerExportProjectId !== null}
                className="bg-slate-100 dark:bg-[#142025] hover:bg-slate-200 dark:hover:bg-[#1c2c33] text-slate-700 dark:text-blue-300 font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-rounded text-lg ${dockerExportProjectId === project.id ? 'animate-spin' : ''}`}>
                  {dockerExportProjectId === project.id ? 'sync' : 'docker'}
                </span>
                Docker
              </button>
            </div>
            <div className="absolute -inset-0.5 bg-primary/20 blur opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 -z-10"></div>
          </div>
        ))
      )}

      <div
        onClick={onCreateProject}
        className="border-2 border-dashed border-slate-200 dark:border-border-dark rounded-3xl flex flex-col items-center justify-center p-8 text-slate-400 min-h-[280px] hover:border-primary/50 transition-colors group cursor-pointer"
      >
        <span className="material-symbols-rounded text-4xl mb-3 group-hover:text-primary transition-colors">add_circle</span>
        <p className="font-medium">Create New Project</p>
      </div>

      <div className="hidden lg:block border-2 border-dashed border-slate-200 dark:border-border-dark rounded-3xl opacity-50"></div>
    </section>
  );
}

