import type { TemplateFiles } from './template-base.js';

export interface GeneratedFileLike {
  path: string;
  content: string;
  type?: string;
}

export interface AssembleProjectInput {
  templateFiles: TemplateFiles;
  existingFiles?: Record<string, string>;
  plannedFiles: string[];
  generatedCode: string;
  generatedFiles?: Array<{ path: string; content: string }>;
  processedFiles?: GeneratedFileLike[];
  dependencies?: Record<string, string>;
}

function normalizePath(path: string): string {
  const raw = (path || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  const parts = raw.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(part);
  }

  return stack.join('/');
}

function normalizeGeneratedPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === 'App.tsx' || normalized === 'app.tsx') return 'src/App.tsx';
  if (/^[A-Za-z0-9_-]+\.(tsx|ts|jsx|js|css)$/.test(normalized) && !normalized.startsWith('src/')) {
    return `src/${normalized}`;
  }
  return normalized;
}

function isRuntimeModulePath(path: string): boolean {
  const normalized = normalizeGeneratedPath(path || '');
  return /\.(tsx|ts|jsx|js)$/.test(normalized);
}

function dirname(path: string): string {
  const normalized = normalizeGeneratedPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function joinPath(base: string, target: string): string {
  if (target.startsWith('/')) return normalizePath(target.slice(1));
  if (!base) return normalizePath(target);
  return normalizePath(`${base}/${target}`);
}

function looksLikeFullHtmlDocument(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const hasDoctype = /<!doctype\s+html/i.test(code);
  const hasHtmlTag = /<html[\s>]/i.test(code);
  const hasHeadTag = /<head[\s>]/i.test(code);
  const hasBodyTag = /<body[\s>]/i.test(code);
  return hasDoctype || (hasHtmlTag && (hasHeadTag || hasBodyTag));
}

function isInvalidHtmlForRuntimeModule(path: string, content: string): boolean {
  return isRuntimeModulePath(path) && looksLikeFullHtmlDocument(content);
}

function inferPlaceholder(path: string): string {
  if (path.endsWith('.tsx')) {
    const name = path.split('/').pop()?.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Component';
    return `export default function ${name.replace(/[^a-zA-Z0-9_]/g, '')}() {\n  return <div />;\n}\n`;
  }

  if (path.endsWith('.ts')) {
    return `export {};\n`;
  }

  if (path.endsWith('.css')) {
    return `/* ${path} */\n`;
  }

  if (path.endsWith('.json')) {
    return `{}\n`;
  }

  return '';
}

const IMPORT_PATTERNS = [
  /\bimport\s+[^'"\n]+?\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"\n]+?\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const RESOLVABLE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];

function stripQueryAndHash(specifier: string): string {
  return specifier.split('?')[0].split('#')[0];
}

function getRelativeSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const raw = (match[1] || '').trim();
      if (!raw) continue;
      if (!raw.startsWith('.') && !raw.startsWith('/')) continue;
      specifiers.add(stripQueryAndHash(raw));
    }
  }
  return [...specifiers];
}

function resolveFromAssembledPaths(candidate: string, files: Record<string, string>): string | null {
  const normalized = normalizePath(candidate);
  const alternatives = new Set<string>([normalized]);

  if (normalized.startsWith('src/')) {
    alternatives.add(normalized.slice(4));
  } else {
    alternatives.add(`src/${normalized}`);
  }

  for (const alt of alternatives) {
    if (files[alt] !== undefined) return alt;
  }

  const hasKnownExtension = /\.[a-z0-9]+$/i.test(normalized);
  if (!hasKnownExtension) {
    for (const alt of alternatives) {
      for (const extension of RESOLVABLE_EXTENSIONS) {
        const withExt = `${alt}${extension}`;
        if (files[withExt] !== undefined) return withExt;
      }
      for (const extension of RESOLVABLE_EXTENSIONS) {
        const asIndex = `${alt}/index${extension}`;
        if (files[asIndex] !== undefined) return asIndex;
      }
    }
  }

  return null;
}

function inferMissingImportPath(importerPath: string, specifier: string): string {
  const importerDir = dirname(importerPath);
  const baseCandidate = specifier.startsWith('/')
    ? normalizePath(specifier.slice(1))
    : joinPath(importerDir, specifier);

  if (/\.[a-z0-9]+$/i.test(baseCandidate)) {
    return normalizeGeneratedPath(baseCandidate);
  }

  const runtimeDefaultExt = importerPath.endsWith('.ts') ? '.ts' : '.tsx';
  if (baseCandidate.endsWith('/')) {
    return normalizeGeneratedPath(`${baseCandidate}index${runtimeDefaultExt}`);
  }
  return normalizeGeneratedPath(`${baseCandidate}${runtimeDefaultExt}`);
}

function ensureReferencedLocalFiles(files: Record<string, string>): void {
  const importerPaths = Object.keys(files).filter((path) => /\.(tsx|ts|jsx|js)$/.test(path));

  for (const importerPath of importerPaths) {
    const source = files[importerPath];
    if (typeof source !== 'string' || !source.trim()) continue;

    const relativeSpecifiers = getRelativeSpecifiers(source);
    for (const specifier of relativeSpecifiers) {
      if (resolveFromAssembledPaths(joinPath(dirname(importerPath), specifier), files)) {
        continue;
      }
      const missingPath = inferMissingImportPath(importerPath, specifier);
      if (!missingPath) continue;
      if (files[missingPath] !== undefined) continue;
      files[missingPath] = inferPlaceholder(missingPath);
    }
  }
}

export function hydrateMissingLocalImports(files: Record<string, string>): { files: Record<string, string>; addedPaths: string[] } {
  const snapshot = new Set(Object.keys(files));
  ensureReferencedLocalFiles(files);
  const addedPaths = Object.keys(files).filter((path) => !snapshot.has(path));
  return {
    files,
    addedPaths,
  };
}

function mergeDependenciesIntoPackageJson(
  packageJsonContent: string,
  extraDependencies: Record<string, string> = {}
): string {
  try {
    const parsed = JSON.parse(packageJsonContent || '{}');
    parsed.dependencies = parsed.dependencies || {};

    Object.entries(extraDependencies).forEach(([name, version]) => {
      if (!parsed.dependencies[name]) {
        parsed.dependencies[name] = version;
      }
    });

    return JSON.stringify(parsed, null, 2);
  } catch {
    return packageJsonContent;
  }
}

export function assembleProjectFiles(input: AssembleProjectInput): Record<string, string> {
  const assembled: Record<string, string> = {
    ...input.templateFiles,
  };

  Object.entries(input.existingFiles || {}).forEach(([path, content]) => {
    assembled[normalizePath(path)] = content;
  });

  const emittedFiles: GeneratedFileLike[] = [];
  if (input.generatedFiles && input.generatedFiles.length > 0) {
    input.generatedFiles.forEach((file) => emittedFiles.push({ path: file.path, content: file.content }));
  }
  if (input.processedFiles && input.processedFiles.length > 0) {
    input.processedFiles.forEach((file) => emittedFiles.push(file));
  }

  emittedFiles.forEach((file) => {
    const path = normalizeGeneratedPath(file.path);
    if (!path) return;
    if (isInvalidHtmlForRuntimeModule(path, file.content)) {
      return;
    }
    assembled[path] = file.content;
  });

  if (!assembled['src/App.tsx']) {
    assembled['src/App.tsx'] = isInvalidHtmlForRuntimeModule('src/App.tsx', input.generatedCode)
      ? inferPlaceholder('src/App.tsx')
      : input.generatedCode;
  }

  input.plannedFiles.forEach((path) => {
    const normalized = normalizePath(path);
    if (!normalized || normalized.endsWith('/')) return;
    if (!(normalized in assembled)) {
      assembled[normalized] = inferPlaceholder(normalized);
    }
  });

  assembled['src/main.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

  if (assembled['package.json']) {
    assembled['package.json'] = mergeDependenciesIntoPackageJson(assembled['package.json'], input.dependencies);
  }

  ensureReferencedLocalFiles(assembled);

  return assembled;
}

function inferFileType(path: string): string {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

export function toProcessedFiles(files: Record<string, string>): GeneratedFileLike[] {
  return Object.entries(files).map(([path, content]) => ({
    path,
    content,
    type: inferFileType(path),
  }));
}
