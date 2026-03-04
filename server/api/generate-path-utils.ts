export const EDIT_MODE_READ_ONLY_FILES = new Set([
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'vite.config.ts',
  'vite.config.js',
  'eslint.config.js',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.app.json',
  'components.json',
  'index.html',
  'README.md',
]);

export function normalizeGeneratedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

export function normalizeGeneratedPathSafe(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return normalizeGeneratedPath(trimmed);
}

export function extractSourceIdFromSelector(selector: string): string | null {
  if (typeof selector !== 'string') return null;
  const trimmed = selector.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\[data-source-id=(?:"([^"]+)"|'([^']+)')\]$/);
  if (!match) return null;
  const sourceId = (match[1] || match[2] || '').trim();
  return sourceId || null;
}

export function resolveSourceFileFromSourceId(sourceId: string): string | null {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  parts.pop();
  parts.pop();
  const candidate = normalizeGeneratedPath(parts.join(':').trim());
  if (!candidate) return null;
  if (!/\.(tsx|ts|jsx|js)$/.test(candidate)) return null;
  return candidate;
}

export function isRuntimeUiSourcePath(path: string): boolean {
  const normalized = normalizeGeneratedPath(path);
  if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) return false;
  if (!normalized.startsWith('src/')) return false;
  if (/\.config\.(ts|js|mjs|cjs)$/.test(normalized)) return false;
  if (normalized.includes('/__tests__/') || normalized.includes('/tests/')) return false;
  return true;
}

export function isEditProtectedRootFile(path: string): boolean {
  const normalized = normalizeGeneratedPath(path);
  const protectedFiles = new Set([
    '.gitignore',
    'package.json',
    'src/main.tsx',
    'src/vite-env.d.ts',
    ...Array.from(EDIT_MODE_READ_ONLY_FILES),
  ]);
  return protectedFiles.has(normalized);
}
