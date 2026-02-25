import { createHash } from 'crypto';

export interface SmartDiffResult {
  added: string[];
  removed: string[];
  updated: string[];
  unchanged: string[];
  totalBefore: number;
  totalAfter: number;
  changedCount: number;
  unchangedCount: number;
  changeRatio: number;
  structuralChange: boolean;
  contentOnlyChange: boolean;
  configChange: boolean;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function normalizeFileMap(files: Record<string, string> = {}): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(files).forEach(([path, content]) => {
    normalized[normalizePath(path)] = content;
  });
  return normalized;
}

export function hashContent(content: string): string {
  return createHash('sha1').update(content || '').digest('hex');
}

export function buildFileHashMap(files: Record<string, string> = {}): Record<string, string> {
  const normalized = normalizeFileMap(files);
  const hashes: Record<string, string> = {};
  Object.entries(normalized).forEach(([path, content]) => {
    hashes[path] = hashContent(content);
  });
  return hashes;
}

function isStructuralPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized === 'src/App.tsx' ||
    normalized.startsWith('src/pages/') ||
    normalized.startsWith('src/components/layout/') ||
    normalized.startsWith('src/routes/') ||
    normalized === 'src/main.tsx'
  );
}

function isConfigPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized === 'package.json' ||
    normalized === 'vite.config.ts' ||
    normalized === 'tsconfig.json' ||
    normalized === 'tsconfig.node.json' ||
    normalized === 'tailwind.config.ts' ||
    normalized === 'postcss.config.js'
  );
}

export function computeSmartDiff(
  beforeFiles: Record<string, string> = {},
  afterFiles: Record<string, string> = {}
): SmartDiffResult {
  const before = normalizeFileMap(beforeFiles);
  const after = normalizeFileMap(afterFiles);

  const beforePaths = Object.keys(before);
  const afterPaths = Object.keys(after);
  const allPaths = [...new Set([...beforePaths, ...afterPaths])].sort();

  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  let structuralChange = false;
  let configChange = false;

  for (const path of allPaths) {
    const beforeExists = Object.prototype.hasOwnProperty.call(before, path);
    const afterExists = Object.prototype.hasOwnProperty.call(after, path);

    if (!beforeExists && afterExists) {
      added.push(path);
      if (isStructuralPath(path)) structuralChange = true;
      if (isConfigPath(path)) configChange = true;
      continue;
    }
    if (beforeExists && !afterExists) {
      removed.push(path);
      if (isStructuralPath(path)) structuralChange = true;
      if (isConfigPath(path)) configChange = true;
      continue;
    }

    const beforeHash = hashContent(before[path]);
    const afterHash = hashContent(after[path]);
    if (beforeHash === afterHash) {
      unchanged.push(path);
    } else {
      updated.push(path);
      if (isStructuralPath(path)) structuralChange = true;
      if (isConfigPath(path)) configChange = true;
    }
  }

  const changedCount = added.length + removed.length + updated.length;
  const unchangedCount = unchanged.length;
  const changeRatio = allPaths.length > 0 ? changedCount / allPaths.length : 0;
  const contentOnlyChange = changedCount > 0 && !structuralChange && !configChange;

  return {
    added,
    removed,
    updated,
    unchanged,
    totalBefore: beforePaths.length,
    totalAfter: afterPaths.length,
    changedCount,
    unchangedCount,
    changeRatio,
    structuralChange,
    contentOnlyChange,
    configChange,
  };
}

