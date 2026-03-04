import {
  getAllTemplateBlocks,
  getBlockById,
  getTemplateAnimationPresets,
  getTemplatePreset,
  getTemplateStyleKits,
  inferPresetFromPrompt,
} from './registry.js';
import type { BlockCategory, TemplateAnimationPreset, TemplatePreset } from './types.js';

type PlanMode = TemplatePreset['mode'];
type PlanLanguage = 'de' | 'en';
type PlanProjectType = 'saas' | 'landing' | 'dashboard' | 'auth' | 'tool' | 'data-app' | 'workspace';
type PlanPageType = 'landing' | 'app' | 'auth';
type PlanGenerationMode = 'new' | 'edit';

const PLAN_ERROR_CODES = {
  AUTH_WITHOUT_LOGIN_PAGE: 'AUTH_WITHOUT_LOGIN_PAGE',
  DASHBOARD_WITHOUT_LAYOUT: 'DASHBOARD_WITHOUT_LAYOUT',
  PRICING_WITHOUT_CTA: 'PRICING_WITHOUT_CTA',
  MULTI_PAGE_WITHOUT_NAV: 'MULTI_PAGE_WITHOUT_NAV',
} as const;

const LANDING_DEFAULT_SECTIONS: BlockCategory[] = ['navbar', 'hero', 'features', 'footer'];
const DASHBOARD_DEFAULT_SECTIONS: BlockCategory[] = ['sidebar', 'dashboard', 'stats', 'footer'];
const AUTH_DEFAULT_SECTIONS: BlockCategory[] = ['auth', 'footer'];

const SECTION_ORDER: Record<BlockCategory, number> = {
  navbar: 10,
  banner: 15,
  hero: 20,
  features: 30,
  testimonials: 35,
  team: 36,
  timeline: 37,
  gallery: 38,
  blog: 39,
  ecommerce: 40,
  'social-proof': 41,
  pricing: 42,
  cta: 43,
  faq: 44,
  contact: 45,
  stats: 50,
  chart: 60,
  dashboard: 70,
  sidebar: 80,
  auth: 90,
  modal: 100,
  footer: 110,
};

const CATEGORY_MODE_SUPPORT: Record<BlockCategory, PlanMode[]> = {
  navbar: ['landing', 'dashboard', 'auth'],
  banner: ['landing'],
  hero: ['landing'],
  features: ['landing'],
  testimonials: ['landing'],
  team: ['landing'],
  timeline: ['landing'],
  blog: ['landing'],
  gallery: ['landing'],
  ecommerce: ['landing'],
  'social-proof': ['landing'],
  pricing: ['landing'],
  cta: ['landing'],
  faq: ['landing'],
  contact: ['landing'],
  dashboard: ['dashboard'],
  sidebar: ['dashboard'],
  auth: ['auth', 'landing', 'dashboard'],
  modal: ['landing', 'dashboard', 'auth'],
  stats: ['landing', 'dashboard'],
  chart: ['landing', 'dashboard'],
  footer: ['landing', 'dashboard', 'auth'],
};

const PROJECT_NAME_STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'bauen', 'build', 'create', 'dashboard',
  'der', 'die', 'ein', 'eine', 'einen', 'einer', 'einem', 'for', 'fuer', 'fur',
  'fuer', 'homepage', 'ich', 'in', 'landing', 'landingpage', 'mach', 'make', 'mir',
  'modern', 'moderne', 'modernes', 'my', 'nh', 'page', 'please', 'projekt',
  'resta', 'restaurant', 'saas', 'shop', 'site', 'startup', 'und', 'webseite',
  'website', 'schon', 'schoen', 'schone', 'schoene', 'schoener', 'schones', 'beautiful', 'nice', 'cool', 'awesome'
]);

const ACRONYM_WORDS = new Set([
  'ai', 'ui', 'ux', 'api', 'kpi', 'crm', 'erp', 'saas', 'b2b'
]);

const FEATURE_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'login', 'register', 'signup', 'signin', 'konto', 'anmeldung'],
  dashboard: ['dashboard', 'admin', 'analytics', 'kpi', 'metrics'],
  pricing: ['pricing', 'plan', 'subscription', 'abo', 'preise'],
  chart: ['chart', 'graph', 'diagram', 'report', 'reports', 'preisverlauf', 'price trend', 'price history', 'line chart'],
  modal: ['modal', 'dialog', 'confirm', 'confirmation'],
  cart: ['cart', 'shopping cart', 'basket', 'checkout', 'warenkorb', 'waren korb', 'einkaufswagen', 'einkaufskorb', 'einkaufskorb', 'korb'],
  kanban: ['kanban', 'trello', 'board', 'to do', 'doing', 'done'],
  dnd: ['drag and drop', 'drag-and-drop', '@dnd-kit', 'react-beautiful-dnd', 'sortable'],
  search: ['search', 'suche', 'filter', 'realtime filter', 'echtzeit'],
  persistence: ['localstorage', 'local storage', 'persist', 'speichern', 'refresh'],
  calculator: ['calculator', 'rechner', 'split bill', 'split-bill', 'trinkgeld', 'tip'],
  pathfinding: ['pathfinding', 'dijkstra', 'a*', 'grid', 'raster', 'shortest path'],
  inventory: ['inventory', 'lagerbestand', 'bestand', 'stock'],
  invoice: ['invoice', 'rechnung', 'billing', 'invoicing'],
  pdf: ['pdf', 'react-pdf', '@react-pdf/renderer', 'print styling'],
  toast: ['toast', 'popup', 'notification', 'warnung', 'warning'],
  tabs: ['tabs', 'tab', 'sidebar navigation'],
  table: ['table', 'tabelle', 'sortier', 'sort'],
};

const MULTI_PAGE_SIGNALS = [
  'mehrere seiten',
  'mehr seiten',
  'multi page',
  'multipage',
  'multi-page',
  'weitere seite',
  'add page',
  'new page',
  'zusatzseite',
  'zusatz seite',
  'extra page',
  'zusatzliche seite',
  'zusätzliche seite',
];

const DESIGN_REFRESH_SIGNALS = [
  'anderes design',
  'komplett neues design',
  'neues design',
  'redesign',
  'different design',
  'new style',
  'style wechseln',
  'anderer stil',
  'andere optik',
  'fresh look',
  'fresh design',
  'make it beautiful',
  'beautiful design',
  'mach schöner',
  'mach schoener',
  'schöner machen',
  'schoener machen',
  'modernize design',
  'modernisieren',
  'premium look',
  'creative look',
];

const MODE_HINT_KEYWORDS: Record<PlanMode, string[]> = {
  landing: ['landing', 'landingpage', 'homepage', 'website', 'webseite', 'seite', 'hero', 'marketing', 'shop', 'store'],
  dashboard: ['dashboard', 'admin', 'analytics', 'kpi', 'metrics', 'operations', 'monitoring', 'kanban', 'trello', 'pathfinding', 'dijkstra', 'inventory', 'invoice', 'split-bill', 'split bill', 'calculator', 'visualizer', 'tool', 'workspace'],
  auth: ['auth', 'login', 'register', 'signup', 'signin', 'anmeldung'],
};

const PROMPT_STYLE_KEYWORDS: Record<string, string[]> = {
  minimal: ['minimal', 'clean', 'simple', 'airy'],
  premium: ['premium', 'luxury', 'editorial', 'elegant', 'beautiful', 'schon', 'schoen', 'polished'],
  commerce: ['commerce', 'shop', 'store', 'restaurant', 'pizza', 'coffee', 'checkout', 'cart'],
  enterprise: ['enterprise', 'corporate', 'b2b', 'finance', 'operations', 'compliance'],
  bold: ['bold', 'strong', 'vibrant', 'creative', 'neon', 'fashion', 'gaming'],
  playful: ['playful', 'fun', 'friendly', 'bunt', 'colorful'],
};

const PAGE_HINTS: Array<{ keywords: string[]; path: string; type: PlanPageType; sections: BlockCategory[] }> = [
  { keywords: ['dashboard', 'admin panel', 'admin'], path: '/dashboard', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] },
  { keywords: ['kanban', 'trello', 'board'], path: '/board', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] },
  { keywords: ['inventory', 'produkte', 'product management'], path: '/inventory', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] },
  { keywords: ['invoice', 'rechnung', 'billing'], path: '/invoices', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] },
  { keywords: ['login', 'signin', 'anmelden'], path: '/login', type: 'auth', sections: ['auth', 'footer'] },
  { keywords: ['register', 'signup'], path: '/register', type: 'auth', sections: ['auth', 'footer'] },
  { keywords: ['products', 'product page', 'shop', 'store', 'produkte'], path: '/products', type: 'landing', sections: ['navbar', 'ecommerce', 'footer'] },
  { keywords: ['cart', 'checkout', 'warenkorb', 'waren korb', 'kasse', 'einkaufswagen', 'einkaufskorb', 'einkaufskorb', 'shopping basket'], path: '/cart', type: 'app', sections: ['navbar', 'ecommerce', 'contact', 'footer'] },
  { keywords: ['pricing page', 'preise seite'], path: '/pricing', type: 'landing', sections: ['navbar', 'hero', 'pricing', 'cta', 'footer'] },
  { keywords: ['faq page', 'hilfe', 'support'], path: '/faq', type: 'landing', sections: ['navbar', 'faq', 'footer'] },
  { keywords: ['about', 'ueber uns', 'über uns'], path: '/about', type: 'landing', sections: ['navbar', 'team', 'testimonials', 'footer'] },
  { keywords: ['contact', 'kontakt'], path: '/contact', type: 'landing', sections: ['navbar', 'contact', 'footer'] },
];

export interface ProjectPlanPage {
  path: string;
  type: PlanPageType;
  sections: BlockCategory[];
}

export interface ProjectPlan {
  templateId: string;
  mode: PlanMode;
  projectType: PlanProjectType;
  brand: string;
  tone: string;
  language: PlanLanguage;
  styleKitId?: string;
  animationPresetIds?: string[];
  pages: ProjectPlanPage[];
  features: string[];
}

export interface PlanValidationResult {
  valid: boolean;
  errorCodes: string[];
  errors: string[];
  warnings: string[];
}

export interface PlanResolutionResult {
  draftPlan: ProjectPlan;
  normalizedPlan: ProjectPlan;
  validation: PlanValidationResult;
  repairLog: string[];
  finalPlan: ProjectPlan;
  expandedDependencies: string[];
  requiredFiles: string[];
  resolvedBlockIds: string[];
  planContextPrompt: string;
}

interface ResolvePlanInput {
  prompt: string;
  templateId?: string;
  existingFiles?: Record<string, string>;
  generationMode?: PlanGenerationMode;
  projectId?: string;
}

const VALID_CATEGORIES = new Set<BlockCategory>(
  getAllTemplateBlocks().map((block) => block.category)
);

function normalizePath(path: string): string {
  if (!path) return '/';
  let next = path.trim();
  if (!next.startsWith('/')) next = `/${next}`;
  next = next.replace(/\/+/g, '/');
  if (next.length > 1 && next.endsWith('/')) next = next.slice(0, -1);
  return next;
}

function titleCaseWord(input: string): string {
  if (ACRONYM_WORDS.has(input.toLowerCase())) return input.toUpperCase();
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

function canonicalWord(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeProjectName(raw: string): string {
  const normalizedRaw = raw
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

  const cleaned = normalizedRaw
    .replace(/[^a-zA-Z0-9&\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const filtered = words.filter((word) => !PROJECT_NAME_STOP_WORDS.has(canonicalWord(word)));
  const selected = (filtered.length > 0 ? filtered : words).slice(0, 3);
  return selected.map((word) => titleCaseWord(word)).join(' ');
}

function extractBrand(prompt: string): string {
  const trimmed = prompt.trim();

  const quotedMatch = trimmed.match(/["'`“”]([^"'`“”]{2,60})["'`“”]/);
  if (quotedMatch) {
    const normalized = normalizeProjectName(quotedMatch[1]);
    if (normalized) return normalized;
  }

  const explicitPatterns = [
    /\b(?:name|brand|projektname|appname|heißt|heisst|called|named)\s*(?::|ist|is)?\s*([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,60})/i,
    /\b(?:für|fuer|for)\s+([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,60})/i
  ];

  for (const pattern of explicitPatterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const normalized = normalizeProjectName(match[1]);
    if (normalized) return normalized;
  }

  const normalizedPrompt = trimmed
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  const tokens = (normalizedPrompt.match(/[a-zA-Z0-9&-]+/g) || [])
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 2 && !PROJECT_NAME_STOP_WORDS.has(canonicalWord(token)));

  if (tokens.length > 0) {
    return tokens.slice(0, 2).map((token) => titleCaseWord(token)).join(' ');
  }

  const lower = normalizedPrompt.toLowerCase();
  if (/shop|store|ecommerce|commerce|checkout|cart/.test(lower)) return 'Nova Shop';
  if (/restaurant|pizza|coffee|cafe|food/.test(lower)) return 'Nova Bistro';
  if (/dashboard|analytics|admin|kpi|metrics/.test(lower)) return 'Nova Dashboard';
  if (/auth|login|register|signup|signin/.test(lower)) return 'Nova Auth';

  return 'Nova Project';
}

function detectLanguage(prompt: string): PlanLanguage {
  const lower = prompt.toLowerCase();
  const germanSignals = [' und ', ' bitte', 'erstelle', 'baue', 'für ', 'fuer ', 'eine ', 'mit '];
  const score = germanSignals.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
  return score >= 2 ? 'de' : 'en';
}

function extractTone(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/minimal|clean|simple|airy/.test(lower)) return 'minimal';
  if (/premium|luxury|elegant|editorial|beautiful|schön|schoen|polished/.test(lower)) return 'premium';
  if (/playful|fun|friendly|colorful|bunt/.test(lower)) return 'playful';
  if (/restaurant|cafe|coffee|pizza|shop|store|ecommerce|checkout|cart/.test(lower)) return 'commerce';
  if (/enterprise|business|b2b|corporate|finance|operations|compliance/.test(lower)) return 'enterprise';
  if (/bold|vibrant|strong|creative|neon|fashion|gaming/.test(lower)) return 'bold';
  if (/modern|modernes|moderne/.test(lower)) return 'modern';
  return 'modern';
}

function pickStyleKitId(
  prompt: string,
  tone: string,
  mode: PlanMode,
  projectType: PlanProjectType,
  projectId?: string,
  generationMode: PlanGenerationMode = 'new'
): string | undefined {
  const styleKits = getTemplateStyleKits();
  if (styleKits.length === 0) return undefined;

  const lower = prompt.toLowerCase();
  const scored = styleKits
    .map((kit) => {
      let score = 0;
      const searchable = `${kit.name} ${kit.description} ${kit.tags.join(' ')}`.toLowerCase();
      if (searchable.includes(tone)) score += 6;
      if (searchable.includes(projectType)) score += 4;
      if (searchable.includes(mode)) score += 2;
      Object.values(PROMPT_STYLE_KEYWORDS).forEach((tokens) => {
        const hit = tokens.some((token) => lower.includes(token));
        if (hit && tokens.some((token) => searchable.includes(token))) score += 3;
      });
      if (/dark|dunkel/.test(lower) && (kit.colorHints.background || '').includes('#0')) score += 2;
      return { kit, score };
    })
    .sort((a, b) => b.score - a.score || a.kit.id.localeCompare(b.kit.id));

  const bestScore = scored[0]?.score ?? -1000;
  const nearBest = scored.filter((entry) => entry.score >= bestScore - 2).slice(0, 5);
  const pool = nearBest.length > 0 ? nearBest : scored;
  if (pool.length === 0) return undefined;

  const entropy = generationMode === 'new'
    ? (projectId || `${Date.now()}`)
    : (projectId || 'edit-stable');
  const seed = hashString(`${prompt}|${tone}|${projectType}|${entropy}|style-kit`);
  return pool[seed % pool.length]?.kit.id;
}

function pickAnimationPresetIds(
  prompt: string,
  features: string[],
  pages: ProjectPlanPage[]
): string[] {
  const presets = getTemplateAnimationPresets();
  if (presets.length === 0) return [];

  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const selected: string[] = [];
  const lower = prompt.toLowerCase();

  const addIfPresent = (id: string) => {
    if (byId.has(id) && !selected.includes(id)) selected.push(id);
  };

  addIfPresent('anim-reveal-fade');
  addIfPresent('anim-stagger-children');

  if (features.includes('dashboard') || features.includes('chart')) {
    addIfPresent('anim-counter');
  }
  if (pages.length > 1) {
    addIfPresent('anim-page-transition');
  }
  if (/logo|testimonial|social|case study/.test(lower)) {
    addIfPresent('anim-marquee');
  }
  if (/hover|card|interactive/.test(lower)) {
    addIfPresent('anim-hover-lift');
  }

  return selected.slice(0, 4);
}

function hasMultiPageIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return MULTI_PAGE_SIGNALS.some((signal) => lower.includes(signal));
}

function hasDesignRefreshIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return DESIGN_REFRESH_SIGNALS.some((signal) => lower.includes(signal));
}

function sanitizeRoutePath(rawPath: string): string {
  const sanitized = rawPath.toLowerCase().replace(/[^a-z0-9/_-]/g, '');
  return normalizePath(sanitized || '/');
}

function escapeKeywordForRegex(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPromptKeyword(lowerPrompt: string, keyword: string): boolean {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return false;
  const escaped = escapeKeywordForRegex(normalizedKeyword);
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
  return pattern.test(lowerPrompt);
}

function extractRequestedPages(prompt: string): ProjectPlanPage[] {
  const lower = prompt.toLowerCase();
  const pages: ProjectPlanPage[] = [];
  const explicitPathMatches = Array.from(
    lower.matchAll(/(?:^|[\s,(])\/[a-z0-9][a-z0-9/_-]*/g)
  )
    .map((match) => String(match[0] || '').trim())
    .filter(Boolean);
  const multiPage = hasMultiPageIntent(prompt);

  PAGE_HINTS.forEach((hint) => {
    const hasMatch = hint.keywords.some((keyword) => matchesPromptKeyword(lower, keyword));
    if (!hasMatch) return;
    pages.push({
      path: hint.path,
      type: hint.type,
      sections: [...hint.sections],
    });
  });

  explicitPathMatches.forEach((path) => {
    const normalized = sanitizeRoutePath(path);
    if (normalized === '/') return;
    if (normalized.startsWith('/api/')) return;
    pages.push({
      path: normalized,
      type: normalized === '/dashboard' ? 'app' : (normalized === '/login' || normalized === '/register' ? 'auth' : 'landing'),
      sections: normalized === '/dashboard'
        ? ['sidebar', 'dashboard', 'stats']
        : (normalized === '/login' || normalized === '/register'
          ? ['auth', 'footer']
          : ['navbar', 'hero', 'features', 'footer']),
    });
  });

  if (multiPage && pages.length === 0) {
    pages.push(
      { path: '/about', type: 'landing', sections: ['navbar', 'team', 'testimonials', 'footer'] },
      { path: '/contact', type: 'landing', sections: ['navbar', 'contact', 'footer'] },
    );
  }

  return pages;
}

function dedupeSections(sections: BlockCategory[]): BlockCategory[] {
  const seen = new Set<BlockCategory>();
  const out: BlockCategory[] = [];
  sections.forEach((section) => {
    if (VALID_CATEGORIES.has(section) && !seen.has(section)) {
      seen.add(section);
      out.push(section);
    }
  });
  return out.sort((a, b) => (SECTION_ORDER[a] || 999) - (SECTION_ORDER[b] || 999));
}

function ensureSections(page: ProjectPlanPage, required: BlockCategory[]): ProjectPlanPage {
  return {
    ...page,
    sections: dedupeSections([...page.sections, ...required]),
  };
}

function findPage(pages: ProjectPlanPage[], path: string): ProjectPlanPage | undefined {
  return pages.find((page) => normalizePath(page.path) === normalizePath(path));
}

function upsertPage(pages: ProjectPlanPage[], nextPage: ProjectPlanPage): ProjectPlanPage[] {
  const normalizedPath = normalizePath(nextPage.path);
  const existing = pages.findIndex((page) => normalizePath(page.path) === normalizedPath);
  if (existing === -1) {
    return [...pages, { ...nextPage, path: normalizedPath, sections: dedupeSections(nextPage.sections) }];
  }
  const merged = {
    ...pages[existing],
    type: nextPage.type,
    sections: dedupeSections([...pages[existing].sections, ...nextPage.sections]),
    path: normalizedPath,
  };
  return pages.map((page, idx) => (idx === existing ? merged : page));
}

function extractFeatures(prompt: string, mode: PlanMode): string[] {
  const lower = prompt.toLowerCase();
  const features = new Set<string>();

  Object.entries(FEATURE_KEYWORDS).forEach(([feature, keywords]) => {
    if (keywords.some((keyword) => matchesPromptKeyword(lower, keyword))) {
      features.add(feature);
    }
  });

  if (mode === 'dashboard') {
    features.add('dashboard');
    if (lower.includes('chart') || lower.includes('analytics') || lower.includes('report')) {
      features.add('chart');
    }
  }

  if (mode === 'auth') {
    features.add('auth');
  }

  return [...features];
}

function choosePlanPreset(input: ResolvePlanInput): TemplatePreset {
  if (input.templateId) {
    const explicit = getTemplatePreset(input.templateId);
    if (explicit) return explicit;
  }

  const lower = input.prompt.toLowerCase();
  const allPresets = [
    'landing-ai',
    'landing-minimal',
    'landing-commerce',
    'landing-commerce-bold',
    'landing-commerce-minimal',
    'landing-editorial',
    'landing-bold',
    'landing-bold-mix',
    'landing-corporate',
    'dashboard-enterprise',
    'dashboard-ops',
    'auth-starter',
    'auth-modern',
  ]
    .map((id) => getTemplatePreset(id))
    .filter((preset): preset is TemplatePreset => Boolean(preset));

  if (allPresets.length === 0) {
    return inferPresetFromPrompt(input.prompt);
  }

  const modeSignals: Record<PlanMode, number> = {
    landing: 0,
    dashboard: 0,
    auth: 0,
  };
  (Object.keys(MODE_HINT_KEYWORDS) as PlanMode[]).forEach((mode) => {
    MODE_HINT_KEYWORDS[mode].forEach((token) => {
      if (lower.includes(token)) modeSignals[mode] += 1;
    });
  });

  const dominantMode = (Object.entries(modeSignals) as Array<[PlanMode, number]>)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'landing';

  const scorePreset = (preset: TemplatePreset): number => {
    let score = 0;
    if (preset.mode === dominantMode) score += 6;
    if (modeSignals[preset.mode] > 0) score += Math.min(5, modeSignals[preset.mode]);
    if (preset.id === 'blank-react') score -= 12;

    preset.tags.forEach((tag) => {
      if (lower.includes(tag.toLowerCase())) score += 3;
    });

    Object.entries(PROMPT_STYLE_KEYWORDS).forEach(([styleHint, tokens]) => {
      if (!tokens.some((token) => lower.includes(token))) return;
      if (preset.tags.some((tag) => tag.toLowerCase().includes(styleHint))) {
        score += 4;
      }
    });

    if (/dark|dunkel/.test(lower) && preset.tags.includes('premium')) score += 1;
    if (/cart|checkout|shop|store|restaurant|pizza|coffee/.test(lower) && preset.tags.includes('commerce')) score += 5;
    if (/enterprise|b2b|corporate|finance/.test(lower) && preset.tags.some((tag) => ['enterprise', 'corporate', 'b2b', 'finance'].includes(tag))) score += 5;
    if (/creative|bold|neon|vibrant|fashion|gaming/.test(lower) && preset.tags.some((tag) => ['bold', 'creative'].includes(tag))) score += 5;
    if (/auth|login|register|signup|signin/.test(lower) && preset.mode === 'auth') score += 6;
    if (/dashboard|analytics|admin|kpi|metrics|operations|monitoring/.test(lower) && preset.mode === 'dashboard') score += 6;
    if (/kanban|trello|pathfinding|dijkstra|inventory|invoice|split-bill|split bill|calculator|visualizer/.test(lower) && preset.mode === 'dashboard') score += 10;
    if (/kanban|trello|pathfinding|dijkstra|inventory|invoice|split-bill|split bill|calculator|visualizer/.test(lower) && preset.mode === 'landing') score -= 8;

    return score;
  };

  const ranked = allPresets
    .slice()
    .sort((a, b) => {
      const scoreA = scorePreset(a);
      const scoreB = scorePreset(b);
      if (scoreA === scoreB) return a.id.localeCompare(b.id);
      return scoreB - scoreA;
    });

  const bestScore = scorePreset(ranked[0]);
  const nearBest = ranked.filter((preset) => scorePreset(preset) >= bestScore - 2).slice(0, 4);
  const generationMode = input.generationMode || 'new';
  const entropy = generationMode === 'new'
    ? (input.projectId || `${Date.now()}`)
    : (input.projectId || 'edit-stable');
  const seed = hashString(`${input.prompt}|${entropy}|${generationMode}|preset`);
  const pool = nearBest.length > 0 ? nearBest : ranked;
  return pool[seed % pool.length];
}

function inferProjectType(mode: PlanMode, prompt: string, features: string[]): PlanProjectType {
  if (mode === 'dashboard') return 'dashboard';
  if (mode === 'auth') return 'auth';
  const lower = prompt.toLowerCase();
  if (features.includes('kanban')) return 'workspace';
  if (features.includes('pathfinding') || features.includes('calculator')) return 'tool';
  if (features.includes('inventory') || features.includes('invoice') || features.includes('pdf')) return 'data-app';
  if (features.includes('pricing') || /saas|startup|ai|product/.test(lower)) {
    return 'saas';
  }
  return 'landing';
}

function hasCommerceIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return /shop|store|ecommerce|commerce|retail|checkout|cart|product|produkte|warenkorb|einkaufswagen/.test(lower);
}

function inferInitialSections(mode: PlanMode, features: string[]): BlockCategory[] {
  const needsInteractiveAppShell = ['kanban', 'pathfinding', 'inventory', 'invoice', 'calculator']
    .some((feature) => features.includes(feature));

  if (mode === 'landing' && needsInteractiveAppShell) {
    const sections: BlockCategory[] = ['navbar', 'dashboard', 'stats'];
    if (features.includes('chart') || features.includes('pathfinding')) sections.push('chart');
    return sections;
  }

  if (mode === 'dashboard') {
    const sections: BlockCategory[] = ['sidebar', 'dashboard', 'stats'];
    if (features.includes('chart')) sections.push('chart');
    if (features.includes('pathfinding')) sections.push('chart');
    return sections;
  }
  if (mode === 'auth') {
    return ['auth'];
  }
  const sections: BlockCategory[] = ['hero', 'features'];
  if (features.includes('pricing')) sections.push('pricing', 'cta');
  return sections;
}

function createDraftPlan(input: ResolvePlanInput): ProjectPlan {
  const preset = choosePlanPreset(input);
  const mode = preset.mode;
  const features = extractFeatures(input.prompt, mode);
  const projectType = inferProjectType(mode, input.prompt, features);
  const tone = extractTone(input.prompt);
  const generationMode = input.generationMode || 'new';
  const pages: ProjectPlanPage[] = [
    {
      path: '/',
      type: mode === 'dashboard' ? 'app' : mode === 'auth' ? 'auth' : 'landing',
      sections: inferInitialSections(mode, features),
    },
  ];
  const requestedPages = extractRequestedPages(input.prompt);
  requestedPages.forEach((page) => {
    pages.push({
      path: normalizePath(page.path),
      type: page.type,
      sections: dedupeSections(page.sections),
    });
  });

  if (features.includes('dashboard') && mode === 'landing') {
    pages.push({
      path: '/dashboard',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'stats', ...(features.includes('chart') ? ['chart'] as BlockCategory[] : [])],
    });
  }

  if (features.includes('kanban')) {
    pages.push({
      path: '/board',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'stats'],
    });
  }

  if (features.includes('pathfinding')) {
    pages.push({
      path: '/visualizer',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'chart', 'stats'],
    });
  }

  if (features.includes('calculator')) {
    pages.push({
      path: '/tool',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'stats'],
    });
  }

  if (features.includes('inventory') || features.includes('invoice')) {
    pages.push(
      { path: '/inventory', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] },
      { path: '/invoices', type: 'app', sections: ['sidebar', 'dashboard', 'stats'] }
    );
  }

  if (features.includes('auth') && mode !== 'auth') {
    pages.push({
      path: '/login',
      type: 'auth',
      sections: ['auth'],
    });
  }

  if (features.includes('cart') && mode === 'landing') {
    pages.push({
      path: '/cart',
      type: 'app',
      sections: ['navbar', 'ecommerce', 'contact', 'footer'],
    });
  }

  if (mode === 'landing' && hasCommerceIntent(input.prompt)) {
    pages.push(
      { path: '/products', type: 'landing', sections: ['navbar', 'ecommerce', 'footer'] },
      { path: '/product', type: 'landing', sections: ['navbar', 'hero', 'ecommerce', 'cta', 'footer'] },
      { path: '/checkout', type: 'app', sections: ['navbar', 'ecommerce', 'contact', 'footer'] }
    );
  }

  const styleKitId = pickStyleKitId(
    input.prompt,
    tone,
    mode,
    projectType,
    input.projectId,
    generationMode
  );
  const animationPresetIds = pickAnimationPresetIds(input.prompt, features, pages);

  return {
    templateId: preset.id,
    mode,
    projectType,
    brand: extractBrand(input.prompt),
    tone,
    language: detectLanguage(input.prompt),
    styleKitId,
    animationPresetIds,
    pages,
    features,
  };
}

function normalizePlan(plan: ProjectPlan): ProjectPlan {
  const normalizedPages: ProjectPlanPage[] = plan.pages
    .map((page) => ({
      path: normalizePath(page.path),
      type: page.type,
      sections: dedupeSections(page.sections || []),
    }))
    .filter((page) => page.sections.length > 0);

  const dedupedPages = normalizedPages.reduce<ProjectPlanPage[]>((acc, page) => upsertPage(acc, page), []);

  const defaultRootPage: ProjectPlanPage = {
    path: '/',
    type: plan.mode === 'dashboard' ? 'app' : plan.mode === 'auth' ? 'auth' : 'landing',
    sections: [],
  };
  let pages: ProjectPlanPage[] = dedupedPages.length > 0 ? dedupedPages : [defaultRootPage];

  const root = findPage(pages, '/') || pages[0];
  if (!findPage(pages, '/')) {
    pages = upsertPage(pages, root);
  }

  if (plan.mode === 'landing') {
    pages = upsertPage(pages, ensureSections(root, LANDING_DEFAULT_SECTIONS));
    if (plan.features.includes('pricing') || plan.projectType === 'saas') {
      pages = upsertPage(pages, ensureSections(root, ['pricing', 'cta']));
    }
  }

  if (plan.mode === 'dashboard') {
    pages = upsertPage(pages, ensureSections(root, DASHBOARD_DEFAULT_SECTIONS));
    if (plan.features.includes('chart')) {
      pages = upsertPage(pages, ensureSections(root, ['chart']));
    }
  }

  if (plan.mode === 'auth') {
    pages = upsertPage(pages, ensureSections(root, AUTH_DEFAULT_SECTIONS));
  }

  if (plan.features.includes('auth') && plan.mode !== 'auth') {
    const loginPage: ProjectPlanPage = { path: '/login', type: 'auth', sections: ['auth'] };
    pages = upsertPage(pages, loginPage);
  }

  const hasAnyNavigation = pages.some((page) => page.sections.includes('navbar') || page.sections.includes('sidebar'));
  if (pages.length > 1 && !hasAnyNavigation) {
    const navCategory: BlockCategory = plan.mode === 'dashboard' ? 'sidebar' : 'navbar';
    pages = upsertPage(pages, ensureSections(root, [navCategory]));
  }

  const hasPricing = pages.some((page) => page.sections.includes('pricing'));
  const hasHero = pages.some((page) => page.sections.includes('hero'));
  const hasCta = pages.some((page) => page.sections.includes('cta'));
  if (hasPricing && !hasHero && !hasCta) {
    pages = upsertPage(pages, ensureSections(root, ['hero', 'cta']));
  }

  pages = pages.map((page) => {
    if (page.sections.includes('dashboard') && !page.sections.includes('sidebar') && !page.sections.includes('navbar')) {
      return ensureSections(page, ['sidebar']);
    }
    return page;
  });

  const uniqueFeatures = [...new Set(plan.features)];
  const animationPresetIds = [...new Set((plan.animationPresetIds || []).filter(Boolean))];

  return {
    ...plan,
    brand: plan.brand || 'Nova Project',
    tone: plan.tone || 'modern',
    pages,
    features: uniqueFeatures,
    animationPresetIds,
  };
}

function validatePlan(plan: ProjectPlan): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const errorCodes: string[] = [];

  const hasLoginPage = Boolean(findPage(plan.pages, '/login')) || (plan.mode === 'auth' && Boolean(findPage(plan.pages, '/')));
  if (plan.features.includes('auth') && !hasLoginPage) {
    errorCodes.push(PLAN_ERROR_CODES.AUTH_WITHOUT_LOGIN_PAGE);
    errors.push('Auth feature detected but no login page is present.');
  }

  const dashboardWithoutLayout = plan.pages.some(
    (page) => page.sections.includes('dashboard') && !page.sections.includes('sidebar') && !page.sections.includes('navbar')
  );
  if (dashboardWithoutLayout) {
    errorCodes.push(PLAN_ERROR_CODES.DASHBOARD_WITHOUT_LAYOUT);
    errors.push('Dashboard section requires a layout shell (sidebar or navbar).');
  }

  const hasPricing = plan.pages.some((page) => page.sections.includes('pricing'));
  const hasCtaSection = plan.pages.some((page) => page.sections.includes('hero') || page.sections.includes('cta'));
  if (hasPricing && !hasCtaSection) {
    errorCodes.push(PLAN_ERROR_CODES.PRICING_WITHOUT_CTA);
    errors.push('Pricing section requires CTA support (hero section missing).');
  }

  const hasAnyNavigation = plan.pages.some((page) => page.sections.includes('navbar') || page.sections.includes('sidebar'));
  if (plan.pages.length > 1 && !hasAnyNavigation) {
    errorCodes.push(PLAN_ERROR_CODES.MULTI_PAGE_WITHOUT_NAV);
    errors.push('Multiple pages require a navigation section.');
  }

  if (hasPricing && !plan.pages.some((page) => page.sections.includes('footer'))) {
    warnings.push('Pricing detected without footer; added footer is recommended for conversion context.');
  }

  return {
    valid: errors.length === 0,
    errorCodes,
    errors,
    warnings,
  };
}

function applyRepairs(plan: ProjectPlan, errorCodes: string[]): { repairedPlan: ProjectPlan; fixes: string[]; changed: boolean } {
  let next = { ...plan, pages: plan.pages.map((page) => ({ ...page, sections: [...page.sections] })) };
  const fixes: string[] = [];
  let changed = false;

  for (const code of errorCodes) {
    switch (code) {
      case PLAN_ERROR_CODES.AUTH_WITHOUT_LOGIN_PAGE: {
        next.pages = upsertPage(next.pages, { path: '/login', type: 'auth', sections: ['auth'] });
        fixes.push('Added missing /login page for auth flow.');
        changed = true;
        break;
      }
      case PLAN_ERROR_CODES.DASHBOARD_WITHOUT_LAYOUT: {
        next.pages = next.pages.map((page) => {
          if (page.sections.includes('dashboard') && !page.sections.includes('sidebar') && !page.sections.includes('navbar')) {
            return ensureSections(page, ['sidebar']);
          }
          return page;
        });
        fixes.push('Added sidebar layout for dashboard sections.');
        changed = true;
        break;
      }
      case PLAN_ERROR_CODES.PRICING_WITHOUT_CTA: {
        const root = findPage(next.pages, '/') || next.pages[0];
        if (root) {
          next.pages = upsertPage(next.pages, ensureSections(root, ['hero', 'cta']));
          fixes.push('Added hero/cta sections to support pricing conversion path.');
          changed = true;
        }
        break;
      }
      case PLAN_ERROR_CODES.MULTI_PAGE_WITHOUT_NAV: {
        const root = findPage(next.pages, '/') || next.pages[0];
        if (root) {
          const navCategory: BlockCategory = next.mode === 'dashboard' ? 'sidebar' : 'navbar';
          next.pages = upsertPage(next.pages, ensureSections(root, [navCategory]));
          fixes.push(`Added ${navCategory} navigation for multi-page structure.`);
          changed = true;
        }
        break;
      }
      default:
        break;
    }
  }

  return { repairedPlan: normalizePlan(next), fixes, changed };
}

function routePathToPageFile(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/' || normalized === '/home') return 'src/pages/Home.tsx';
  const token = normalized
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `src/pages/${token || 'Home'}.tsx`;
}

function expandDependencies(plan: ProjectPlan): { expandedPlan: ProjectPlan; expandedDependencies: string[]; requiredFiles: string[] } {
  let expandedPlan = normalizePlan(plan);
  const expandedDependencies: string[] = [];
  const requiredFiles = new Set<string>();

  const addDependency = (label: string) => expandedDependencies.push(label);
  const addFiles = (files: string[]) => files.forEach((file) => requiredFiles.add(file));

  if (expandedPlan.features.includes('auth') || expandedPlan.pages.some((page) => page.type === 'auth')) {
    addDependency('auth-core');
    addFiles([
      'src/pages/Login.tsx',
      'src/contexts/AuthContext.tsx',
      'src/components/auth/AuthGuard.tsx',
    ]);
    expandedPlan.pages = upsertPage(expandedPlan.pages, { path: '/login', type: 'auth', sections: ['auth'] });
  }

  if (expandedPlan.features.includes('dashboard') || expandedPlan.pages.some((page) => page.sections.includes('dashboard'))) {
    addDependency('dashboard-shell');
    addFiles([
      'src/pages/Dashboard.tsx',
      'src/components/layout/Sidebar.tsx',
      'src/components/layout/Header.tsx',
    ]);
    if (expandedPlan.mode === 'landing') {
      expandedPlan.pages = upsertPage(expandedPlan.pages, {
        path: '/dashboard',
        type: 'app',
        sections: ['sidebar', 'dashboard', 'stats'],
      });
    }
  }

  if (expandedPlan.features.includes('chart') || expandedPlan.pages.some((page) => page.sections.includes('chart'))) {
    addDependency('analytics-chart');
    addFiles(['src/components/charts/AnalyticsChart.tsx']);
  }

  if (expandedPlan.features.includes('kanban')) {
    addDependency('kanban-workspace');
    addDependency('drag-drop');
    addFiles([
      'src/pages/Board.tsx',
      'src/components/kanban/KanbanBoard.tsx',
      'src/lib/kanban-store.ts',
    ]);
  }

  if (expandedPlan.features.includes('pathfinding')) {
    addDependency('pathfinding-visualizer');
    addFiles([
      'src/pages/Visualizer.tsx',
      'src/components/pathfinding/PathfindingGrid.tsx',
      'src/lib/pathfinding/dijkstra.ts',
    ]);
    expandedPlan.pages = upsertPage(expandedPlan.pages, {
      path: '/visualizer',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'chart', 'stats'],
    });
  }

  if (expandedPlan.features.includes('calculator')) {
    addDependency('calculator-state');
    addFiles([
      'src/components/tools/SplitBillCalculator.tsx',
      'src/lib/split-bill.ts',
    ]);
  }

  if (expandedPlan.features.includes('inventory') || expandedPlan.features.includes('invoice')) {
    addDependency('inventory-invoice-flow');
    addFiles([
      'src/pages/Inventory.tsx',
      'src/pages/Invoices.tsx',
      'src/components/inventory/ProductTable.tsx',
      'src/components/invoice/InvoiceBuilder.tsx',
      'src/lib/inventory-store.ts',
    ]);
    expandedPlan.pages = upsertPage(expandedPlan.pages, {
      path: '/inventory',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'stats'],
    });
    expandedPlan.pages = upsertPage(expandedPlan.pages, {
      path: '/invoices',
      type: 'app',
      sections: ['sidebar', 'dashboard', 'stats'],
    });
  }

  if (expandedPlan.features.includes('pdf')) {
    addDependency('pdf-output');
    addFiles(['src/lib/pdf/invoice-pdf.tsx']);
  }

  if (expandedPlan.features.includes('toast')) {
    addDependency('toast-feedback');
    addFiles(['src/components/ui/ToastProvider.tsx']);
  }

  if (expandedPlan.features.includes('pricing') || expandedPlan.pages.some((page) => page.sections.includes('pricing'))) {
    addDependency('pricing-flow');
    addFiles(['src/components/sections/Pricing.tsx']);
  }

  if (expandedPlan.features.includes('cart') || expandedPlan.pages.some((page) => page.path === '/cart')) {
    addDependency('cart-flow');
    addFiles([
      'src/pages/Cart.tsx',
      'src/components/cart/CartSummary.tsx',
    ]);
    expandedPlan.pages = upsertPage(expandedPlan.pages, {
      path: '/cart',
      type: 'app',
      sections: ['navbar', 'features', 'footer'],
    });
  }

  if (expandedPlan.pages.length > 1) {
    addDependency('routing-multi-page');
    addFiles(['src/App.tsx', 'src/main.tsx']);
  }

  expandedPlan.pages.forEach((page) => {
    addFiles([routePathToPageFile(page.path)]);
  });

  return {
    expandedPlan: normalizePlan(expandedPlan),
    expandedDependencies,
    requiredFiles: [...requiredFiles],
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function normalizeExistingPaths(existingFiles: Record<string, string> = {}): Set<string> {
  return new Set(
    Object.keys(existingFiles).map((path) => normalizePath(path.replace(/^src\/\.\//, 'src/')))
  );
}

function inferUsedBlocks(existingFiles: Record<string, string> = {}): Set<string> {
  const existingPaths = normalizeExistingPaths(existingFiles);
  const used = new Set<string>();
  getAllTemplateBlocks().forEach((block) => {
    if (existingPaths.has(normalizePath(block.filePath))) {
      used.add(block.id);
    }
  });
  return used;
}

function blockScore(
  blockId: string,
  category: BlockCategory,
  mode: PlanMode,
  projectType: PlanProjectType,
  tone: string,
  promptLower: string,
  preset: TemplatePreset,
  usedBlocks: Set<string>,
  generationMode: PlanGenerationMode
): number {
  const block = getBlockById(blockId);
  if (!block) return -1000;
  let score = 0;
  const qualityTier = block.qualityTier || (block.complexity >= 3 ? 'premium' : block.complexity === 2 ? 'good' : 'good');
  if (qualityTier === 'premium') score += 6;
  if (qualityTier === 'good') score += 3;
  if (qualityTier === 'draft') score -= 12;
  if (block.tags.includes('scaffolded')) score -= 20;
  if (preset.defaultBlocks.includes(block.id)) score += 8;
  if (block.tags.includes(projectType)) score += 3;
  if (block.tags.includes(mode)) score += 2;
  if (block.style.toLowerCase().includes(tone.toLowerCase()) || block.mood.toLowerCase().includes(tone.toLowerCase())) score += 4;
  if (block.category === category) score += 2;
  block.tags.forEach((tag) => {
    if (promptLower.includes(tag.toLowerCase())) score += 1;
  });
  const styleFields = `${block.style} ${block.mood} ${block.layout}`.toLowerCase();
  Object.entries(PROMPT_STYLE_KEYWORDS).forEach(([hint, tokens]) => {
    if (!tokens.some((token) => promptLower.includes(token))) return;
    if (styleFields.includes(hint) || block.tags.some((tag) => tag.toLowerCase().includes(hint))) {
      score += 3;
    }
  });

  if (/dark|dunkel/.test(promptLower) && block.supportsDarkMode) score += 2;
  if (/simple|minimal|clean/.test(promptLower) && block.complexity === 1) score += 2;
  if (/premium|enterprise|bold|luxury|creative/.test(promptLower) && block.complexity >= 2) score += 2;

  if (generationMode === 'new' && usedBlocks.has(block.id)) score -= 4;
  return score;
}

function resolveBlockIds(plan: ProjectPlan, input: ResolvePlanInput): string[] {
  const inferredPreset = getTemplatePreset(plan.templateId) || inferPresetFromPrompt(`${plan.projectType} ${plan.mode}`);
  const requiredCategories = [...new Set(plan.pages.flatMap((page) => page.sections))]
    .sort((a, b) => (SECTION_ORDER[a] || 999) - (SECTION_ORDER[b] || 999));
  const styleKit = plan.styleKitId
    ? getTemplateStyleKits().find((entry) => entry.id === plan.styleKitId)
    : undefined;
  const styleTokens = styleKit
    ? `${styleKit.name} ${styleKit.description} ${styleKit.tags.join(' ')}`
    : '';
  const promptLower = `${input.prompt} ${styleTokens}`.toLowerCase();
  const allowDraftBlocks = false;
  const allowScaffoldBlocks = false;
  const generationMode = input.generationMode || 'new';
  const usedBlocks = inferUsedBlocks(input.existingFiles || {});
  const keepCurrentDesign = generationMode === 'edit' && !hasDesignRefreshIntent(input.prompt);
  const requestEntropy = generationMode === 'new'
    ? (input.projectId || `${Date.now()}`)
    : (input.projectId || 'edit-stable');
  const diversitySeedBase = `${plan.brand}|${plan.mode}|${plan.projectType}|${plan.tone}|${input.prompt}|${requestEntropy}`;
  const selected = new Set<string>();

  for (const category of requiredCategories) {
    const candidates = getAllTemplateBlocks().filter((block) => {
      if (block.category !== category) return false;
      const supportedModes = CATEGORY_MODE_SUPPORT[block.category] || ['landing', 'dashboard', 'auth'];
      if (!supportedModes.includes(plan.mode)) return false;
      if (!allowDraftBlocks && block.qualityTier === 'draft') return false;
      if (!allowScaffoldBlocks && block.tags.includes('scaffolded')) return false;
      return true;
    });
    if (candidates.length === 0) continue;

    if (keepCurrentDesign) {
      const existingCandidate = candidates.find((block) => usedBlocks.has(block.id));
      if (existingCandidate) {
        selected.add(existingCandidate.id);
        continue;
      }
    }

    const ranked = candidates
      .slice()
      .sort((a, b) => {
        const scoreA = blockScore(a.id, category, plan.mode, plan.projectType, plan.tone, promptLower, inferredPreset, usedBlocks, generationMode);
        const scoreB = blockScore(b.id, category, plan.mode, plan.projectType, plan.tone, promptLower, inferredPreset, usedBlocks, generationMode);
        if (scoreA === scoreB) return a.id.localeCompare(b.id);
        return scoreB - scoreA;
      });

    const scored = ranked.map((candidate) => ({
      candidate,
      score: blockScore(
        candidate.id,
        category,
        plan.mode,
        plan.projectType,
        plan.tone,
        promptLower,
        inferredPreset,
        usedBlocks,
        generationMode
      ),
    }));
    const bestScore = scored[0]?.score ?? -1000;
    const nearBest = scored
      .filter((entry) => entry.score >= bestScore - 2)
      .map((entry) => entry.candidate)
      .slice(0, 4);
    const topCandidates = (nearBest.length > 0 ? nearBest : ranked.slice(0, Math.min(4, ranked.length)));
    const antiRepeatPool = topCandidates.filter((candidate) => !usedBlocks.has(candidate.id));
    const selectionPool = antiRepeatPool.length > 0 ? antiRepeatPool : topCandidates;
    const seed = hashString(`${diversitySeedBase}:${category}`);
    const chosen = selectionPool[seed % selectionPool.length];

    if (chosen) selected.add(chosen.id);
  }

  return [...selected];
}

function buildPlanContextPrompt(plan: ProjectPlan, blockIds: string[], expandedDependencies: string[]): string {
  const multiPagePaths = plan.pages.map((page) => page.path);
  const routingInstruction = plan.pages.length > 1
    ? `This is a MULTI-PAGE project. Create route-aware files for: ${multiPagePaths.join(', ')}. Wire navigation and routing for all listed pages using react-router-dom + HashRouter (not BrowserRouter).`
    : 'This is a single-page project unless the user explicitly requests new routes.';
  const selectedStyleKit = plan.styleKitId
    ? getTemplateStyleKits().find((entry) => entry.id === plan.styleKitId)
    : undefined;
  const selectedAnimations = (plan.animationPresetIds || [])
    .map((id) => getTemplateAnimationPresets().find((preset) => preset.id === id))
    .filter((preset): preset is TemplateAnimationPreset => Boolean(preset));
  const planSummary = {
    projectType: plan.projectType,
    mode: plan.mode,
    brand: plan.brand,
    tone: plan.tone,
    language: plan.language,
    styleKit: selectedStyleKit
      ? {
        id: selectedStyleKit.id,
        name: selectedStyleKit.name,
        description: selectedStyleKit.description,
        headingFont: selectedStyleKit.headingFont,
        bodyFont: selectedStyleKit.bodyFont,
        colorHints: selectedStyleKit.colorHints,
        buttonHints: selectedStyleKit.buttonHints,
      }
      : null,
    animationPresets: selectedAnimations.map((preset) => ({
      id: preset.id,
      name: preset.name,
      trigger: preset.trigger,
      tags: preset.tags,
    })),
    pages: plan.pages.map((page) => ({
      path: page.path,
      type: page.type,
      sections: page.sections,
    })),
    features: plan.features,
    dependencyExpansion: expandedDependencies,
    selectedBlocks: blockIds,
  };

  const styleDirective = selectedStyleKit
    ? `Use style kit "${selectedStyleKit.name}" as visual baseline (fonts, palette, button treatment), but keep output unique and not copy-pasted.`
    : 'No external style kit selected; derive a clear visual direction from plan.tone.';
  const animationDirective = selectedAnimations.length > 0
    ? `Prefer these motion presets when relevant: ${selectedAnimations.map((preset) => `${preset.id} (${preset.trigger})`).join(', ')}.`
    : 'Use subtle, meaningful motion only when it improves hierarchy and usability.';
  const featureDirective = [
    plan.features.includes('kanban')
      ? 'Kanban requirement: support column/card moves with @dnd-kit when available; if unavailable, provide deterministic fallback interactions without breaking UX.'
      : null,
    plan.features.includes('pathfinding')
      ? 'Pathfinding requirement: implement deterministic algorithm state (visited nodes, path reconstruction, animation loop) and avoid random/no-op placeholders.'
      : null,
    plan.features.includes('inventory') || plan.features.includes('invoice')
      ? 'Inventory/Invoice requirement: keep stock mutations and invoice totals as single source of truth; avoid duplicated unsynced state.'
      : null,
    plan.features.includes('pdf')
      ? 'PDF requirement: use @react-pdf/renderer when dependency is available, else provide print-friendly invoice fallback via CSS.'
      : null,
    plan.features.includes('toast')
      ? 'Toast requirement: use one consistent notification layer (sonner or react-hot-toast) and wire low-stock warnings.'
      : null,
  ].filter(Boolean).join('\n');

  return `Use this validated plan as source of truth. Do not redesign structure outside this plan.
${routingInstruction}
${styleDirective}
${animationDirective}
${featureDirective}
${JSON.stringify(planSummary, null, 2)}
Only adjust copy, minor styles and interactions while keeping section boundaries stable.
Avoid generic fallback names like "BuilderKit". Keep brand consistent with plan.brand.
Important: Follow user prompt semantics first (industry, audience, language, requested features).
Design diversity directive: avoid cloning previous generic output; pick a distinct visual identity (spacing, color rhythm, card treatment, typography hierarchy) that still fits plan.tone and projectType.
Never output placeholder UI labels like "Feature 1", "Feature 2", "Lorem ipsum", "Welcome to [brand]". Use meaningful, domain-specific copy.`;
}

export function createResolvedProjectPlan(input: ResolvePlanInput): PlanResolutionResult {
  const draftPlan = createDraftPlan(input);
  const normalizedPlan = normalizePlan(draftPlan);

  let workingPlan = normalizedPlan;
  let validation = validatePlan(workingPlan);
  const repairLog: string[] = [];

  for (let cycle = 0; cycle < 2 && !validation.valid; cycle += 1) {
    const repaired = applyRepairs(workingPlan, validation.errorCodes);
    if (!repaired.changed) break;
    repairLog.push(...repaired.fixes);
    workingPlan = repaired.repairedPlan;
    validation = validatePlan(workingPlan);
  }

  const { expandedPlan, expandedDependencies, requiredFiles } = expandDependencies(workingPlan);
  const finalPlan = normalizePlan(expandedPlan);
  const resolvedBlockIds = resolveBlockIds(finalPlan, input);
  const planContextPrompt = buildPlanContextPrompt(finalPlan, resolvedBlockIds, expandedDependencies);

  return {
    draftPlan,
    normalizedPlan,
    validation,
    repairLog,
    finalPlan,
    expandedDependencies,
    requiredFiles,
    resolvedBlockIds,
    planContextPrompt,
  };
}
