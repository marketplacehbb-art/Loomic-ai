import { randomUUID } from 'crypto';

export interface ProjectSnapshot {
  id: string;
  projectId?: string;
  createdAt: string;
  fileCount: number;
  fileHashes: Record<string, string>;
  files?: Record<string, string>;
  /** Descriptive label for the operation (Enterprise Feature 6) */
  label?: string;
  /** Operation metadata (Enterprise Feature 6) */
  metadata?: Record<string, any>;
}

export interface SnapshotWriteResult {
  current: ProjectSnapshot;
  previous: ProjectSnapshot | null;
}

class InMemorySnapshotStore {
  private readonly maxSnapshotsPerProject = 20;
  private readonly byProject = new Map<string, ProjectSnapshot[]>();

  write(
    projectId: string | undefined,
    fileHashes: Record<string, string>,
    files?: Record<string, string>,
    label?: string,
    metadata?: Record<string, any>
  ): SnapshotWriteResult {
    const snapshot: ProjectSnapshot = {
      id: randomUUID(),
      projectId,
      createdAt: new Date().toISOString(),
      fileCount: Object.keys(fileHashes).length,
      fileHashes,
      files,
      label,
      metadata,
    };

    if (!projectId || projectId.trim().length === 0) {
      return {
        current: snapshot,
        previous: null,
      };
    }

    const key = projectId.trim();
    const existing = this.byProject.get(key) || [];
    const previous = existing.length > 0 ? existing[existing.length - 1] : null;

    const nextList = [...existing, snapshot].slice(-this.maxSnapshotsPerProject);
    this.byProject.set(key, nextList);

    return {
      current: snapshot,
      previous,
    };
  }

  getHistory(projectId: string | undefined, limit = 10): ProjectSnapshot[] {
    if (!projectId || projectId.trim().length === 0) return [];
    const key = projectId.trim();
    const snapshots = this.byProject.get(key) || [];
    return snapshots.slice(-Math.max(1, limit));
  }

  getLatest(projectId: string | undefined): ProjectSnapshot | null {
    if (!projectId || projectId.trim().length === 0) return null;
    const key = projectId.trim();
    const snapshots = this.byProject.get(key) || [];
    if (snapshots.length === 0) return null;
    return snapshots[snapshots.length - 1];
  }

  getById(projectId: string | undefined, snapshotId: string): ProjectSnapshot | null {
    if (!projectId || projectId.trim().length === 0 || !snapshotId) return null;
    const key = projectId.trim();
    const snapshots = this.byProject.get(key) || [];
    return snapshots.find((snapshot) => snapshot.id === snapshotId) || null;
  }
}

export const projectSnapshotStore = new InMemorySnapshotStore();
