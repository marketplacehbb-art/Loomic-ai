import React from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardActions } from '../hooks/useDashboardActions';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import RecentProjectsSection from '../components/dashboard/RecentProjectsSection';
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
    projects,
    setProjects,
    searchInput,
    setSearchInput,
    searchQuery,
    sortOrder,
    setSortOrder,
    hasMore,
    totalCount,
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

  const recentProjects = React.useMemo(
    () =>
      [...projects]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 6),
    [projects]
  );

  const handleViewAllProjects = React.useCallback(() => {
    document.getElementById('all-projects-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const showAllProjectsSection = filteredProjects.length > 0 || Boolean(searchQuery);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black font-display text-white">
      <Sidebar
        onDeploy={handleSidebarDeploy}
        deployDisabled={!activeProject}
        deployBusy={isDeploying}
        deployLabel={activeProject ? `Deploy: ${activeProject.name || 'Untitled'}` : 'Deploy'}
      />

      <main className="ml-64 flex-1 bg-black p-8">
        {uiNotice && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            uiNotice.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
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
            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="h-52 animate-pulse rounded-xl bg-slate-800" />
            </div>
          }
        >
          <MetricsWidget />
        </React.Suspense>

        <RecentProjectsSection
          projects={recentProjects}
          onCreateProject={() => navigate('/generator')}
          onOpenProject={(projectId) => {
            setActiveProjectId(projectId);
            navigate(`/generator?project_id=${projectId}`);
          }}
          onViewAll={handleViewAllProjects}
        />

        {showAllProjectsSection && (
          <section id="all-projects-section" className="scroll-mt-24">
            <div className="mb-4 mt-10 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">All Projects</h2>
              <p className="text-sm text-slate-400">
                {searchQuery ? `Results for \"${searchQuery}\"` : `${totalCount} total`}
              </p>
            </div>

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
          </section>
        )}

        {showAllProjectsSection && hasMore && !searchQuery && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-6 py-2.5 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800"
            >
              {isLoadingMore ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
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
        className="fixed bottom-6 right-6 z-[100] flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-300 shadow-2xl transition-transform hover:scale-110"
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
