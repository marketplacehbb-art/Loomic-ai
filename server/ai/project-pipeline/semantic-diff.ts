import type { BlockCategory } from '../template-library/types.js';

export type EditIntent =
  | 'content-only'
  | 'styling-only'
  | 'layout-change'
  | 'feature-addition'
  | 'mixed';

export type EditScope = 'section' | 'global';
export type EditIntensity = 'low' | 'medium' | 'high';

export interface SemanticDiffResult {
  intent: EditIntent;
  scope: EditScope;
  intensity: EditIntensity;
  confidence: number;
  targetedCategories: BlockCategory[];
  reasons: string[];
  touchesStructure: boolean;
}

interface ClassifyInput {
  prompt: string;
  generationMode: 'new' | 'edit';
  structuralChange: boolean;
  targetedCategories: BlockCategory[];
}

const CONTENT_KEYWORDS = [
  'text', 'copy', 'headline', 'title', 'subtitle', 'wording', 'beschreibung', 'beschreibungstext',
  'Ã¼berschrift', 'ueberschrift', 'content', 'translate', 'Ã¼bersetzen', 'uebersetzen', 'sprache', 'language'
];

const STYLE_KEYWORDS = [
  'style', 'styling', 'modern', 'design', 'theme', 'color', 'farben', 'palette', 'typography', 'font',
  'spacing', 'abstand', 'ui', 'look', 'dark mode', 'light mode', 'mehr modern', 'moderner',
  'background', 'hintergrund', 'gold', 'golden', 'elegant', 'edgy', 'premium'
];

const LAYOUT_KEYWORDS = [
  'layout', 'structure', 'struktur', 'reorder', 'move section', 'verschieben', 'grid', 'columns',
  'sidebar', 'navigation', 'navbar', 'route', 'page', 'seitenaufbau'
];

const FEATURE_KEYWORDS = [
  'add', 'hinzufuegen', 'hinzufügen', 'include', 'implement', 'integrier', 'new feature', 'neues feature',
  'support', 'enable', 'auth', 'login', 'register', 'dashboard', 'chart', 'payment', 'api',
  'fuege', 'füge', 'hinzu', 'einkaufswagen', 'warenkorb', 'cart', 'shopping cart'
];

const SECTION_SCOPE_KEYWORDS = [
  'only', 'nur', 'just', 'lediglich', 'dieses', 'this section', 'hero', 'feature section', 'pricing section'
];

const GLOBAL_SCOPE_KEYWORDS = [
  'all', 'gesamte', 'komplett', 'Ã¼berall', 'everywhere', 'entire', 'whole', 'alle seiten', 'all pages'
];

const PRESERVE_LAYOUT_SIGNALS = [
  'keep layout',
  'dont change layout',
  "don't change layout",
  'without layout change',
  'ohne layout',
  'layout beibehalten',
  'struktur beibehalten',
  'kein layout Ã¤ndern',
  'kein layout aendern',
];

function countKeywordHits(input: string, keywords: string[]): number {
  const lower = input.toLowerCase();
  return keywords.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0), 0);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function inferScope(prompt: string, targetedCategories: BlockCategory[]): EditScope {
  const sectionHits = countKeywordHits(prompt, SECTION_SCOPE_KEYWORDS);
  const globalHits = countKeywordHits(prompt, GLOBAL_SCOPE_KEYWORDS);
  if (globalHits > sectionHits) return 'global';
  if (sectionHits > 0 || targetedCategories.length > 0) return 'section';
  return 'global';
}

function inferIntensity(scores: Record<'content' | 'style' | 'layout' | 'feature', number>, structuralChange: boolean): EditIntensity {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (structuralChange || scores.layout >= 2 || scores.feature >= 2) return 'high';
  if (total >= 3) return 'medium';
  return 'low';
}

function inferIntent(
  scores: Record<'content' | 'style' | 'layout' | 'feature', number>,
  structuralChange: boolean
): { intent: EditIntent; reasons: string[]; touchesStructure: boolean } {
  const reasons: string[] = [];
  const hasContent = scores.content > 0;
  const hasStyle = scores.style > 0;
  const hasLayout = scores.layout > 0;
  const hasFeature = scores.feature > 0;

  if (structuralChange) {
    reasons.push('Structural diff indicates section graph changes.');
  }

  if (hasFeature && (scores.feature >= scores.layout || !hasLayout)) {
    reasons.push('Feature keywords detected.');
    const requiresStructure = structuralChange || hasLayout;
    if (requiresStructure) {
      reasons.push('Feature request appears to require structural updates.');
    } else {
      reasons.push('Feature request appears incremental (non-structural).');
    }
    return { intent: 'feature-addition', reasons, touchesStructure: requiresStructure };
  }

  if (hasLayout || structuralChange) {
    reasons.push('Layout/structure keywords detected.');
    return { intent: 'layout-change', reasons, touchesStructure: true };
  }

  if (hasStyle && !hasContent) {
    reasons.push('Style/design keywords detected without content-change signal.');
    return { intent: 'styling-only', reasons, touchesStructure: false };
  }

  if (hasContent && !hasStyle) {
    reasons.push('Copy/content keywords detected without style-change signal.');
    return { intent: 'content-only', reasons, touchesStructure: false };
  }

  if (hasContent && hasStyle) {
    reasons.push('Both content and style keywords detected.');
    return { intent: 'mixed', reasons, touchesStructure: false };
  }

  reasons.push('No strong intent keyword match; defaulting to mixed.');
  return { intent: 'mixed', reasons, touchesStructure: false };
}

export function classifyPromptSemanticDiff(input: ClassifyInput): SemanticDiffResult {
  const lower = input.prompt.toLowerCase();
  const preserveLayout = PRESERVE_LAYOUT_SIGNALS.some((token) => lower.includes(token));

  const scores = {
    content: countKeywordHits(input.prompt, CONTENT_KEYWORDS),
    style: countKeywordHits(input.prompt, STYLE_KEYWORDS),
    layout: countKeywordHits(input.prompt, LAYOUT_KEYWORDS),
    feature: countKeywordHits(input.prompt, FEATURE_KEYWORDS),
  };
  if (preserveLayout) {
    scores.layout = 0;
  }

  const intentResult = inferIntent(scores, input.structuralChange);
  const scope = inferScope(input.prompt, input.targetedCategories);
  const intensity = inferIntensity(scores, input.structuralChange);

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const dominant = Math.max(scores.content, scores.style, scores.layout, scores.feature);
  const confidence = input.generationMode === 'new'
    ? 1
    : clamp((dominant + (input.structuralChange ? 1 : 0)) / Math.max(1, total + 1));

  return {
    intent: input.generationMode === 'new' ? 'feature-addition' : intentResult.intent,
    scope,
    intensity,
    confidence,
    targetedCategories: input.targetedCategories,
    reasons: preserveLayout
      ? [...intentResult.reasons, 'Explicit request to preserve layout detected.']
      : intentResult.reasons,
    touchesStructure: input.generationMode === 'new' ? true : intentResult.touchesStructure,
  };
}

