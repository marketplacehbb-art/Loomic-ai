import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Project } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import MetricsWidget from '../components/MetricsWidget';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { prepareForDeployment, openinStackBlitz } from '../lib/deploy-utils';
import { DockerGenerator } from '../utils/docker-generator';

const extractDependenciesFromFiles = (inputFiles: Record<string, string>): Record<string, string> => {
  const packageJsonRaw = inputFiles['package.json'];
  if (typeof packageJsonRaw !== 'string' || packageJsonRaw.trim().length === 0) return {};

  try {
    const parsed = JSON.parse(packageJsonRaw);
    if (!parsed || typeof parsed !== 'object') return {};
    const deps = (parsed as any).dependencies;
    if (!deps || typeof deps !== 'object') return {};

    const normalized: Record<string, string> = {};
    Object.entries(deps).forEach(([name, version]) => {
      if (typeof name !== 'string' || typeof version !== 'string') return;
      normalized[name] = version;
    });
    return normalized;
  } catch {
    return {};
  }
};

const parseProjectFileMap = (project: Project): { files: Record<string, string>; dependencies: Record<string, string> } | null => {
  if (!project?.code || typeof project.code !== 'string') return null;
  try {
    const parsed = JSON.parse(project.code);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const files = Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [path, content]) => {
      if (typeof path !== 'string' || typeof content !== 'string') return acc;
      acc[path] = content;
      return acc;
    }, {});
    if (Object.keys(files).length === 0) return null;
    return {
      files,
      dependencies: extractDependenciesFromFiles(files),
    };
  } catch {
    return null;
  }
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 12;
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [zipExportProjectId, setZipExportProjectId] = useState<string | null>(null);
  const [dockerExportProjectId, setDockerExportProjectId] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Filtered & Sorted Projects
  const filteredProjects = projects
    .filter(p => {
      if (!searchQuery) return true;
      return (p.name || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.prompt || '').toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      switch (sortOrder) {
        case 'newest':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'oldest':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case 'az':
          return (a.name || 'Untitled').localeCompare(b.name || 'Untitled');
        default:
          return 0;
      }
    });

  React.useEffect(() => {
    if (user) {
      setProjects([]);
      setPage(1);
      setHasMore(true);
      setActiveProjectId(null);
      fetchProjects(1);
    }
  }, [user]);

  React.useEffect(() => {
    if (!activeProjectId && filteredProjects.length > 0) {
      setActiveProjectId(filteredProjects[0].id);
      return;
    }
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(filteredProjects[0]?.id || null);
    }
  }, [activeProjectId, filteredProjects, projects]);

  const fetchProjects = async (pageToLoad: number) => {
    try {
      if (!user) return;
      setLoading(true);

      const { data, count } = await api.getProjects(pageToLoad, ITEMS_PER_PAGE);

      if (pageToLoad === 1) {
        setProjects(data);
      } else {
        setProjects(prev => [...prev, ...data]);
      }

      setTotalCount(count || 0);
      setHasMore(data.length === ITEMS_PER_PAGE); // Simple check, or check totalCount
      setPage(pageToLoad);

    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchProjects(page + 1);
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      await api.deleteProject(projectToDelete);
      setProjects(projects.filter(p => p.id !== projectToDelete));
      if (activeProjectId === projectToDelete) {
        const nextProject = projects.find((p) => p.id !== projectToDelete) || null;
        setActiveProjectId(nextProject?.id || null);
      }
      setDeleteModalOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const handleExportProjectZip = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (zipExportProjectId) return;
    setActiveProjectId(project.id);

    const parsed = parseProjectFileMap(project);
    if (!parsed) {
      alert('Projektdateien konnten nicht gelesen werden.');
      return;
    }

    setZipExportProjectId(project.id);
    try {
      const preparedFiles = prepareForDeployment(parsed.files, parsed.dependencies);
      const zip = new JSZip();
      Object.entries(preparedFiles).forEach(([path, content]) => {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        zip.file(cleanPath, content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const safeName = (project.name || 'project').replace(/[^\w-]+/g, '-');
      saveAs(content, `${safeName}.zip`);
    } catch (error) {
      console.error('Project ZIP export failed:', error);
      alert('ZIP-Export fehlgeschlagen.');
    } finally {
      setZipExportProjectId(null);
    }
  };

  const handleExportProjectDocker = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dockerExportProjectId) return;
    setActiveProjectId(project.id);

    const parsed = parseProjectFileMap(project);
    if (!parsed) {
      alert('Projektdateien konnten nicht gelesen werden.');
      return;
    }

    setDockerExportProjectId(project.id);
    try {
      const preparedFiles = prepareForDeployment(parsed.files, parsed.dependencies);
      await DockerGenerator.generateDockerPackage(preparedFiles);
    } catch (error) {
      console.error('Project Docker export failed:', error);
      alert('Docker-Export fehlgeschlagen.');
    } finally {
      setDockerExportProjectId(null);
    }
  };

  const activeProject = filteredProjects.find((project) => project.id === activeProjectId) || projects.find((project) => project.id === activeProjectId) || null;

  const handleSidebarDeploy = async () => {
    if (!activeProject) return;
    if (isDeploying) return;
    setIsDeploying(true);
    try {
      const parsed = parseProjectFileMap(activeProject);
      if (!parsed) {
        alert('Projektdateien konnten nicht gelesen werden.');
        return;
      }
      openinStackBlitz(parsed.files, parsed.dependencies);
    } catch (error) {
      console.error('Sidebar deploy failed:', error);
      alert('Deploy fehlgeschlagen.');
    } finally {
      setIsDeploying(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }



  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex font-display transition-colors duration-300">
      <style>{`
        .sidebar-active {
            background: linear-gradient(90deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0) 100%);
            border-left: 3px solid #a855f7;
        }
        .material-symbols-rounded {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>

      <Sidebar
        onDeploy={handleSidebarDeploy}
        deployDisabled={!activeProject}
        deployBusy={isDeploying}
        deployLabel={activeProject ? `Deploy: ${activeProject.name || 'Untitled'}` : 'Deploy'}
      />

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        {/* Dashboard View */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
              <input
                className="w-full bg-slate-100 dark:bg-card-dark border-none rounded-full py-2.5 pl-12 pr-4 focus:ring-2 focus:ring-primary/50 text-sm outline-none"
                placeholder="Search apps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Sort Dropdown / Toggle */}
            <div className="relative group/sort">
              <div className="flex items-center bg-slate-100 dark:bg-card-dark rounded-full px-4 py-2 text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors border border-transparent dark:border-border-dark">
                <span className="material-symbols-rounded text-lg mr-2">sort</span>
                <span className="font-medium mr-4">
                  {sortOrder === 'newest' ? 'Newest First' : sortOrder === 'oldest' ? 'Oldest First' : 'Name (A-Z)'}
                </span>
                <span className="material-symbols-rounded text-lg">expand_more</span>
              </div>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-slate-200 dark:border-border-dark overflow-hidden opacity-0 invisible group-hover/sort:opacity-100 group-hover/sort:visible transition-all z-10">
                <button onClick={() => setSortOrder('newest')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'newest' ? 'text-primary font-bold' : ''}`}>Newest First</button>
                <button onClick={() => setSortOrder('oldest')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'oldest' ? 'text-primary font-bold' : ''}`}>Oldest First</button>
                <button onClick={() => setSortOrder('az')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 ${sortOrder === 'az' ? 'text-primary font-bold' : ''}`}>Name (A-Z)</button>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/generator')}
            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="material-symbols-rounded">add</span>
            New Project
          </button>
        </header>

        {/* Metrics Widget */}
        <MetricsWidget />

        {/* Stats Section */}
        <section className="bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-3xl p-6 mb-10 flex items-center divide-x divide-slate-200 dark:divide-border-dark">
          <div className="flex-1 px-6 first:pl-0 last:pr-0">
            <div className="flex items-center justify-between mb-2">
              <span className="material-symbols-rounded text-primary">folder</span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">Total</span>
            </div>
            {/* Show Total Database Count if no search, otherwise show filtered count */}
            <div className="text-3xl font-bold mb-1">{loading ? '-' : (searchQuery ? filteredProjects.length : totalCount)}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Projects</p>
          </div>
          <div className="flex-1 px-6">
            <div className="flex items-center justify-between mb-2">
              <span className="material-symbols-rounded text-green-500">check_circle</span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">Live</span>
            </div>
            <div className="text-3xl font-bold mb-1">{loading ? '-' : projects.filter(p => p.is_public).length}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Published</p>
          </div>
        </section>

        {/* Project Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            // Loading Skeletons
            [1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-3xl h-[280px] animate-pulse"></div>
            ))
          ) : filteredProjects.length === 0 ? (
            // Empty State specific to search
            searchQuery ? (
              <div className="col-span-full py-12 text-center text-slate-500">
                <span className="material-symbols-rounded text-4xl mb-2 opacity-50">search_off</span>
                <p>No projects found matching "{searchQuery}"</p>
              </div>
            ) : (
              // Regular Empty State
              <></>
            )
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => {
                  setActiveProjectId(project.id);
                  navigate(`/generator?project_id=${project.id}`);
                }}
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
                    <span className={`bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter border border-amber-200 dark:border-amber-500/20`}>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProjectId(project.id);
                      navigate(`/generator?project_id=${project.id}`);
                    }}
                    className="bg-slate-100 dark:bg-[#25183d] hover:bg-slate-200 dark:hover:bg-[#322152] text-slate-900 dark:text-primary font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <span className="material-symbols-rounded text-lg">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(project.id, e)}
                    className="bg-slate-100 dark:bg-[#2d1212] hover:bg-red-50 dark:hover:bg-[#401a1a] text-slate-600 dark:text-red-400 font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm group/btn"
                  >
                    <span className="material-symbols-rounded text-lg group-hover/btn:text-red-500">delete</span>
                    Delete
                  </button>
                  <button
                    onClick={(e) => void handleExportProjectZip(project, e)}
                    disabled={zipExportProjectId !== null}
                    className="bg-slate-100 dark:bg-[#0f2136] hover:bg-slate-200 dark:hover:bg-[#16304d] text-slate-700 dark:text-cyan-300 font-bold py-2.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className={`material-symbols-rounded text-lg ${zipExportProjectId === project.id ? 'animate-spin' : ''}`}>
                      {zipExportProjectId === project.id ? 'sync' : 'download'}
                    </span>
                    ZIP
                  </button>
                  <button
                    onClick={(e) => void handleExportProjectDocker(project, e)}
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

          {/* New Project Placeholder */}
          <div
            onClick={() => navigate('/generator')}
            className="border-2 border-dashed border-slate-200 dark:border-border-dark rounded-3xl flex flex-col items-center justify-center p-8 text-slate-400 min-h-[280px] hover:border-primary/50 transition-colors group cursor-pointer"
          >
            <span className="material-symbols-rounded text-4xl mb-3 group-hover:text-primary transition-colors">add_circle</span>
            <p className="font-medium">Create New Project</p>
          </div>

          <div className="hidden lg:block border-2 border-dashed border-slate-200 dark:border-border-dark rounded-3xl opacity-50"></div>
        </section>

        {/* Pagination / Load More */}
        {hasMore && !searchQuery && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="bg-white dark:bg-card-dark hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-200 dark:border-border-dark px-6 py-2.5 rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded">expand_more</span>
                  Load More Projects
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* Dark Mode Toggle Float */}
      <button
        className="fixed bottom-6 right-6 w-12 h-12 bg-white dark:bg-card-dark rounded-full shadow-2xl flex items-center justify-center border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform z-[100]"
        onClick={toggleDarkMode}
      >
        <span className="material-symbols-rounded dark:hidden">dark_mode</span>
        <span className="material-symbols-rounded hidden dark:block">light_mode</span>
      </button>

      {/* Modern Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setDeleteModalOpen(false)}
          ></div>
          <div className="relative bg-white dark:bg-[#1e1e2e] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-white/10 transform transition-all scale-100 opacity-100">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-rounded text-3xl text-red-500">delete_forever</span>
            </div>

            <h3 className="text-2xl font-bold text-center mb-2 text-slate-900 dark:text-white">Delete Project?</h3>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
              Are you sure you want to delete this project? This action cannot be undone and all data will be lost.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 px-6 py-3 rounded-xl font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-6 py-3 rounded-xl font-semibold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
