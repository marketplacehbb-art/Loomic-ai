import React from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { api, Project } from '../lib/api';
import { prepareForDeployment, openinStackBlitz } from '../lib/deploy-utils';
import { DockerGenerator } from '../utils/docker-generator';

type UiNotice = { type: 'error' | 'success'; message: string } | null;

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

interface UseDashboardActionsArgs {
  activeProject: Project | null;
  activeProjectId: string | null;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  refreshPublishedCount: () => Promise<void>;
  setUiNotice: React.Dispatch<React.SetStateAction<UiNotice>>;
}

export function useDashboardActions({
  activeProject,
  activeProjectId,
  setActiveProjectId,
  setProjects,
  refreshPublishedCount,
  setUiNotice,
}: UseDashboardActionsArgs) {
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<string | null>(null);
  const [zipExportProjectId, setZipExportProjectId] = React.useState<string | null>(null);
  const [dockerExportProjectId, setDockerExportProjectId] = React.useState<string | null>(null);
  const [isDeploying, setIsDeploying] = React.useState(false);

  const handleDeleteClick = React.useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setProjectToDelete(id);
    setDeleteModalOpen(true);
  }, []);

  const cancelDelete = React.useCallback(() => {
    setDeleteModalOpen(false);
    setProjectToDelete(null);
  }, []);

  const confirmDelete = React.useCallback(async () => {
    if (!projectToDelete) return;

    try {
      await api.deleteProject(projectToDelete);
      setProjects((prev) => {
        const next = prev.filter((project) => project.id !== projectToDelete);
        if (activeProjectId === projectToDelete) {
          setActiveProjectId(next[0]?.id || null);
        }
        return next;
      });
      cancelDelete();
      await refreshPublishedCount();
    } catch (error) {
      console.error('Error deleting project:', error);
      setUiNotice({ type: 'error', message: 'Projekt konnte nicht gelöscht werden.' });
    }
  }, [projectToDelete, setProjects, activeProjectId, setActiveProjectId, cancelDelete, refreshPublishedCount, setUiNotice]);

  const handleExportProjectZip = React.useCallback(async (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();
    if (zipExportProjectId) return;
    setActiveProjectId(project.id);

    const parsed = parseProjectFileMap(project);
    if (!parsed) {
      setUiNotice({ type: 'error', message: 'Projektdateien konnten nicht gelesen werden.' });
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
      setUiNotice({ type: 'error', message: 'ZIP-Export fehlgeschlagen.' });
    } finally {
      setZipExportProjectId(null);
    }
  }, [zipExportProjectId, setActiveProjectId, setUiNotice]);

  const handleExportProjectDocker = React.useCallback(async (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();
    if (dockerExportProjectId) return;
    setActiveProjectId(project.id);

    const parsed = parseProjectFileMap(project);
    if (!parsed) {
      setUiNotice({ type: 'error', message: 'Projektdateien konnten nicht gelesen werden.' });
      return;
    }

    setDockerExportProjectId(project.id);
    try {
      const preparedFiles = prepareForDeployment(parsed.files, parsed.dependencies);
      await DockerGenerator.generateDockerPackage(preparedFiles);
    } catch (error) {
      console.error('Project Docker export failed:', error);
      setUiNotice({ type: 'error', message: 'Docker-Export fehlgeschlagen.' });
    } finally {
      setDockerExportProjectId(null);
    }
  }, [dockerExportProjectId, setActiveProjectId, setUiNotice]);

  const handleSidebarDeploy = React.useCallback(async () => {
    if (!activeProject) return;
    if (isDeploying) return;

    setIsDeploying(true);
    try {
      const parsed = parseProjectFileMap(activeProject);
      if (!parsed) {
        setUiNotice({ type: 'error', message: 'Projektdateien konnten nicht gelesen werden.' });
        return;
      }

      try {
        const scan = await api.runSecurityScan({
          projectId: activeProject.id,
          environment: 'test',
          files: parsed.files,
        });
        if (scan.success && scan.summary) {
          const critical = scan.summary.critical || 0;
          const high = scan.summary.high || 0;
          if (critical > 0 || high > 0) {
            setUiNotice({
              type: 'error',
              message: `Deploy blockiert: ${critical} critical / ${high} high Security-Findings. Siehe Security Dashboard.`,
            });
            return;
          }
        }
      } catch {
        setUiNotice({ type: 'error', message: 'Security-Precheck nicht verfuegbar. Deploy wird trotzdem gestartet.' });
      }

      openinStackBlitz(parsed.files, parsed.dependencies);
    } catch (error) {
      console.error('Sidebar deploy failed:', error);
      setUiNotice({ type: 'error', message: 'Deploy fehlgeschlagen.' });
    } finally {
      setIsDeploying(false);
    }
  }, [activeProject, isDeploying, setUiNotice]);

  return {
    deleteModalOpen,
    setDeleteModalOpen,
    projectToDelete,
    cancelDelete,
    confirmDelete,
    handleDeleteClick,
    zipExportProjectId,
    dockerExportProjectId,
    isDeploying,
    handleExportProjectZip,
    handleExportProjectDocker,
    handleSidebarDeploy,
  };
}
