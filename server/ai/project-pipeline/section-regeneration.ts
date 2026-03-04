import { getBlockById } from '../template-library/registry.js';
import type { BlockCategory } from '../template-library/types.js';
import { classifyPromptSemanticDiff, type SemanticDiffResult } from './semantic-diff.js';

export interface SectionStructuralDiff {
  existingSectionPaths: string[];
  targetSectionPaths: string[];
  added: string[];
  removed: string[];
  unchanged: string[];
  targetedCategories: BlockCategory[];
  structuralChange: boolean;
}

export interface SectionRegenerationPlan {
  mode: 'full-project' | 'section-isolated';
  allowAppUpdate: boolean;
  allowedUpdatePaths: string[];
  instructionSuffix: string;
  diff: SectionStructuralDiff;
  semantic: SemanticDiffResult;
}

export interface PromptIntentHint {
  targetedCategories?: BlockCategory[];
  scope?: 'section' | 'global';
  forceAppUpdate?: boolean;
  confidence?: number;
  reasoning?: string;
  impactedFiles?: string[];
  forbiddenFiles?: string[];
  editScope?: 'small_fix' | 'style_tweak' | 'component_update' | 'refactor';
}

interface CreateSectionRegenerationInput {
  generationMode: 'new' | 'edit';
  prompt: string;
  existingFiles: Record<string, string>;
  resolvedBlockIds: string[];
  aiHint?: PromptIntentHint;
}

const SECTION_KEYWORDS: Array<{ category: BlockCategory; keywords: string[] }> = [
  { category: 'navbar', keywords: ['nav', 'navbar', 'menu', 'header', 'brand', 'logo', 'cart', 'warenkorb', 'einkaufswagen', 'einkaufskorb', 'einkaufskorb'] },
  { category: 'banner', keywords: ['banner', 'announcement', 'promo bar'] },
  { category: 'hero', keywords: ['hero', 'headline', 'above the fold', 'title', 'h1'] },
  { category: 'features', keywords: ['feature', 'features', 'benefits', 'cart', 'shopping cart', 'shopping basket', 'warenkorb', 'waren korb', 'einkaufswagen', 'einkaufskorb', 'einkaufskorb'] },
  { category: 'testimonials', keywords: ['testimonial', 'testimonials', 'reviews', 'social proof'] },
  { category: 'team', keywords: ['team', 'about us', 'about', 'crew'] },
  { category: 'timeline', keywords: ['timeline', 'roadmap', 'steps', 'milestones'] },
  { category: 'blog', keywords: ['blog', 'article', 'news', 'post'] },
  { category: 'gallery', keywords: ['gallery', 'portfolio', 'showcase'] },
  { category: 'ecommerce', keywords: ['product', 'products', 'shop', 'store', 'ecommerce'] },
  { category: 'social-proof', keywords: ['social proof', 'customer logos', 'trusted by'] },
  { category: 'pricing', keywords: ['pricing', 'price', 'plan', 'subscription'] },
  { category: 'cta', keywords: ['cta', 'call to action', 'primary action'] },
  { category: 'faq', keywords: ['faq', 'questions', 'help', 'support'] },
  { category: 'contact', keywords: ['contact', 'kontakt', 'message', 'form'] },
  { category: 'footer', keywords: ['footer', 'impressum', 'legal'] },
  { category: 'dashboard', keywords: ['dashboard', 'overview', 'admin', 'panel'] },
  { category: 'sidebar', keywords: ['sidebar', 'navigation rail'] },
  { category: 'auth', keywords: ['auth', 'login', 'signin', 'signup', 'register'] },
  { category: 'stats', keywords: ['stats', 'kpi', 'metric', 'metrics'] },
  { category: 'chart', keywords: ['chart', 'graph', 'diagram', 'report'] },
  { category: 'modal', keywords: ['modal', 'dialog', 'popup'] },
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function isLikelySectionFile(path: string): boolean {
  const normalized = normalizePath(path);
  if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) return false;
  return (
    normalized.startsWith('src/components/sections/') ||
    normalized.startsWith('src/components/dashboard/') ||
    normalized.startsWith('src/components/auth/') ||
    normalized.startsWith('src/components/ui/')
  );
}

function inferCategoryFromPath(path: string): BlockCategory | null {
  const normalized = normalizePath(path).toLowerCase();
  const filename = normalized.split('/').pop() || '';

  if (normalized.includes('/sections/navbar') || filename.includes('navbar') || filename.includes('header')) return 'navbar';
  if (normalized.includes('/sections/banner') || filename.includes('banner') || filename.includes('announcement')) return 'banner';
  if (normalized.includes('/sections/hero') || filename.includes('hero')) return 'hero';
  if (normalized.includes('/sections/feature') || filename.includes('feature')) return 'features';
  if (normalized.includes('/sections/testimonial') || filename.includes('testimonial') || filename.includes('review')) return 'testimonials';
  if (normalized.includes('/sections/team') || filename.includes('team') || filename.includes('about')) return 'team';
  if (normalized.includes('/sections/timeline') || filename.includes('timeline') || filename.includes('roadmap')) return 'timeline';
  if (normalized.includes('/sections/blog') || filename.includes('blog') || filename.includes('article') || filename.includes('post')) return 'blog';
  if (normalized.includes('/sections/gallery') || filename.includes('gallery') || filename.includes('portfolio')) return 'gallery';
  if (normalized.includes('/sections/ecommerce') || filename.includes('product') || filename.includes('shop') || filename.includes('store')) return 'ecommerce';
  if (normalized.includes('/sections/social') || filename.includes('socialproof') || filename.includes('social-proof')) return 'social-proof';
  if (normalized.includes('/sections/pricing') || filename.includes('pricing') || filename.includes('plan')) return 'pricing';
  if (normalized.includes('/sections/cta') || filename.includes('cta')) return 'cta';
  if (normalized.includes('/sections/faq') || filename.includes('faq')) return 'faq';
  if (normalized.includes('/sections/contact') || filename.includes('contact')) return 'contact';
  if (normalized.includes('/sections/footer') || filename.includes('footer')) return 'footer';
  if (normalized.includes('/dashboard/') || filename.includes('dashboard') || filename.includes('overview')) return 'dashboard';
  if (filename.includes('sidebar') || normalized.includes('/layout/sidebar')) return 'sidebar';
  if (normalized.includes('/auth/') || filename.includes('login') || filename.includes('register') || filename.includes('auth')) return 'auth';
  if (filename.includes('stats') || filename.includes('kpi') || filename.includes('metric')) return 'stats';
  if (filename.includes('chart') || filename.includes('graph') || filename.includes('report')) return 'chart';
  if (filename.includes('modal') || filename.includes('dialog')) return 'modal';

  return null;
}

function inferTargetCategories(prompt: string, aiCategories: BlockCategory[] = []): BlockCategory[] {
  const lower = prompt.toLowerCase();
  const categories = new Set<BlockCategory>();

  SECTION_KEYWORDS.forEach((entry) => {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      categories.add(entry.category);
    }
  });

  // Rename/brand updates usually touch visible brand text in navbar/hero/footer.
  if (
    /\b(rename|umbenenn|name ändern|name aendern|namen zu|brand name|projektname|appname)\b/.test(lower) ||
    lower.includes('selected element') ||
    lower.includes('<h1')
  ) {
    categories.add('navbar');
    categories.add('hero');
    categories.add('footer');
  }

  aiCategories.forEach((category) => categories.add(category));
  return [...categories];
}

function buildInstructionSuffix(plan: SectionRegenerationPlan): string {
  if (plan.mode !== 'section-isolated') return '';

  const fileList = plan.allowedUpdatePaths
    .map((path) => `- ${path}`)
    .join('\n');

  return `\n\nSection isolation mode is active.
Intent: ${plan.semantic.intent} (${plan.semantic.scope}, intensity: ${plan.semantic.intensity})
Confidence: ${plan.semantic.confidence.toFixed(2)}
Only modify these files:
${fileList}
Do not rewrite unrelated files. Keep untouched sections exactly as-is.`;
}

export function createSectionRegenerationPlan(input: CreateSectionRegenerationInput): SectionRegenerationPlan {
  const lowerPrompt = input.prompt.toLowerCase();
  const hintCategories = (input.aiHint?.targetedCategories || []).filter(Boolean);
  const targetCategories = inferTargetCategories(input.prompt, hintCategories);
  const existingSectionPaths = Object.keys(input.existingFiles)
    .map(normalizePath)
    .filter(isLikelySectionFile)
    .sort();
  const existingSectionEntries = existingSectionPaths.map((path) => ({
    path,
    category: inferCategoryFromPath(path),
  }));

  const targetBlockEntries = input.resolvedBlockIds
    .map((id) => getBlockById(id))
    .filter((block): block is NonNullable<typeof block> => Boolean(block))
    .map((block) => ({ path: normalizePath(block.filePath), category: block.category }));
  const targetCategorySet = new Set(targetCategories);
  const existingCategoryMatches = existingSectionEntries
    .filter((entry) => entry.category && targetCategorySet.has(entry.category))
    .map((entry) => entry.path);
  const plannedCategoryMatches = targetBlockEntries
    .filter((entry) => targetCategorySet.size > 0 && targetCategorySet.has(entry.category))
    .map((entry) => entry.path);
  const fallbackPlanned = targetBlockEntries.map((entry) => entry.path);
  const targetSectionPaths = [...new Set(
    input.generationMode === 'new'
      ? fallbackPlanned
      : (existingCategoryMatches.length > 0
        ? existingCategoryMatches
        : plannedCategoryMatches)
  )].sort();

  const added = targetSectionPaths.filter((path) => !existingSectionPaths.includes(path));
  const removed = input.generationMode === 'new'
    ? existingSectionPaths.filter((path) => !targetSectionPaths.includes(path))
    : [];
  const unchanged = targetSectionPaths.filter((path) => existingSectionPaths.includes(path));
  const structuralChange = added.length > 0 || removed.length > 0;
  const semantic = classifyPromptSemanticDiff({
    prompt: input.prompt,
    generationMode: input.generationMode,
    structuralChange,
    targetedCategories: targetCategories,
  });

  if (input.generationMode === 'new') {
    const allowedUpdatePaths = [...new Set(['src/App.tsx', ...targetSectionPaths])];
    const fullPlan: SectionRegenerationPlan = {
      mode: 'full-project',
      allowAppUpdate: true,
      allowedUpdatePaths,
      instructionSuffix: '',
      diff: {
        existingSectionPaths,
        targetSectionPaths,
        added,
        removed,
        unchanged,
        targetedCategories: targetCategories,
        structuralChange,
      },
      semantic,
    };
    return fullPlan;
  }

  const narrowedPaths = targetBlockEntries
    .filter((entry) => targetCategorySet.size === 0 || targetCategorySet.has(entry.category))
    .map((entry) => entry.path);

  const allowedUpdateSet = new Set<string>();
  const hasVisualElementTarget = lowerPrompt.includes('selected element') || /<h[1-6]\b/.test(lowerPrompt);
  const forceGlobalScopeByHint = input.aiHint?.scope === 'global';
  const forceAppUpdateByHint = input.aiHint?.forceAppUpdate === true;
  const forceStructureScope =
    structuralChange ||
    semantic.touchesStructure ||
    semantic.intent === 'layout-change' ||
    hasVisualElementTarget ||
    forceAppUpdateByHint;

  if (forceStructureScope || forceGlobalScopeByHint) {
    allowedUpdateSet.add('src/App.tsx');
    const structuralPaths = forceGlobalScopeByHint
      ? (existingSectionPaths.length > 0 ? existingSectionPaths : targetSectionPaths)
      : (targetSectionPaths.length > 0 ? targetSectionPaths : existingSectionPaths);
    structuralPaths.forEach((path) => allowedUpdateSet.add(path));
  } else {
    const effectivePaths = semantic.scope === 'section'
      ? (targetSectionPaths.length > 0 ? targetSectionPaths : narrowedPaths)
      : (
        targetSectionPaths.length > 0
          ? targetSectionPaths
          : (
            semantic.intent === 'mixed'
              ? (existingSectionPaths.length > 0 ? existingSectionPaths : [])
              : existingSectionPaths
          )
      );
    effectivePaths.forEach((path) => allowedUpdateSet.add(path));
    // Keep App stable unless structure changes, but allow minimal fallback edits.
    if (effectivePaths.length === 0 && existingSectionPaths.length === 0) {
      allowedUpdateSet.add('src/App.tsx');
    }
  }

  const plan: SectionRegenerationPlan = {
    mode: 'section-isolated',
    allowAppUpdate: forceStructureScope || forceGlobalScopeByHint,
    allowedUpdatePaths: [...allowedUpdateSet],
    instructionSuffix: '',
    diff: {
      existingSectionPaths,
      targetSectionPaths,
      added,
      removed,
      unchanged,
      targetedCategories: targetCategories,
      structuralChange,
    },
    semantic,
  };
  plan.instructionSuffix = buildInstructionSuffix(plan);
  return plan;
}

export function applySectionUpdateGuard(
  assembledFiles: Record<string, string>,
  existingFiles: Record<string, string>,
  plan: SectionRegenerationPlan
): Record<string, string> {
  if (plan.mode !== 'section-isolated') return assembledFiles;

  const guarded = { ...assembledFiles };
  const allowed = new Set(plan.allowedUpdatePaths.map(normalizePath));

  for (const [path, content] of Object.entries(existingFiles)) {
    const normalized = normalizePath(path);
    if (normalized === 'src/App.tsx' && !plan.allowAppUpdate) {
      guarded[normalized] = content;
      continue;
    }

    if (isLikelySectionFile(normalized) && !allowed.has(normalized)) {
      guarded[normalized] = content;
    }
  }

  return guarded;
}

export function filterFilesForSectionContext(
  files: Record<string, string>,
  plan: SectionRegenerationPlan
): Record<string, string> {
  if (plan.mode !== 'section-isolated') return files;

  const allow = new Set(plan.allowedUpdatePaths.map(normalizePath));
  const keepAlways = new Set([
    'src/main.tsx',
    'src/index.css',
    'src/App.css',
    'src/vite-env.d.ts',
  ]);
  if (plan.allowAppUpdate) {
    keepAlways.add('src/App.tsx');
  }
  const context: Record<string, string> = {};

  Object.entries(files).forEach(([path, content]) => {
    const normalized = normalizePath(path);
    if (allow.has(normalized) || keepAlways.has(normalized)) {
      context[normalized] = content;
      return;
    }

    if (plan.allowAppUpdate && normalized.startsWith('src/components/layout/')) {
      context[normalized] = content;
    }
  });

  return context;
}
