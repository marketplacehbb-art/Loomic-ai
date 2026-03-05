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
  fallbackContext?: FallbackTemplateContext;
}

export interface FallbackTemplateContext {
  productName?: string;
  industry?: string;
  colorScheme?: string;
  intent?: string;
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

function toSafeComponentName(path: string): string {
  const raw = path.split('/').pop()?.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Component';
  const sanitized = raw.replace(/[^a-zA-Z0-9_]/g, '');
  if (!sanitized) return 'GeneratedComponent';
  if (!/^[A-Za-z_]/.test(sanitized)) return `Generated${sanitized}`;
  return sanitized;
}

function toReadableTitle(path: string): string {
  const raw = path.split('/').pop()?.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Section';
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type PlaceholderThemeTokens = {
  shell: string;
  navBg: string;
  navBorder: string;
  navText: string;
  navLink: string;
  surface: string;
  surfaceBorder: string;
  heading: string;
  body: string;
  footerBg: string;
  footerBorder: string;
  footerHeading: string;
  footerBody: string;
};

function toSafeBrandName(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Northstar Studio';
  const safe = trimmed.replace(/[^a-zA-Z0-9&\- ]/g, '').trim();
  return safe || 'Northstar Studio';
}

function summarizeIntent(value: string | undefined): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Launch-ready layout with responsive structure, strong hierarchy, and conversion-focused content.';
  }
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137).trimEnd()}...`;
}

function normalizeColorScheme(value: string | undefined): 'dark' | 'light' | 'colorful' {
  const lower = String(value || '').toLowerCase();
  if (/\blight|white|clean|minimal\b/.test(lower)) return 'light';
  if (/\bcolorful|vibrant|bold\b/.test(lower)) return 'colorful';
  return 'dark';
}

function getThemeTokens(colorScheme: 'dark' | 'light' | 'colorful'): PlaceholderThemeTokens {
  if (colorScheme === 'light') {
    return {
      shell: 'bg-white text-slate-900',
      navBg: 'bg-white/90',
      navBorder: 'border-slate-200',
      navText: 'text-slate-900',
      navLink: 'text-slate-600 hover:text-slate-900',
      surface: 'bg-white',
      surfaceBorder: 'border-slate-200',
      heading: 'text-slate-900',
      body: 'text-slate-600',
      footerBg: 'bg-slate-50',
      footerBorder: 'border-slate-200',
      footerHeading: 'text-slate-900',
      footerBody: 'text-slate-600',
    };
  }
  if (colorScheme === 'colorful') {
    return {
      shell: 'bg-gradient-to-br from-slate-950 via-purple-950 to-fuchsia-950 text-white',
      navBg: 'bg-slate-950/85',
      navBorder: 'border-purple-500/40',
      navText: 'text-white',
      navLink: 'text-purple-200 hover:text-white',
      surface: 'bg-slate-900/70',
      surfaceBorder: 'border-purple-500/40',
      heading: 'text-white',
      body: 'text-purple-100/80',
      footerBg: 'bg-slate-950',
      footerBorder: 'border-purple-500/30',
      footerHeading: 'text-white',
      footerBody: 'text-purple-100/70',
    };
  }
  return {
    shell: 'bg-slate-950 text-slate-100',
    navBg: 'bg-slate-950/90',
    navBorder: 'border-slate-700',
    navText: 'text-slate-100',
    navLink: 'text-slate-300 hover:text-white',
    surface: 'bg-slate-900/70',
    surfaceBorder: 'border-slate-700',
    heading: 'text-white',
    body: 'text-slate-300',
    footerBg: 'bg-slate-950',
    footerBorder: 'border-slate-700',
    footerHeading: 'text-white',
    footerBody: 'text-slate-400',
  };
}

function inferPlaceholder(path: string, context?: FallbackTemplateContext): string {
  if (path.endsWith('.tsx')) {
    const componentName = toSafeComponentName(path);
    const sectionTitle = toReadableTitle(path);
    const lower = path.toLowerCase();
    const brandName = toSafeBrandName(context?.productName);
    const intentSummary = summarizeIntent(context?.intent);
    const industryLabel = String(context?.industry || 'business').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    const theme = getThemeTokens(normalizeColorScheme(context?.colorScheme));

    if (lower.includes('footer')) {
      return `export default function ${componentName}() {
  return (
    <footer className="w-full border-t ${theme.footerBorder} ${theme.footerBg} px-6 py-10 ${theme.footerBody}">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold ${theme.footerHeading}">${brandName}</p>
        <p className="mt-2 text-sm ${theme.footerBody}">Built for ${industryLabel} teams with fast loading and conversion-first UX.</p>
      </div>
    </footer>
  );
}
`;
    }

    if (lower.includes('navbar') || lower.includes('/nav')) {
      return `export default function ${componentName}() {
  return (
    <header className="w-full border-b ${theme.navBorder} ${theme.navBg} px-6 py-4 ${theme.navText}">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-base font-semibold">${brandName}</span>
        <nav className="hidden md:flex items-center gap-6 text-sm ${theme.navLink}">
          <a href="#features" className="transition-colors">Features</a>
          <a href="#pricing" className="transition-colors">Pricing</a>
          <a href="#contact" className="transition-colors">Contact</a>
        </nav>
      </div>
    </header>
  );
}
`;
    }

    return `export default function ${componentName}() {
  return (
    <section className="w-full ${theme.shell} px-6 py-16">
      <div className="mx-auto max-w-6xl rounded-2xl border ${theme.surfaceBorder} ${theme.surface} p-8 shadow-sm">
        <h2 className="text-2xl font-bold tracking-tight ${theme.heading}">${sectionTitle}</h2>
        <p className="mt-3 ${theme.body}">
          ${intentSummary}
        </p>
      </div>
    </section>
  );
}
`;
  }

  if (path.endsWith('.ts')) {
    return `export const GENERATED_MODULE_READY = true;\n`;
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

function ensureReferencedLocalFiles(files: Record<string, string>, fallbackContext?: FallbackTemplateContext): void {
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
      files[missingPath] = inferPlaceholder(missingPath, fallbackContext);
    }
  }
}

export function hydrateMissingLocalImports(
  files: Record<string, string>,
  fallbackContext?: FallbackTemplateContext
): { files: Record<string, string>; addedPaths: string[] } {
  const snapshot = new Set(Object.keys(files));
  ensureReferencedLocalFiles(files, fallbackContext);
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
      ? inferPlaceholder('src/App.tsx', input.fallbackContext)
      : input.generatedCode;
  }

  input.plannedFiles.forEach((path) => {
    const normalized = normalizePath(path);
    if (!normalized || normalized.endsWith('/')) return;
    if (!(normalized in assembled)) {
      assembled[normalized] = inferPlaceholder(normalized, input.fallbackContext);
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

  ensureReferencedLocalFiles(assembled, input.fallbackContext);

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
