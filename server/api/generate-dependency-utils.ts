import { RUNTIME_DEP_VERSION_HINTS } from '../ai/runtime/dependency-registry.js';

function toPackageNameFromSpecifier(specifier: string): string {
  const normalized = String(specifier || '').trim();
  if (!normalized) return '';
  if (
    normalized.startsWith('.') ||
    normalized.startsWith('/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('node:')
  ) {
    return '';
  }
  if (normalized.startsWith('@')) {
    const parts = normalized.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : normalized;
  }
  return normalized.split('/')[0] || '';
}

export function collectProjectDependencies(
  files: Record<string, string>,
  fallbackDependencies: Record<string, string> = {}
): Record<string, string> {
  const merged: Record<string, string> = { ...(fallbackDependencies || {}) };

  const packageJsonRaw = files['package.json'];
  if (typeof packageJsonRaw === 'string' && packageJsonRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(packageJsonRaw);
      const dependencies = parsed?.dependencies;
      if (dependencies && typeof dependencies === 'object') {
        Object.entries(dependencies).forEach(([name, version]) => {
          if (typeof name === 'string' && typeof version === 'string' && name.trim()) {
            merged[name] = version;
          }
        });
      }
    } catch {
      // Ignore invalid package.json payloads in generated output.
    }
  }

  const importRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)\s*['"]\s*\)/g;

  Object.entries(files).forEach(([path, content]) => {
    if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(path)) return;
    if (typeof content !== 'string' || content.length === 0) return;

    for (const match of content.matchAll(importRegex)) {
      const packageName = toPackageNameFromSpecifier(match[1] || '');
      if (!packageName) continue;
      if (!merged[packageName]) {
        merged[packageName] = RUNTIME_DEP_VERSION_HINTS[packageName] || 'latest';
      }
    }
    for (const match of content.matchAll(dynamicImportRegex)) {
      const packageName = toPackageNameFromSpecifier(match[1] || '');
      if (!packageName) continue;
      if (!merged[packageName]) {
        merged[packageName] = RUNTIME_DEP_VERSION_HINTS[packageName] || 'latest';
      }
    }
  });

  if (!merged.react) merged.react = RUNTIME_DEP_VERSION_HINTS.react;
  if (!merged['react-dom']) merged['react-dom'] = RUNTIME_DEP_VERSION_HINTS['react-dom'];

  return merged;
}
