import React from 'react';
import { api, Project } from '../lib/api';

type SortOrder = 'newest' | 'oldest' | 'az';

const ITEMS_PER_PAGE = 12;

interface UseDashboardDataArgs {
  userId: string | null;
}

export function useDashboardData({ userId }: UseDashboardDataArgs) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchInput, setSearchInput] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('newest');
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [totalCount, setTotalCount] = React.useState(0);
  const [publishedCount, setPublishedCount] = React.useState(0);
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);
  const fetchInFlightRef = React.useRef(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const normalizedSearch = searchQuery.toLowerCase();

  const filteredProjects = React.useMemo(() => {
    const next = projects.filter((project) => {
      if (!normalizedSearch) return true;
      return (project.name || 'Untitled').toLowerCase().includes(normalizedSearch) ||
        (project.prompt || '').toLowerCase().includes(normalizedSearch);
    });

    next.sort((a, b) => {
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

    return next;
  }, [projects, normalizedSearch, sortOrder]);

  const fetchProjects = React.useCallback(async (pageToLoad: number) => {
    if (fetchInFlightRef.current) return;
    if (!userId) return;

    try {
      fetchInFlightRef.current = true;
      setLoading(true);

      const projectRequest = api.getProjects(pageToLoad, ITEMS_PER_PAGE);
      const statsRequest = pageToLoad === 1 ? api.getProjectStats() : Promise.resolve(null);
      const [{ data, count }, stats] = await Promise.all([projectRequest, statsRequest]);

      if (pageToLoad === 1) {
        setProjects(data);
      } else {
        setProjects((prev) => [...prev, ...data]);
      }

      setTotalCount(count || 0);
      if (stats) {
        setPublishedCount(stats.publishedCount || 0);
      }
      setHasMore(data.length === ITEMS_PER_PAGE);
      setPage(pageToLoad);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  const refreshPublishedCount = React.useCallback(async () => {
    try {
      const stats = await api.getProjectStats();
      setPublishedCount(stats.publishedCount || 0);
    } catch (error) {
      console.error('Error refreshing published count:', error);
    }
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    setProjects([]);
    setPage(1);
    setHasMore(true);
    setActiveProjectId(null);
    setSearchInput('');
    setSearchQuery('');
    void fetchProjects(1);
  }, [userId, fetchProjects]);

  React.useEffect(() => {
    if (!activeProjectId && filteredProjects.length > 0) {
      setActiveProjectId(filteredProjects[0].id);
      return;
    }
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(filteredProjects[0]?.id || null);
    }
  }, [activeProjectId, filteredProjects, projects]);

  React.useEffect(() => {
    if (!normalizedSearch) return;
    if (!hasMore) return;
    if (loading || fetchInFlightRef.current) return;

    void fetchProjects(page + 1);
  }, [normalizedSearch, hasMore, loading, fetchProjects, page]);

  const loadMore = React.useCallback(() => {
    if (!loading && hasMore && !fetchInFlightRef.current) {
      void fetchProjects(page + 1);
    }
  }, [loading, hasMore, fetchProjects, page]);

  const isInitialLoading = loading && projects.length === 0;
  const isLoadingMore = loading && projects.length > 0;

  const activeProject = React.useMemo(
    () =>
      filteredProjects.find((project) => project.id === activeProjectId) ||
      projects.find((project) => project.id === activeProjectId) ||
      null,
    [filteredProjects, projects, activeProjectId]
  );

  return {
    projects,
    setProjects,
    loading,
    searchInput,
    setSearchInput,
    searchQuery,
    sortOrder,
    setSortOrder,
    page,
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
  };
}
