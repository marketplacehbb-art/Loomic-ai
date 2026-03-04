export type EditScope = 'small_fix' | 'style_tweak' | 'component_update' | 'refactor';

export interface RagLightContextInput {
  files: Record<string, string>;
  impactedFiles?: string[];
  allowedUpdatePaths?: string[];
  editScope?: EditScope;
  maxChars?: number;
}

export interface RagLightContextResult {
  contextFiles: Record<string, string>;
  selectedPaths: string[];
  truncatedPaths: string[];
  skippedPaths: string[];
  totalChars: number;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function clampMaxChars(input?: number): number {
  if (!Number.isFinite(input)) return 28000;
  return Math.max(6000, Math.min(120000, Number(input)));
}

function collectImports(source: string): string[] {
  const result = new Set<string>();
  if (!source || typeof source !== 'string') return [];

  const importRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRegex)) {
    const specifier = String(match[1] || '').trim();
    if (!specifier) continue;
    if (!(specifier.startsWith('./') || specifier.startsWith('../'))) continue;
    result.add(specifier);
  }
  return [...result];
}

function resolveRelativeImport(basePath: string, relativeImport: string): string | null {
  const base = normalizePath(basePath);
  const folderParts = base.split('/');
  folderParts.pop();

  const importParts = relativeImport.split('/');
  for (const part of importParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      folderParts.pop();
      continue;
    }
    folderParts.push(part);
  }

  const withoutExt = folderParts.join('/');
  if (!withoutExt) return null;
  return withoutExt;
}

function expandCandidateWithExtensions(candidate: string, allFiles: Set<string>): string[] {
  const normalized = normalizePath(candidate);
  const candidates = [
    normalized,
    `${normalized}.tsx`,
    `${normalized}.ts`,
    `${normalized}.jsx`,
    `${normalized}.js`,
    `${normalized}/index.tsx`,
    `${normalized}/index.ts`,
    `${normalized}/index.jsx`,
    `${normalized}/index.js`,
  ];
  return candidates.filter((path) => allFiles.has(path));
}

function scorePath(path: string, impactedSet: Set<string>, allowedSet: Set<string>, editScope: EditScope): number {
  const normalized = normalizePath(path);
  let score = 0;

  if (impactedSet.has(normalized)) score += 1000;
  if (allowedSet.has(normalized)) score += 700;
  if (normalized === 'src/App.tsx') score += 300;
  if (normalized === 'src/main.tsx') score += 250;
  if (normalized.startsWith('src/components/sections/')) score += 180;
  if (normalized.startsWith('src/components/')) score += 140;
  if (normalized.startsWith('src/pages/')) score += 130;
  if (normalized.startsWith('src/hooks/')) score += 110;
  if (normalized.startsWith('src/lib/')) score += 100;
  if (normalized.startsWith('src/contexts/')) score += 90;
  if (normalized.endsWith('.css')) score += 70;

  if (editScope === 'small_fix') {
    if (normalized.includes('/ui/')) score += 45;
    if (normalized.includes('/sections/')) score -= 20;
  }
  if (editScope === 'style_tweak') {
    if (normalized.endsWith('.css')) score += 120;
    if (normalized.includes('theme')) score += 60;
  }
  if (editScope === 'refactor') {
    if (normalized.startsWith('src/components/')) score += 40;
    if (normalized.startsWith('src/pages/')) score += 30;
  }

  return score;
}

export function buildRagLightContext(input: RagLightContextInput): RagLightContextResult {
  const files = input.files || {};
  const allPaths = Object.keys(files).map(normalizePath);
  const allPathSet = new Set(allPaths);
  const impactedSet = new Set((input.impactedFiles || []).map(normalizePath));
  const allowedSet = new Set((input.allowedUpdatePaths || []).map(normalizePath));
  const editScope: EditScope = input.editScope || 'component_update';
  const maxChars = clampMaxChars(input.maxChars);

  const selected = new Set<string>();
  const skippedPaths: string[] = [];
  const truncatedPaths: string[] = [];

  const alwaysKeep = ['src/App.tsx', 'src/main.tsx', 'src/index.css'];
  alwaysKeep.forEach((path) => {
    if (allPathSet.has(path)) selected.add(path);
  });

  impactedSet.forEach((path) => {
    if (allPathSet.has(path)) selected.add(path);
  });

  const expansionSeeds = [...selected];
  for (const seed of expansionSeeds) {
    const content = files[seed];
    if (typeof content !== 'string') continue;
    const imports = collectImports(content);
    imports.forEach((relativeImport) => {
      const candidate = resolveRelativeImport(seed, relativeImport);
      if (!candidate) return;
      expandCandidateWithExtensions(candidate, allPathSet).forEach((resolved) => selected.add(resolved));
    });
  }

  const ranked = allPaths
    .slice()
    .sort((a, b) => scorePath(b, impactedSet, allowedSet, editScope) - scorePath(a, impactedSet, allowedSet, editScope));

  ranked.forEach((path) => {
    if (selected.has(path)) return;
    if (allowedSet.size > 0 && !allowedSet.has(path)) return;
    if (!path.startsWith('src/')) return;
    if (!/\.(tsx|ts|jsx|js|css)$/.test(path)) return;
    selected.add(path);
  });

  const contextFiles: Record<string, string> = {};
  let totalChars = 0;

  const orderedSelected = [...selected].sort((a, b) =>
    scorePath(b, impactedSet, allowedSet, editScope) - scorePath(a, impactedSet, allowedSet, editScope)
  );

  orderedSelected.forEach((path) => {
    const content = files[path];
    if (typeof content !== 'string' || content.length === 0) return;
    const nextTotal = totalChars + content.length;
    if (nextTotal > maxChars) {
      skippedPaths.push(path);
      return;
    }
    contextFiles[path] = content;
    totalChars = nextTotal;
  });

  if (Object.keys(contextFiles).length === 0 && allPaths.length > 0) {
    const firstPath = ranked[0];
    const content = files[firstPath];
    if (typeof content === 'string' && content.length > 0) {
      contextFiles[firstPath] = content.slice(0, Math.min(content.length, maxChars));
      totalChars = contextFiles[firstPath].length;
      if (content.length > contextFiles[firstPath].length) truncatedPaths.push(firstPath);
    }
  }

  return {
    contextFiles,
    selectedPaths: Object.keys(contextFiles),
    truncatedPaths,
    skippedPaths,
    totalChars,
  };
}

