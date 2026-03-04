import { type SupportedProvider } from './generate-validation.js';
import { normalizeGeneratedPathSafe } from './generate-path-utils.js';

export type PipelinePath = 'fast' | 'deep';

export interface TokenBudgetDecision {
    provider: SupportedProvider;
    requestedMaxTokens?: number;
    generationMaxTokens: number;
    repairMaxTokens: number;
    repairAttempts: number;
    reason: string;
}

export type ComplexPromptMode = 'simple' | 'interactive' | 'data-heavy' | 'fullstack';

export interface ComplexPromptRouteProfile {
    enabled: boolean;
    mode: ComplexPromptMode;
    forcePhase1: boolean;
    forceMultiFile: boolean;
    forceDependencyAnalysis: boolean;
    promptLimit: number;
    systemLimit: number;
    reason: string;
}

export function isStyleIntentPrompt(prompt: string): boolean {
    return /(hintergrund|background|theme|palette|farbe|farben|style|styling|design|schoener|schöner|modern|premium|gold|golden|gradient|typography|font|shadow|radius)/i.test(prompt);
}

export function clampTokens(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function createTokenBudget(input: {
    provider: SupportedProvider;
    requestedMaxTokens?: number;
    generationMode: 'new' | 'edit';
    pipelinePath?: PipelinePath;
    prompt?: string;
    semantic: {
        intent: string;
        intensity: 'low' | 'medium' | 'high';
        touchesStructure: boolean;
    };
}): TokenBudgetDecision {
    // Generation is routed through DeepSeek as primary model in the runtime manager.
    // Keep caps aligned with DeepSeek capacity to avoid under-sized outputs.
    const providerHardCap: Record<SupportedProvider, number> = {
        gemini: 8000,
        groq: 8000,
        openai: 8000,
        nvidia: 8000,
    };

    const cap = providerHardCap[input.provider];
    const baseByMode = input.generationMode === 'new' ? 4200 : 3200;

    let generationTarget = baseByMode;
    if (input.semantic.intent === 'layout-change' || input.semantic.intent === 'feature-addition') {
        generationTarget += 700;
    }
    if (input.semantic.intensity === 'high' || input.semantic.touchesStructure) {
        generationTarget += 900;
    } else if (input.semantic.intensity === 'low') {
        generationTarget -= 500;
    }
    const promptLower = String(input.prompt || '').toLowerCase();
    const hasComplexDomainSignal = /kanban|trello|drag-and-drop|drag and drop|dijkstra|pathfinding|inventory|invoice|split-bill|split bill|calculator|@react-pdf\/renderer|pdf/.test(promptLower);
    if (hasComplexDomainSignal) {
        generationTarget += 1200;
    }

    const requested = typeof input.requestedMaxTokens === 'number' ? input.requestedMaxTokens : undefined;
    const requestedSafe = typeof requested === 'number'
        ? Math.max(256, Math.min(cap, Math.floor(requested)))
        : undefined;
    const generationFloor = requestedSafe ? Math.min(900, requestedSafe) : 1400;
    let generationMaxTokens = clampTokens(
        requestedSafe ? Math.min(requestedSafe, generationTarget) : generationTarget,
        generationFloor,
        cap
    );
    if (input.pipelinePath === 'fast') {
        generationMaxTokens = Math.min(generationMaxTokens, 3200);
    }
    const repairFloor = requestedSafe ? Math.min(700, requestedSafe) : 900;
    let repairMaxTokens = clampTokens(Math.round(generationMaxTokens * 0.65), repairFloor, Math.min(cap, 5200));
    const repairAttempts = 2;
    return {
        provider: input.provider,
        requestedMaxTokens: requested,
        generationMaxTokens,
        repairMaxTokens,
        repairAttempts,
        reason: `provider_cap=${cap}, deepseek_routed=true, mode=${input.generationMode}, intent=${input.semantic.intent}, intensity=${input.semantic.intensity}, complex=${hasComplexDomainSignal}`,
    };
}

export function classifyComplexPromptRoute(input: {
    generationMode: 'new' | 'edit';
    prompt: string;
    semantic: {
        intent: string;
        intensity: 'low' | 'medium' | 'high';
        touchesStructure: boolean;
    };
    projectType: string;
    pageCount: number;
    features: string[];
    domainPackIds: string[];
    backendIntentDetected: boolean;
    plannedCreates: number;
    plannedUpdates: number;
}): ComplexPromptRouteProfile {
    const promptLower = String(input.prompt || '').toLowerCase();
    const featureSet = new Set((input.features || []).map((feature) => String(feature).toLowerCase()));
    const domainSet = new Set((input.domainPackIds || []).map((id) => String(id).toLowerCase()));
    const totalPlannedFiles = Math.max(0, input.plannedCreates) + Math.max(0, input.plannedUpdates);

    const fullstackSignal =
        input.backendIntentDetected ||
        /\b(database|supabase|sql|api|backend|serverless|server|webhook|auth)\b/.test(promptLower) ||
        featureSet.has('auth');

    const dataHeavySignal =
        /dashboard|chart|table|analytics|portfolio|sort|filter|crypto|report|inventory|invoice/.test(promptLower) ||
        domainSet.has('inventory-invoice') ||
        featureSet.has('dashboard') ||
        featureSet.has('chart') ||
        featureSet.has('inventory') ||
        featureSet.has('invoice');

    const interactiveSignal =
        /drag-and-drop|drag and drop|slider|modal|search|confetti|toggle|wizard|multi-step|calculator|kanban|split-bill|split bill|localstorage|persist/.test(promptLower) ||
        domainSet.has('kanban') ||
        featureSet.has('modal') ||
        featureSet.has('calculator') ||
        featureSet.has('kanban') ||
        featureSet.has('pathfinding') ||
        featureSet.has('cart');

    let mode: ComplexPromptMode = 'simple';
    if (fullstackSignal) {
        mode = 'fullstack';
    } else if (dataHeavySignal) {
        mode = 'data-heavy';
    } else if (interactiveSignal) {
        mode = 'interactive';
    }

    const structurallyComplex =
        input.generationMode === 'new' &&
        (
            input.pageCount > 1 ||
            totalPlannedFiles >= 6 ||
            input.semantic.touchesStructure ||
            input.semantic.intensity === 'high' ||
            mode !== 'simple'
        );

    return {
        enabled: structurallyComplex,
        mode,
        forcePhase1: structurallyComplex,
        forceMultiFile: structurallyComplex && (mode !== 'simple' || totalPlannedFiles >= 6),
        forceDependencyAnalysis: structurallyComplex && mode !== 'simple',
        promptLimit: structurallyComplex
            ? (mode === 'fullstack' ? 30000 : mode === 'data-heavy' ? 22000 : 18000)
            : 22000,
        systemLimit: structurallyComplex
            ? (mode === 'fullstack' ? 28000 : mode === 'data-heavy' ? 20000 : 16000)
            : 24000,
        reason: `mode=${mode}, project=${input.projectType}, pages=${input.pageCount}, plannedFiles=${totalPlannedFiles}, semantic=${input.semantic.intent}/${input.semantic.intensity}`,
    };
}

export function buildComplexRouteDirective(input: {
    profile: ComplexPromptRouteProfile;
    filePlan: { create: string[]; update: string[] };
    sectionPlan: {
        allowedUpdatePaths: string[];
        semantic: {
            intent: string;
            intensity: 'low' | 'medium' | 'high';
            touchesStructure: boolean;
        };
    };
}): string {
    if (!input.profile.enabled) return '';

    const plannedPaths = Array.from(new Set([
        ...input.filePlan.create.map(normalizeGeneratedPathSafe),
        ...input.filePlan.update.map(normalizeGeneratedPathSafe),
        ...input.sectionPlan.allowedUpdatePaths.map(normalizeGeneratedPathSafe),
    ]))
        .filter((value): value is string => Boolean(value))
        .slice(0, 24);

    return `Complex route is enabled.
- route_mode: ${input.profile.mode}
- intent: ${input.sectionPlan.semantic.intent}
- intensity: ${input.sectionPlan.semantic.intensity}
- touches_structure: ${input.sectionPlan.semantic.touchesStructure ? 'yes' : 'no'}
- Prefer a multi-file project structure over a single App.tsx blob.
- Only import files that exist in the output.
- If you import CSS (for example ./App.css), include that file in the output.
- Create or update these target files when needed:
${plannedPaths.length > 0 ? plannedPaths.map((path) => `  - ${path}`).join('\n') : '  - src/App.tsx'}
- Return structured files JSON when possible; avoid prose wrappers.`;
}
