export interface FilePlanInput {
  prompt: string;
  currentFiles?: Record<string, string>;
  requiredFiles?: string[];
}

export interface FilePlan {
  create: string[];
  update: string[];
  rationale: string;
}

const KEYWORD_FILE_RULES: Array<{ keywords: string[]; files: string[]; rationale: string }> = [
  {
    keywords: ['dashboard', 'analytics', 'admin'],
    files: ['src/pages/Dashboard.tsx', 'src/components/layout/Sidebar.tsx', 'src/components/layout/Header.tsx'],
    rationale: 'Dashboard layout with reusable shell components.',
  },
  {
    keywords: ['auth', 'login', 'register', 'signup'],
    files: ['src/pages/Login.tsx', 'src/pages/Register.tsx', 'src/lib/auth.ts'],
    rationale: 'Authentication screens and client auth helper.',
  },
  {
    keywords: ['settings', 'preferences', 'profile'],
    files: ['src/pages/Settings.tsx', 'src/components/settings/ProfileForm.tsx'],
    rationale: 'Settings page split into focused components.',
  },
  {
    keywords: ['landing', 'homepage', 'hero', 'marketing'],
    files: ['src/pages/Home.tsx', 'src/components/sections/Hero.tsx', 'src/components/sections/Features.tsx'],
    rationale: 'Marketing page sections for cleaner composition.',
  },
  {
    keywords: ['table', 'list', 'crud', 'data'],
    files: ['src/components/data/DataTable.tsx', 'src/hooks/useData.ts'],
    rationale: 'Data-heavy UX with reusable table and fetch hook.',
  },
];

function ensureBaseFiles(): string[] {
  return [
    'src/App.tsx',
    'src/main.tsx',
    'src/index.css',
    'src/vite-env.d.ts',
  ];
}

function normalizePlannedPaths(files: string[]): string[] {
  const deduped = new Set<string>();
  files.forEach((file) => {
    const normalized = file.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (normalized) {
      deduped.add(normalized);
    }
  });
  return [...deduped];
}

export function createFilePlan(input: FilePlanInput): FilePlan {
  const prompt = input.prompt.toLowerCase();
  const existingFiles = new Set(Object.keys(input.currentFiles || {}).map((path) => path.replace(/\\/g, '/')));

  const planned = new Set<string>(ensureBaseFiles());
  const rationaleParts: string[] = ['Base Vite/React structure is always present.'];

  KEYWORD_FILE_RULES.forEach((rule) => {
    const match = rule.keywords.some((keyword) => prompt.includes(keyword));
    if (match) {
      rule.files.forEach((file) => planned.add(file));
      rationaleParts.push(rule.rationale);
    }
  });

  (input.requiredFiles || []).forEach((file) => planned.add(file));

  if (planned.size === ensureBaseFiles().length) {
    planned.add('src/components/ui');
    rationaleParts.push('Generic UI scaffold for iterative expansion.');
  }

  const normalized = normalizePlannedPaths([...planned]);
  const create = normalized.filter((path) => !existingFiles.has(path));
  const update = normalized.filter((path) => existingFiles.has(path));

  return {
    create,
    update,
    rationale: rationaleParts.join(' '),
  };
}

export function filterFilesForLLMContext(files: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  const ALLOW_PREFIXES = ['src/', 'App.tsx', 'components/', 'hooks/', 'utils/'];
  const BLOCKLIST = new Set([
    'package-lock.json',
    'node_modules',
    '.git',
    'README.md',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
  ]);

  Object.entries(files).forEach(([path, content]) => {
    const normalized = path.replace(/\\/g, '/');
    const blocked = [...BLOCKLIST].some((blockedPath) => normalized === blockedPath || normalized.startsWith(`${blockedPath}/`));
    if (blocked) {
      return;
    }

    if (content.trim().length === 0) {
      return;
    }

    const allowed = ALLOW_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    if (allowed || /\.(tsx|ts|jsx|js|css|json|html)$/.test(normalized)) {
      result[normalized] = content;
    }
  });

  return result;
}
