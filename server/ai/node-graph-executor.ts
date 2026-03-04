import { llmManager, type LLMRequest } from '../api/llm/manager.js';
import type { FeatureFlags } from '../config/feature-flags.js';
import { astRewriter, type RewriteResult } from './processor-evolution/ast-rewriter.js';
import { qualityScorer, type QualityScore } from './processor-evolution/quality-scorer.js';
import { styleDNAInjector, type StyleDNA } from './elite-features/style-dna-injector.js';
import { dependencyIntelligence, type DependencyAnalysis } from './elite-features/dependency-intelligence.js';
import { DESIGN_REFERENCE, STACK_CONSTRAINT } from '../prompts/designReferences.js';
import { hydratePrompt, type HydratedContext } from '../api/hydration.js';
import { SECTION_TEMPLATES, type SectionTemplateKey } from '../templates/sections/index.js';

export interface GenerateInput {
  provider: LLMRequest['provider'];
  generationMode: 'new' | 'edit';
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  currentFiles?: Record<string, string>;
  image?: string;
  knowledgeBase?: Array<{ path: string; content: string }>;
  featureFlags?: Partial<FeatureFlags>;
  signal?: AbortSignal;
  hydratedContext?: HydratedContext | null;
}

export interface Node<TInput = GenerateInput, TOutput = unknown> {
  name: string;
  deps: string[];
  run: (resolvedDeps: Record<string, unknown>, input: TInput) => Promise<TOutput>;
}

interface ContextNodeOutput {
  selectedFiles: Record<string, string>;
  selectedPaths: string[];
  totalChars: number;
}

interface TokenBudgetNodeOutput {
  generationMaxTokens: number;
  repairMaxTokens: number;
}

interface StyleDNANodeOutput {
  styleDNA: StyleDNA | null;
  constraints: string[];
}

interface DependencyIntelligenceNodeOutput {
  analysis: DependencyAnalysis | null;
  inferredDependencies: string[];
}

interface GenerationNodeOutput {
  rawCode: string;
  rateLimit?: any;
  effectivePrompt: string;
}

interface HydrationNodeOutput {
  hydratedContext: HydratedContext;
}

interface ASTRewriteNodeOutput {
  code: string;
  rewriteResult: RewriteResult | null;
}

interface QualityGateNodeOutput {
  code: string;
  qualityScore: QualityScore | null;
}

export interface GenerateResult {
  code: string;
  files: Array<{ path: string; content: string }>;
  rateLimit?: any;
  nodeOutputs: Record<string, unknown>;
  metadata: {
    styleDNA?: StyleDNA | null;
    dependencyAnalysis?: DependencyAnalysis | null;
    qualityScore?: QualityScore | null;
    selectedContextPaths: string[];
    hydratedContext?: HydratedContext | null;
  };
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const inferDepsFromPrompt = (prompt: string): string[] => {
  const lower = String(prompt || '').toLowerCase();
  const deps = new Set<string>();
  if (/chart|analytics|diagram/.test(lower)) deps.add('recharts');
  if (/animation|motion/.test(lower)) deps.add('framer-motion');
  if (/icon|icons|symbol/.test(lower)) deps.add('lucide-react');
  if (/route|routing|navigation/.test(lower)) deps.add('react-router-dom');
  if (/toast|notification/.test(lower)) deps.add('sonner');
  return [...deps];
};

const buildStyleConstraints = (prompt: string): string[] => {
  const lower = String(prompt || '').toLowerCase();
  const constraints: string[] = [];
  if (/lux|elegant|premium|gold/.test(lower)) constraints.push('Design direction: premium, elegant, high contrast accents.');
  if (/minimal|clean/.test(lower)) constraints.push('Design direction: minimal, reduced visual noise.');
  if (/dark/.test(lower)) constraints.push('Theme preference: dark-first palette.');
  if (/mobile|responsive/.test(lower)) constraints.push('Layout preference: mobile-first responsiveness.');
  return constraints;
};

const buildGenerationPrompt = (
  basePrompt: string,
  styleOutput: StyleDNANodeOutput | null,
  depOutput: DependencyIntelligenceNodeOutput | null,
  contextOutput: ContextNodeOutput | null,
  hydrationOutput: HydrationNodeOutput | null
): string => {
  const parts: string[] = [basePrompt.trim()];

  if (hydrationOutput?.hydratedContext) {
    const hydrated = hydrationOutput.hydratedContext;
    const componentHints = Array.isArray(hydrated.componentList) && hydrated.componentList.length > 0
      ? hydrated.componentList.join(', ')
      : 'none';
    parts.push(
      `HYDRATION_CONTEXT:\n- intent: ${hydrated.intent}\n- components: ${componentHints}\n- colorScheme: ${hydrated.colorScheme}\n- complexity: ${hydrated.complexity}`
    );
  }

  if (styleOutput?.constraints?.length) {
    parts.push(`STYLE_CONSTRAINTS:\n- ${styleOutput.constraints.join('\n- ')}`);
  }

  if (depOutput?.inferredDependencies?.length) {
    parts.push(`DEPENDENCY_HINTS:\n- ${depOutput.inferredDependencies.join('\n- ')}`);
  }

  if (contextOutput) {
    parts.push(
      `CONTEXT_HINTS:\n- selected files: ${contextOutput.selectedPaths.length}\n- total chars: ${contextOutput.totalChars}`
    );
  }

  return parts.filter(Boolean).join('\n\n');
};

const selectSectionTemplateReferences = (
  hydratedContext: HydratedContext | null | undefined
): Array<{ key: SectionTemplateKey; code: string }> => {
  const componentHints = Array.isArray(hydratedContext?.componentList)
    ? hydratedContext.componentList
    : [];
  if (componentHints.length === 0) return [];

  const matched = new Set<SectionTemplateKey>();
  const normalizedHints = componentHints
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);

  for (const hint of normalizedHints) {
    if (hint.includes('hero')) matched.add('HeroWithGradient');
    if (hint.includes('feature') || hint.includes('cardgrid') || hint.includes('grid')) matched.add('FeatureGrid');
    if (hint.includes('pricing') || hint.includes('plan') || hint.includes('tier')) matched.add('PricingCards');
    if (hint.includes('testimonial') || hint.includes('review')) matched.add('TestimonialsGrid');
    if (hint.includes('faq') || hint.includes('question')) matched.add('FAQAccordion');
    if (hint.includes('navbar') || hint === 'nav' || hint.includes('menu') || hint.includes('header')) matched.add('NavbarSimple');
    if (hint.includes('footer')) matched.add('FooterMultiColumn');
  }

  return [...matched].map((key) => ({ key, code: SECTION_TEMPLATES[key] }));
};

const appendSectionTemplateReferencesToPrompt = (
  prompt: string,
  references: Array<{ key: SectionTemplateKey; code: string }>
): string => {
  if (!references.length) return prompt;
  const referenceBlock = references
    .map((entry) => `// TEMPLATE: ${entry.key}\n${entry.code}`)
    .join('\n\n');
  return `${prompt}\n\nUse these exact component patterns as reference for your implementation:\n\n${referenceBlock}`;
};

const ensureStackConstraintInSystemPrompt = (baseSystemPrompt: string | undefined): string => {
  const normalized = String(baseSystemPrompt || '').trim();
  if (normalized.includes('You generate EXCLUSIVELY:')) {
    return normalized;
  }
  if (!normalized) return STACK_CONSTRAINT;
  return `${STACK_CONSTRAINT}\n\n${normalized}`;
};

const injectDesignReferenceIntoPrompt = (userPrompt: string): string => {
  const normalizedPrompt = String(userPrompt || '').trim();
  if (!normalizedPrompt) {
    return `DESIGN_REFERENCE:\n${DESIGN_REFERENCE}`;
  }
  if (normalizedPrompt.includes('DESIGN_REFERENCE:')) {
    return normalizedPrompt;
  }
  return `DESIGN_REFERENCE:\n${DESIGN_REFERENCE}\n\nUSER_PROMPT:\n${normalizedPrompt}`;
};

const selectContextFiles = (files: Record<string, string> | undefined): ContextNodeOutput => {
  if (!files || Object.keys(files).length === 0) {
    return {
      selectedFiles: {},
      selectedPaths: [],
      totalChars: 0,
    };
  }

  const entries = Object.entries(files);
  const scorePath = (path: string): number => {
    const normalized = path.replace(/\\/g, '/');
    if (normalized === 'src/App.tsx') return 1000;
    if (normalized === 'src/main.tsx') return 900;
    if (normalized.startsWith('src/components/sections/')) return 800;
    if (normalized.startsWith('src/components/')) return 700;
    if (normalized.startsWith('src/pages/')) return 650;
    if (normalized.startsWith('src/')) return 500;
    return 100;
  };

  const selectedEntries = entries
    .sort((a, b) => scorePath(b[0]) - scorePath(a[0]))
    .slice(0, 12);

  const selectedFiles = selectedEntries.reduce<Record<string, string>>((acc, [path, content]) => {
    acc[path] = content;
    return acc;
  }, {});

  const totalChars = selectedEntries.reduce((sum, [, content]) => sum + content.length, 0);
  return {
    selectedFiles,
    selectedPaths: selectedEntries.map(([path]) => path),
    totalChars,
  };
};

const createContextNode = (): Node<GenerateInput, ContextNodeOutput> => ({
  name: 'ContextNode',
  deps: [],
  run: async (_resolvedDeps, input) => selectContextFiles(input.currentFiles),
});

const createTokenBudgetNode = (): Node<GenerateInput, TokenBudgetNodeOutput> => ({
  name: 'TokenBudgetNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const generationMaxTokens = Math.max(256, Number(input.maxTokens) || 1800);
    return {
      generationMaxTokens,
      repairMaxTokens: Math.max(256, Math.floor(generationMaxTokens / 2)),
    };
  },
});

const createHydrationNode = (): Node<GenerateInput, HydrationNodeOutput> => ({
  name: 'HydrationNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    if (input.hydratedContext) {
      return { hydratedContext: input.hydratedContext };
    }
    const hydratedContext = await hydratePrompt(input.prompt, input.currentFiles || {});
    return { hydratedContext };
  },
});

const createStyleDNANode = (): Node<GenerateInput, StyleDNANodeOutput> => ({
  name: 'StyleDNANode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const styleEnabled = Boolean(input.featureFlags?.phase3?.styleDNA);
    const constraints = buildStyleConstraints(input.prompt);
    if (!styleEnabled || !input.currentFiles || Object.keys(input.currentFiles).length === 0) {
      return {
        styleDNA: null,
        constraints,
      };
    }

    const styleDNA = await styleDNAInjector.extractStyleDNA(input.currentFiles);
    return {
      styleDNA,
      constraints,
    };
  },
});

const createDependencyIntelligenceNode = (): Node<GenerateInput, DependencyIntelligenceNodeOutput> => ({
  name: 'DependencyIntelligenceNode',
  deps: [],
  run: async (_resolvedDeps, input) => {
    const fromPrompt = inferDepsFromPrompt(input.prompt);
    const sourceFiles = input.currentFiles || {};
    const primaryFile =
      sourceFiles['src/App.tsx'] ||
      Object.entries(sourceFiles).find(([path]) => /\.(tsx|ts|jsx|js)$/.test(path))?.[1] ||
      '';

    if (!primaryFile) {
      return {
        analysis: null,
        inferredDependencies: fromPrompt,
      };
    }

    const analysis = await dependencyIntelligence.analyze(primaryFile, 'App.tsx');
    const merged = new Set<string>([
      ...fromPrompt,
      ...analysis.dependencies.map((dep) => dep.name),
    ]);

    return {
      analysis,
      inferredDependencies: [...merged],
    };
  },
});

const createGenerationNode = (): Node<GenerateInput, GenerationNodeOutput> => ({
  name: 'GenerationNode',
  deps: ['ContextNode', 'TokenBudgetNode', 'StyleDNANode', 'DependencyIntelligenceNode'],
  run: async (resolvedDeps, input) => {
    const contextOutput = asRecord(resolvedDeps.ContextNode) as unknown as ContextNodeOutput;
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const styleOutput = asRecord(resolvedDeps.StyleDNANode) as unknown as StyleDNANodeOutput;
    const depOutput = asRecord(resolvedDeps.DependencyIntelligenceNode) as unknown as DependencyIntelligenceNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;

    const resolvedHydrationContext =
      hydrationOutput?.hydratedContext || input.hydratedContext || null;

    const effectivePromptBase = buildGenerationPrompt(
      input.prompt,
      styleOutput || null,
      depOutput || null,
      contextOutput || null,
      resolvedHydrationContext
        ? { hydratedContext: resolvedHydrationContext }
        : null
    );
    const selectedTemplateReferences = selectSectionTemplateReferences(resolvedHydrationContext);
    const effectivePrompt = appendSectionTemplateReferencesToPrompt(
      effectivePromptBase,
      selectedTemplateReferences
    );
    const effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(input.systemPrompt);
    const promptWithDesignReference = injectDesignReferenceIntoPrompt(effectivePrompt);

    const response = await llmManager.generate({
      provider: input.provider,
      generationMode: input.generationMode,
      prompt: promptWithDesignReference,
      systemPrompt: effectiveSystemPrompt,
      temperature: input.temperature ?? 0.7,
      maxTokens: tokenBudgetOutput?.generationMaxTokens || input.maxTokens || 1800,
      stream: false,
      currentFiles: contextOutput?.selectedFiles || input.currentFiles,
      image: input.image,
      knowledgeBase: input.knowledgeBase,
      featureFlags: input.featureFlags,
      signal: input.signal,
    });

    if (typeof response === 'object' && response && 'content' in response && !('getReader' in response)) {
      return {
        rawCode: String((response as any).content || ''),
        rateLimit: (response as any).rateLimit,
        effectivePrompt: promptWithDesignReference,
      };
    }

    if (typeof response === 'string') {
      return {
        rawCode: response,
        effectivePrompt: promptWithDesignReference,
      };
    }

    throw new Error('LLM returned unexpected response format');
  },
});

const createFastGenerationNode = (): Node<GenerateInput, GenerationNodeOutput> => ({
  name: 'GenerationNode',
  deps: ['TokenBudgetNode', 'HydrationNode'],
  run: async (resolvedDeps, input) => {
    const tokenBudgetOutput = asRecord(resolvedDeps.TokenBudgetNode) as unknown as TokenBudgetNodeOutput;
    const hydrationOutput = asRecord(resolvedDeps.HydrationNode) as unknown as HydrationNodeOutput;
    const effectivePrompt = buildGenerationPrompt(
      input.prompt,
      null,
      null,
      null,
      hydrationOutput?.hydratedContext
        ? hydrationOutput
        : (input.hydratedContext ? { hydratedContext: input.hydratedContext } : null)
    );
    const effectiveSystemPrompt = ensureStackConstraintInSystemPrompt(input.systemPrompt);
    const promptWithDesignReference = injectDesignReferenceIntoPrompt(effectivePrompt);

    const response = await llmManager.generate({
      provider: input.provider,
      generationMode: input.generationMode,
      prompt: promptWithDesignReference,
      systemPrompt: effectiveSystemPrompt,
      temperature: input.temperature ?? 0.7,
      maxTokens: tokenBudgetOutput?.generationMaxTokens || input.maxTokens || 1800,
      stream: false,
      currentFiles: input.currentFiles,
      image: input.image,
      knowledgeBase: input.knowledgeBase,
      featureFlags: input.featureFlags,
      signal: input.signal,
    });

    if (typeof response === 'object' && response && 'content' in response && !('getReader' in response)) {
      return {
        rawCode: String((response as any).content || ''),
        rateLimit: (response as any).rateLimit,
        effectivePrompt: promptWithDesignReference,
      };
    }

    if (typeof response === 'string') {
      return {
        rawCode: response,
        effectivePrompt: promptWithDesignReference,
      };
    }

    throw new Error('LLM returned unexpected response format');
  },
});

const createASTRewriteNode = (): Node<GenerateInput, ASTRewriteNodeOutput> => ({
  name: 'ASTRewriteNode',
  deps: ['GenerationNode'],
  run: async (resolvedDeps, input) => {
    const generationOutput = asRecord(resolvedDeps.GenerationNode) as unknown as GenerationNodeOutput;
    const sourceCode = String(generationOutput?.rawCode || '');
    if (!sourceCode) {
      throw new Error('GenerationNode returned empty code');
    }

    const astRewriteEnabled = Boolean(input.featureFlags?.phase2?.astRewrite);
    if (!astRewriteEnabled) {
      return {
        code: sourceCode,
        rewriteResult: null,
      };
    }

    const rewriteResult = await astRewriter.rewrite(sourceCode, 'App.tsx');
    return {
      code: rewriteResult.code || sourceCode,
      rewriteResult,
    };
  },
});

const createQualityGateNode = (): Node<GenerateInput, QualityGateNodeOutput> => ({
  name: 'QualityGateNode',
  deps: ['ASTRewriteNode'],
  run: async (resolvedDeps, input) => {
    const astOutput = asRecord(resolvedDeps.ASTRewriteNode) as unknown as ASTRewriteNodeOutput;
    const sourceCode = String(astOutput?.code || '');
    if (!sourceCode) {
      throw new Error('ASTRewriteNode returned empty code');
    }

    const qualityEnabled = Boolean(input.featureFlags?.phase2?.qualityScoring);
    if (!qualityEnabled) {
      return {
        code: sourceCode,
        qualityScore: null,
      };
    }

    const qualityScore = await qualityScorer.score(sourceCode, 'App.tsx');
    return {
      code: sourceCode,
      qualityScore,
    };
  },
});

export function createDefaultNodes(): Node[] {
  return [
    createContextNode(),
    createTokenBudgetNode(),
    createStyleDNANode(),
    createDependencyIntelligenceNode(),
    createGenerationNode(),
    createASTRewriteNode(),
    createQualityGateNode(),
  ];
}

export function createFastPathNodes(): Node[] {
  return [
    createTokenBudgetNode(),
    createHydrationNode(),
    createFastGenerationNode(),
    createASTRewriteNode(),
  ];
}

export async function runNodeGraph(nodes: Node[], input: GenerateInput): Promise<GenerateResult> {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('NodeGraph requires at least one node.');
  }

  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    if (!node?.name || typeof node.name !== 'string') {
      throw new Error('NodeGraph node is missing a valid name.');
    }
    if (nodeMap.has(node.name)) {
      throw new Error(`Duplicate node name in NodeGraph: ${node.name}`);
    }
    nodeMap.set(node.name, node);
  }

  for (const node of nodes) {
    for (const dep of node.deps || []) {
      if (!nodeMap.has(dep)) {
        throw new Error(`Node "${node.name}" depends on missing node "${dep}"`);
      }
    }
  }

  const resolved = new Map<string, unknown>();
  const pending = new Set<string>(nodeMap.keys());

  while (pending.size > 0) {
    const ready = [...pending].filter((nodeName) => {
      const node = nodeMap.get(nodeName)!;
      return (node.deps || []).every((depName) => resolved.has(depName));
    });

    if (ready.length === 0) {
      throw new Error(`NodeGraph deadlock detected. Unresolved nodes: ${[...pending].join(', ')}`);
    }

    const batch = await Promise.all(
      ready.map(async (nodeName) => {
        const node = nodeMap.get(nodeName)!;
        const resolvedDeps: Record<string, unknown> = {};
        (node.deps || []).forEach((depName) => {
          resolvedDeps[depName] = resolved.get(depName);
        });
        const output = await node.run(resolvedDeps, input);
        return { nodeName, output };
      })
    );

    batch.forEach(({ nodeName, output }) => {
      resolved.set(nodeName, output);
      pending.delete(nodeName);
    });
  }

  const nodeOutputs = Object.fromEntries(resolved.entries());
  const contextOutput = asRecord(nodeOutputs.ContextNode) as unknown as ContextNodeOutput;
  const generationOutput = asRecord(nodeOutputs.GenerationNode) as unknown as GenerationNodeOutput;
  const astOutput = asRecord(nodeOutputs.ASTRewriteNode) as unknown as ASTRewriteNodeOutput;
  const qualityOutput = asRecord(nodeOutputs.QualityGateNode) as unknown as QualityGateNodeOutput;
  const styleOutput = asRecord(nodeOutputs.StyleDNANode) as unknown as StyleDNANodeOutput;
  const depOutput = asRecord(nodeOutputs.DependencyIntelligenceNode) as unknown as DependencyIntelligenceNodeOutput;
  const hydrationOutput = asRecord(nodeOutputs.HydrationNode) as unknown as HydrationNodeOutput;

  const finalCode =
    String(qualityOutput?.code || '') ||
    String(astOutput?.code || '') ||
    String(generationOutput?.rawCode || '');

  if (!finalCode || !finalCode.trim()) {
    throw new Error('NodeGraph produced empty generation output.');
  }

  return {
    code: finalCode,
    files: [],
    rateLimit: generationOutput?.rateLimit,
    nodeOutputs,
    metadata: {
      styleDNA: styleOutput?.styleDNA || null,
      dependencyAnalysis: depOutput?.analysis || null,
      qualityScore: qualityOutput?.qualityScore || null,
      selectedContextPaths: contextOutput?.selectedPaths || [],
      hydratedContext: hydrationOutput?.hydratedContext || input.hydratedContext || null,
    },
  };
}
