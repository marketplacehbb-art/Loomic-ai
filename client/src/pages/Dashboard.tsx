import React from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardActions } from '../hooks/useDashboardActions';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardStats from '../components/dashboard/DashboardStats';
import ProjectsGrid from '../components/dashboard/ProjectsGrid';
import DeleteProjectModal from '../components/dashboard/DeleteProjectModal';

const MetricsWidget = React.lazy(() => import('../components/MetricsWidget'));
const NO_PROJECTS_TITLE = 'No projects yet';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toggleTheme } = useTheme();
  const [uiNotice, setUiNotice] = React.useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const sortMenuRef = React.useRef<HTMLDivElement | null>(null);

  const {
    setProjects,
    searchInput,
    setSearchInput,
    searchQuery,
    sortOrder,
    setSortOrder,
    hasMore,
    totalCount,
    publishedCount,
    activeProjectId,
    setActiveProjectId,
    filteredProjects,
    isInitialLoading,
    isLoadingMore,
    activeProject,
    loadMore,
    refreshPublishedCount,
  } = useDashboardData({ userId: user?.id || null });

  const {
    deleteModalOpen,
    cancelDelete,
    confirmDelete,
    handleDeleteClick,
    zipExportProjectId,
    dockerExportProjectId,
    isDeploying,
    handleExportProjectZip,
    handleExportProjectDocker,
    handleSidebarDeploy,
  } = useDashboardActions({
    activeProject,
    activeProjectId,
    setActiveProjectId,
    setProjects,
    refreshPublishedCount,
    setUiNotice,
  });

  React.useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [uiNotice]);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

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

      <main className="flex-1 ml-64 p-8">
        {uiNotice && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            uiNotice.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
          }`}>
            {uiNotice.message}
          </div>
        )}

        <DashboardHeader
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          sortMenuOpen={sortMenuOpen}
          setSortMenuOpen={setSortMenuOpen}
          sortMenuRef={sortMenuRef}
          onCreateProject={() => navigate('/generator')}
        />

        <React.Suspense
          fallback={
            <div className="mb-8 rounded-2xl border border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark p-6">
              <div className="h-52 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5"></div>
            </div>
          }
        >
          <MetricsWidget />
        </React.Suspense>

        <DashboardStats
          isInitialLoading={isInitialLoading}
          searchQuery={searchQuery}
          filteredProjectCount={filteredProjects.length}
          totalCount={totalCount}
          publishedCount={publishedCount}
        />

        <ProjectsGrid
          isInitialLoading={isInitialLoading}
          filteredProjects={filteredProjects}
          searchQuery={searchQuery}
          activeProjectId={activeProjectId}
          zipExportProjectId={zipExportProjectId}
          dockerExportProjectId={dockerExportProjectId}
          emptyStateTitle={NO_PROJECTS_TITLE}
          onCreateProject={() => navigate('/generator')}
          onOpenProject={(projectId) => {
            setActiveProjectId(projectId);
            navigate(`/generator?project_id=${projectId}`);
          }}
          onDeleteProject={handleDeleteClick}
          onExportZip={handleExportProjectZip}
          onExportDocker={handleExportProjectDocker}
        />

        {hasMore && !searchQuery && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="bg-white dark:bg-card-dark hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-200 dark:border-border-dark px-6 py-2.5 rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {isLoadingMore ? (
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

      <button
        className="fixed bottom-6 right-6 w-12 h-12 bg-white dark:bg-card-dark rounded-full shadow-2xl flex items-center justify-center border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform z-[100]"
        onClick={toggleTheme}
      >
        <span className="material-symbols-rounded dark:hidden">dark_mode</span>
        <span className="material-symbols-rounded hidden dark:block">light_mode</span>
      </button>

      <DeleteProjectModal
        open={deleteModalOpen}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

