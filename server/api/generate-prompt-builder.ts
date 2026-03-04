import { llmManager } from './llm/manager.js';
import { type SupportedProvider } from './generate-validation.js';
import type { BlockCategory } from '../ai/template-library/types.js';
import { type EditScope as RagEditScope } from '../ai/project-pipeline/context-injector.js';
import {
    inferFallbackEditScope,
    normalizeArchitectPaths,
} from './generate-architect-utils.js';
import { withTimeout } from './generate-edit-mode-utils.js';
import { EDIT_MODE_READ_ONLY_FILES } from './generate-path-utils.js';

export interface PromptUnderstandingResult {
    source: 'ai' | 'fallback';
    confidence: number;
    scope: 'section' | 'global';
    targetedCategories: BlockCategory[];
    forceAppUpdate: boolean;
    styleRequest: boolean;
    reasoning: string;
    impactedFiles: string[];
    forbiddenFiles: string[];
    editScope: RagEditScope;
}

const PROMPT_UNDERSTANDING_CACHE_TTL_MS = 5 * 60 * 1000;
const PROMPT_UNDERSTANDING_CACHE_MAX_ENTRIES = 200;
const promptUnderstandingCache = new Map<string, { expiresAt: number; value: PromptUnderstandingResult }>();

const PROMPT_UNDERSTANDING_CATEGORIES: BlockCategory[] = [
    'navbar',
    'banner',
    'hero',
    'features',
    'testimonials',
    'team',
    'timeline',
    'blog',
    'gallery',
    'ecommerce',
    'social-proof',
    'pricing',
    'cta',
    'faq',
    'contact',
    'footer',
    'dashboard',
    'sidebar',
    'auth',
    'stats',
    'chart',
    'modal',
];

export function normalizePromptUnderstandingCategory(input: string): BlockCategory | null {
    const value = input.toLowerCase().trim();
    if (PROMPT_UNDERSTANDING_CATEGORIES.includes(value as BlockCategory)) {
        return value as BlockCategory;
    }
    if (/header|menu|navigation|brand|logo/.test(value)) return 'navbar';
    if (/hero|headline/.test(value)) return 'hero';
    if (/feature|benefit|section/.test(value)) return 'features';
    if (/social proof/.test(value)) return 'social-proof';
    if (/testimonial|review/.test(value)) return 'testimonials';
    if (/team|about/.test(value)) return 'team';
    if (/timeline|roadmap|steps/.test(value)) return 'timeline';
    if (/blog|article|news/.test(value)) return 'blog';
    if (/gallery|portfolio|showcase/.test(value)) return 'gallery';
    if (/shop|product|store|ecommerce/.test(value)) return 'ecommerce';
    if (/cta|call to action/.test(value)) return 'cta';
    if (/faq|question|help/.test(value)) return 'faq';
    if (/contact|kontakt|form/.test(value)) return 'contact';
    if (/banner|announcement/.test(value)) return 'banner';
    if (/price|plan/.test(value)) return 'pricing';
    if (/footer|legal/.test(value)) return 'footer';
    if (/dashboard|admin/.test(value)) return 'dashboard';
    if (/sidebar/.test(value)) return 'sidebar';
    if (/auth|login|register/.test(value)) return 'auth';
    if (/stat|kpi|metric/.test(value)) return 'stats';
    if (/chart|graph|report/.test(value)) return 'chart';
    if (/modal|dialog|popup/.test(value)) return 'modal';
    return null;
}

export function buildPromptUnderstandingFallback(prompt: string): PromptUnderstandingResult {
    const lower = prompt.toLowerCase();
    const globalStyleSignal = /(hintergrund|background|theme|palette|farben|farbe|gold|golden|style|styling|design)/.test(lower);
    const styleSignal = /(hintergrund|background|theme|palette|farben|farbe|gold|golden|style|styling|design|schöner|schoener|modern|premium|elegant)/.test(lower);
    const explicitGlobalSignal = /(ganze seite|gesamte seite|überall|ueberall|global|all pages|whole page)/.test(lower);
    const scope: 'section' | 'global' = (globalStyleSignal || explicitGlobalSignal) ? 'global' : 'section';
    const forceAppUpdate = scope === 'global';
    const targetedCategories: BlockCategory[] = [];
    if (/nav|navbar|menu|header/.test(lower)) targetedCategories.push('navbar');
    if (/banner|announcement/.test(lower)) targetedCategories.push('banner');
    if (/hero|headline/.test(lower)) targetedCategories.push('hero');
    if (/feature|features/.test(lower)) targetedCategories.push('features');
    if (/testimonial|review/.test(lower)) targetedCategories.push('testimonials');
    if (/social proof/.test(lower)) targetedCategories.push('social-proof');
    if (/team|about/.test(lower)) targetedCategories.push('team');
    if (/timeline|roadmap|steps/.test(lower)) targetedCategories.push('timeline');
    if (/blog|article|news/.test(lower)) targetedCategories.push('blog');
    if (/gallery|portfolio|showcase/.test(lower)) targetedCategories.push('gallery');
    if (/shop|store|product|ecommerce/.test(lower)) targetedCategories.push('ecommerce');
    if (/cta|call to action/.test(lower)) targetedCategories.push('cta');
    if (/faq|question|help/.test(lower)) targetedCategories.push('faq');
    if (/contact|kontakt|form/.test(lower)) targetedCategories.push('contact');
    if (/pricing|preise|price/.test(lower)) targetedCategories.push('pricing');
    if (/footer/.test(lower)) targetedCategories.push('footer');

    const impactedFiles: string[] = [];
    if (targetedCategories.length > 0) {
        impactedFiles.push('src/App.tsx');
    }
    if (targetedCategories.includes('navbar')) impactedFiles.push('src/components/sections/Navbar.tsx');
    if (targetedCategories.includes('hero')) impactedFiles.push('src/components/sections/Hero.tsx');
    if (targetedCategories.includes('features')) impactedFiles.push('src/components/sections/Features.tsx');
    if (targetedCategories.includes('chart')) impactedFiles.push('src/components/sections/Charts.tsx');
    if (targetedCategories.includes('dashboard')) impactedFiles.push('src/pages/Dashboard.tsx');

    return {
        source: 'fallback',
        confidence: 0.45,
        scope,
        forceAppUpdate,
        styleRequest: styleSignal,
        targetedCategories: [...new Set(targetedCategories)],
        reasoning: 'Keyword fallback heuristic',
        impactedFiles: Array.from(new Set(impactedFiles)),
        forbiddenFiles: Array.from(EDIT_MODE_READ_ONLY_FILES),
        editScope: inferFallbackEditScope(prompt),
    };
}

export function createPromptUnderstandingCacheKey(input: {
    provider: SupportedProvider;
    generationMode: 'new' | 'edit';
    prompt: string;
    currentFiles: Record<string, string>;
}): string {
    const promptKey = (input.prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const fileKey = Object.keys(input.currentFiles || {})
        .map((path) => path.replace(/\\/g, '/').trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
    return `${input.provider}::${input.generationMode}::${promptKey}::${fileKey}`;
}

export function readPromptUnderstandingCache(key: string): PromptUnderstandingResult | null {
    const hit = promptUnderstandingCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        promptUnderstandingCache.delete(key);
        return null;
    }
    return hit.value;
}

export function writePromptUnderstandingCache(key: string, value: PromptUnderstandingResult): void {
    if (promptUnderstandingCache.size >= PROMPT_UNDERSTANDING_CACHE_MAX_ENTRIES) {
        const firstKey = promptUnderstandingCache.keys().next().value as string | undefined;
        if (firstKey) promptUnderstandingCache.delete(firstKey);
    }
    promptUnderstandingCache.set(key, {
        value,
        expiresAt: Date.now() + PROMPT_UNDERSTANDING_CACHE_TTL_MS,
    });
}

export function shouldUsePromptUnderstandingFastPath(input: {
    generationMode: 'new' | 'edit';
    prompt: string;
    currentFiles: Record<string, string>;
}): boolean {
    if (input.generationMode !== 'new') return false;
    if (Object.keys(input.currentFiles || {}).length > 0) return false;
    const prompt = (input.prompt || '').trim();
    if (prompt.length === 0 || prompt.length > 56) return false;
    const lower = prompt.toLowerCase();
    if (
        /api|backend|database|auth|fullstack|multi[-\s]?page|router|kanban|invoice|dashboard|chart|complex|refactor/.test(
            lower
        )
    ) {
        return false;
    }
    return true;
}

export async function inferPromptUnderstandingWithAI(input: {
    provider: SupportedProvider;
    generationMode: 'new' | 'edit';
    prompt: string;
    currentFiles: Record<string, string>;
    requestedMaxTokens?: number;
}): Promise<PromptUnderstandingResult> {
    const cacheKey = createPromptUnderstandingCacheKey(input);
    const cached = readPromptUnderstandingCache(cacheKey);
    if (cached) return cached;

    const fallback = buildPromptUnderstandingFallback(input.prompt);
    if (shouldUsePromptUnderstandingFastPath(input)) {
        const fastPathResult: PromptUnderstandingResult = {
            ...fallback,
            reasoning: `${fallback.reasoning} (phase4 fast-path: short prompt)`,
        };
        writePromptUnderstandingCache(cacheKey, fastPathResult);
        return fastPathResult;
    }
    const promptLength = Math.max(1, input.prompt.length);
    const providerCeiling: Record<SupportedProvider, number> = {
        gemini: 220,
        groq: 240,
        openai: 320,
        nvidia: 320,
    };
    const lengthTarget = Math.floor(promptLength / 18) + 120;
    const editBoost = input.generationMode === 'edit' ? 40 : 0;
    const requestedCap = typeof input.requestedMaxTokens === 'number'
        ? Math.max(96, Math.floor(input.requestedMaxTokens * 0.25))
        : Number.POSITIVE_INFINITY;
    const understandingMaxTokens = Math.max(
        96,
        Math.min(providerCeiling[input.provider] || 250, lengthTarget + editBoost, requestedCap)
    );

    const fileHints = Object.keys(input.currentFiles || {})
        .map((path) => path.replace(/\\/g, '/'))
        .slice(0, 20)
        .join(', ');

    const systemPrompt = `You classify UI edit prompts for a React project.
Return JSON only. No markdown.
Schema:
{
  "scope": "section" | "global",
  "editScope": "small_fix" | "style_tweak" | "component_update" | "refactor",
  "targetedCategories": ["navbar"|"banner"|"hero"|"features"|"testimonials"|"team"|"timeline"|"blog"|"gallery"|"ecommerce"|"social-proof"|"pricing"|"cta"|"faq"|"contact"|"footer"|"dashboard"|"sidebar"|"auth"|"stats"|"chart"|"modal"],
  "impactedFiles": ["src/..."],
  "forbiddenFiles": ["tailwind.config.ts", "vite.config.ts"],
  "forceAppUpdate": boolean,
  "styleRequest": boolean,
  "confidence": number,
  "reasoning": string
}`;

    const userPrompt = `Prompt:
${input.prompt}

Known files:
${fileHints || '(none)'}

Rules:
- If prompt requests global visual/style changes (e.g. background/theme/colors), set scope="global" and forceAppUpdate=true.
- If prompt is section-specific, set scope="section".
- Set editScope:
  - small_fix: tiny bugfix or single localized tweak
  - style_tweak: mainly visual/theme/color typography changes
  - component_update: normal component/page level feature update
  - refactor: broad structural rewrite
- Set styleRequest=true when prompt asks for style/look/theme/color/background changes.
- Choose only valid categories from schema list.
- Return impactedFiles with likely target source files.
- Return forbiddenFiles with files that must stay read-only (config/system files).
- Confidence in range 0..1.`;

    try {
        const response = await withTimeout(
            llmManager.generate({
                provider: input.provider,
                generationMode: input.generationMode,
                prompt: userPrompt,
                systemPrompt,
                temperature: 0,
                maxTokens: understandingMaxTokens,
                stream: false,
                currentFiles: {},
            }),
            15000
        );

        const content = typeof response === 'object' && 'content' in response && !('getReader' in response)
            ? ((response as any).content || '')
            : '';
        if (!content || typeof content !== 'string') return fallback;

        const jsonCandidateMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonCandidateMatch) return fallback;
        const parsed = JSON.parse(jsonCandidateMatch[0]);

        const categories = Array.isArray(parsed?.targetedCategories)
            ? parsed.targetedCategories
                .map((item: unknown) => normalizePromptUnderstandingCategory(String(item)))
                .filter((item: BlockCategory | null): item is BlockCategory => Boolean(item))
            : [];
        const uniqueCategories: BlockCategory[] = Array.from(new Set<BlockCategory>(categories));

        const scope: 'section' | 'global' = parsed?.scope === 'global' ? 'global' : 'section';
        const editScope: RagEditScope = (
            parsed?.editScope === 'small_fix' ||
            parsed?.editScope === 'style_tweak' ||
            parsed?.editScope === 'component_update' ||
            parsed?.editScope === 'refactor'
        )
            ? parsed.editScope
            : inferFallbackEditScope(input.prompt);
        const confidenceRaw = typeof parsed?.confidence === 'number' ? parsed.confidence : fallback.confidence;
        const confidence = Math.max(0, Math.min(1, confidenceRaw));
        const forceAppUpdate = Boolean(parsed?.forceAppUpdate) || scope === 'global';
        const styleRequest = typeof parsed?.styleRequest === 'boolean' ? parsed.styleRequest : fallback.styleRequest;
        const impactedFiles = normalizeArchitectPaths(parsed?.impactedFiles);
        const forbiddenFiles = normalizeArchitectPaths(parsed?.forbiddenFiles);
        const reasoning = typeof parsed?.reasoning === 'string' && parsed.reasoning.trim().length > 0
            ? parsed.reasoning.trim()
            : 'AI prompt understanding';

        const result: PromptUnderstandingResult = {
            source: 'ai',
            confidence,
            scope,
            forceAppUpdate,
            styleRequest,
            targetedCategories: uniqueCategories,
            reasoning,
            impactedFiles: impactedFiles.length > 0 ? impactedFiles : fallback.impactedFiles,
            forbiddenFiles: forbiddenFiles.length > 0 ? forbiddenFiles : fallback.forbiddenFiles,
            editScope,
        };
        writePromptUnderstandingCache(cacheKey, result);
        return result;
    } catch (error) {
        console.warn('[PromptUnderstanding] Falling back to keyword heuristic:', error);
        writePromptUnderstandingCache(cacheKey, fallback);
        return fallback;
    }
}
