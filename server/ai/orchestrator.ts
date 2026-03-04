import { LLMRequest } from './llm/manager.js';
import { getFeatureFlagsForRequest, FeatureFlags } from '../config/feature-flags.js';
import { specPass, SpecResult } from './intelligence-layer/spec-pass.js';
import { architecturePass, ArchitecturePlan } from './intelligence-layer/architecture-pass.js';
import { selfCritique, CritiqueResult } from './intelligence-layer/self-critique.js';
import { repairLoop, RepairLoopResult } from './intelligence-layer/repair-loop.js';
import { astRewriter, RewriteResult } from './processor-evolution/ast-rewriter.js';
import { qualityScorer, QualityScore } from './processor-evolution/quality-scorer.js';
import { multiFileGenerator, MultiFileResult } from './processor-evolution/multi-file-generator.js';
import { intentAgent, IntentResult } from './elite-features/intent-agent.js';
import { dynamicPromptConditioner, ConditionedPrompt } from './elite-features/dynamic-prompt-conditioner.js';
import { dependencyIntelligence, DependencyAnalysis } from './elite-features/dependency-intelligence.js';
import { styleDNAInjector, StyleDNA } from './elite-features/style-dna-injector.js';
import { componentMemory } from './elite-features/component-memory.js';
import { llmManager } from './llm/manager.js';

/**
 * Orchestrator - Coordinates all phases of the evolution system
 */
type ComplexityRoute = 'simple' | 'interactive' | 'data-heavy' | 'fullstack';

interface ComplexityProfile {
  route: ComplexityRoute;
  requiresArchitecture: boolean;
  requiresStructuredOutput: boolean;
  requiresMultiFile: boolean;
}

interface PassBudgets {
  spec: number;
  architecture: number;
  critique: number;
  repair: number;
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return name === 'AbortError' || /aborted|aborterror/i.test(message);
}

export interface OrchestrationResult {
  code: string;
  files?: Array<{ path: string; content: string }>; // Multi-file result
  metadata: {
    phase1?: {
      spec?: SpecResult;
      architecture?: ArchitecturePlan;
      critique?: CritiqueResult;
      repair?: RepairLoopResult;
    };
    phase2?: {
      astRewrite?: RewriteResult;
      qualityScore?: QualityScore;
      multiFile?: MultiFileResult;
    };
    phase3?: {
      intent?: IntentResult;
      conditionedPrompt?: ConditionedPrompt;
      dependencyAnalysis?: DependencyAnalysis;
      styleDNA?: StyleDNA;
      complexityProfile?: ComplexityProfile;
      componentMemory?: {
        stored: string[];
        reused: string[];
      };
    };
    flags: FeatureFlags;
  };
}

export class Orchestrator {
  /**
   * Orchestrate code generation through all enabled phases
   */
  async orchestrate(request: LLMRequest, context?: string): Promise<OrchestrationResult> {
    const flags = getFeatureFlagsForRequest(request.featureFlags);
    const metadata: OrchestrationResult['metadata'] = {
      flags,
    };
    const passBudgets = this.buildPassBudgets(request);

    let code: string;
    let spec: SpecResult | undefined;
    let architecturePlan: ArchitecturePlan | undefined;
    let intent: IntentResult | undefined;
    let conditionedRequest: LLMRequest = request;
    let styleDNA: StyleDNA | undefined;
    let mainRuntimePath = 'src/App.tsx';

    if (
      flags.phase3.intentAgent ||
      flags.phase3.dynamicPromptConditioning ||
      flags.phase3.styleDNA ||
      flags.phase3.componentMemory ||
      flags.phase3.dependencyIntelligence
    ) {
      metadata.phase3 = {};
    }

    // Phase 3: Elite Features (PRE-GENERATION: discovery only)
    if (flags.phase3.intentAgent) {
      console.log('[Orchestrator] Running Intent Agent...');
      try {
        intent = await intentAgent.detectIntent(request.prompt, request.currentFiles, request.signal);
        metadata.phase3!.intent = intent;
        console.log(`[Orchestrator] Intent detected: ${intent.intent} (confidence: ${intent.confidence})`);
      } catch (error: any) {
        if (isAbortError(error) || request.signal?.aborted) throw error;
        console.warn('[Orchestrator] Intent Agent failed:', error.message);
      }
    }

    if (flags.phase3.styleDNA && request.currentFiles && Object.keys(request.currentFiles).length > 0) {
      console.log('[Orchestrator] Extracting Style DNA...');
      try {
        styleDNA = await styleDNAInjector.extractStyleDNA(request.currentFiles);
        metadata.phase3!.styleDNA = styleDNA;
        console.log('[Orchestrator] Style DNA extracted');
      } catch (error: any) {
        if (isAbortError(error) || request.signal?.aborted) throw error;
        console.warn('[Orchestrator] Style DNA extraction failed:', error.message);
      }
    }

    if (flags.phase3.componentMemory) {
      console.log('[Orchestrator] Searching component memory...');
      try {
        const searchResult = await componentMemory.search(request.prompt, 3);
        if (searchResult.components.length > 0) {
          console.log(`[Orchestrator] Found ${searchResult.components.length} similar components in memory`);
        }
      } catch (error: any) {
        if (isAbortError(error) || request.signal?.aborted) throw error;
        console.warn('[Orchestrator] Component memory search failed:', error.message);
      }
    }

    // Phase 1: Intelligence Layer (analysis only)
    if (flags.phase1.specPass || flags.phase1.architecturePass || flags.phase1.selfCritique || flags.phase1.repairLoop) {
      metadata.phase1 = {};

      if (flags.phase1.specPass) {
        console.log('[Orchestrator] Running Spec Pass...');
        spec = await specPass.analyze(request.prompt, context, {
          provider: request.provider,
          maxTokens: passBudgets.spec,
          signal: request.signal,
        });
        metadata.phase1.spec = spec;
        console.log(`[Orchestrator] Spec Pass completed: ${spec.components.length} components identified`);
      }

      if (flags.phase1.architecturePass) {
        console.log('[Orchestrator] Running Architecture Pass...');
        architecturePlan = await architecturePass.createPlan(
          spec || this.createFallbackSpec(request.prompt),
          {
            ...request,
            maxTokens: passBudgets.architecture,
          },
          context
        );
        metadata.phase1.architecture = architecturePlan;
        const architectureAppPath = architecturePlan.fileStructure.files.find((file) =>
          /(^|\/)App\.tsx$/i.test(file.path)
        )?.path;
        if (architectureAppPath) {
          mainRuntimePath = architectureAppPath.startsWith('src/')
            ? architectureAppPath
            : `src/${architectureAppPath.replace(/^\.?\//, '')}`;
        }
        console.log('[Orchestrator] Architecture Pass completed');
      }
    }

    const effectiveSpec = spec || this.createFallbackSpec(request.prompt);
    const effectiveIntent = intent || this.createFallbackIntent(
      request.prompt,
      Boolean(request.currentFiles && Object.keys(request.currentFiles).length > 0)
    );
    const complexityProfile = this.classifyComplexityProfile(request.prompt, effectiveSpec, architecturePlan, effectiveIntent);
    if (metadata.phase3) {
      metadata.phase3.complexityProfile = complexityProfile;
    }

    // Phase 3: Dynamic prompt conditioning only after spec + architecture are known.
    if (flags.phase3.dynamicPromptConditioning) {
      console.log('[Orchestrator] Conditioning prompts...');
      try {
        const conditioned = dynamicPromptConditioner.condition(
          request,
          effectiveIntent,
          effectiveSpec,
          architecturePlan,
          undefined,
          styleDNA ? JSON.stringify(styleDNA) : undefined
        );
        metadata.phase3!.conditionedPrompt = conditioned;
        conditionedRequest = {
          ...request,
          systemPrompt: conditioned.systemPrompt,
          prompt: conditioned.userPrompt,
        };
        console.log('[Orchestrator] Prompts conditioned');
      } catch (error: any) {
        if (isAbortError(error) || request.signal?.aborted) throw error;
        console.warn('[Orchestrator] Prompt conditioning failed:', error.message);
      }
    }

    // Main generation happens once, after analysis and conditioning.
    const generationRequest = conditionedRequest !== request ? conditionedRequest : request;
    let generationPrompt = generationRequest.prompt;
    if (architecturePlan) {
      generationPrompt = this.enhancePromptWithArchitecture(generationPrompt, architecturePlan, complexityProfile);
    } else {
      const complexityDirective = this.buildComplexityDirective(complexityProfile);
      if (complexityDirective) {
        generationPrompt = `${generationPrompt}\n\n${complexityDirective}`;
      }
    }

    const response = await llmManager.generate({
      ...generationRequest,
      prompt: generationPrompt,
    });
    code = typeof response === 'string' ? response : ((response as any)?.content || '');

    // Phase 1: critique + repair after generation
    if (metadata.phase1 && flags.phase1.selfCritique) {
      console.log('[Orchestrator] Running Self Critique...');
      const critique = await selfCritique.critique(
        code,
        architecturePlan || this.createFallbackArchitecture(),
        {
          ...request,
          maxTokens: passBudgets.critique,
        },
        context
      );
      metadata.phase1.critique = critique;
      console.log(`[Orchestrator] Self Critique completed: Score ${critique.score}/100`);

      if (flags.phase1.repairLoop && critique.needsRepair) {
        console.log('[Orchestrator] Running Repair Loop...');
        const repair = await repairLoop.repair(code, critique, {
          ...request,
          maxTokens: passBudgets.repair,
        }, context);
        metadata.phase1.repair = repair;
        code = repair.code;
        console.log(`[Orchestrator] Repair Loop completed: ${repair.iterations} iterations, Success: ${repair.success}`);
      }
    }

    // Phase 3: Elite Features (POST-GENERATION)
    if (flags.phase3.dependencyIntelligence || flags.phase3.styleDNA || flags.phase3.componentMemory) {
      if (!metadata.phase3) {
        metadata.phase3 = {};
      }

      if (flags.phase3.dependencyIntelligence) {
        console.log('[Orchestrator] Analyzing dependencies...');
        try {
          const depAnalysis = await dependencyIntelligence.analyze(code);
          metadata.phase3.dependencyAnalysis = depAnalysis;
          console.log(`[Orchestrator] Dependency analysis completed: ${depAnalysis.dependencies.length} dependencies found`);
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] Dependency analysis failed:', error.message);
        }
      }

      if (flags.phase3.styleDNA && styleDNA) {
        console.log('[Orchestrator] Injecting Style DNA...');
        try {
          const injectionResult = await styleDNAInjector.injectStyle(code, styleDNA);
          if (injectionResult.styleApplied) {
            code = injectionResult.code;
            console.log(`[Orchestrator] Style DNA injected: ${injectionResult.changes.length} changes applied`);
          }
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] Style DNA injection failed:', error.message);
        }
      }

      if (flags.phase3.componentMemory) {
        console.log('[Orchestrator] Storing components in memory...');
        try {
          const storedIds = await componentMemory.extractAndStore(
            code,
            `Generated from: ${request.prompt.substring(0, 50)}`
          );
          if (!metadata.phase3.componentMemory) {
            metadata.phase3.componentMemory = { stored: [], reused: [] };
          }
          metadata.phase3.componentMemory.stored = storedIds;
          console.log(`[Orchestrator] Stored ${storedIds.length} components in memory`);
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] Component memory storage failed:', error.message);
        }
      }
    }

    // Phase 2: Processor Evolution (applied after code generation)
    if (flags.phase2.astRewrite || flags.phase2.qualityScoring || flags.phase2.multiFileGeneration) {
      metadata.phase2 = {};

      if (flags.phase2.astRewrite) {
        console.log('[Orchestrator] Running AST Rewrite...');
        try {
          const rewriteResult = await astRewriter.rewrite(code, 'App.tsx');
          metadata.phase2.astRewrite = rewriteResult;
          if (rewriteResult.optimized) {
            code = rewriteResult.code;
            console.log(`[Orchestrator] AST Rewrite completed: ${rewriteResult.transformations.length} transformations applied`);
          }
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] AST Rewrite failed:', error.message);
        }
      }

      if (flags.phase2.qualityScoring) {
        console.log('[Orchestrator] Running Quality Scoring...');
        try {
          const qualityScore = await qualityScorer.score(code, mainRuntimePath);
          metadata.phase2.qualityScore = qualityScore;
          console.log(`[Orchestrator] Quality Scoring completed: Score ${qualityScore.overall}/100`);
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] Quality Scoring failed:', error.message);
        }
      }

      if (flags.phase2.multiFileGeneration) {
        console.log('[Orchestrator] Running Multi File Generation...');
        try {
          const multiFileResult = await multiFileGenerator.generate(code, mainRuntimePath);
          metadata.phase2.multiFile = multiFileResult;

          const files = multiFileResult.files.map((f) => ({
            path: f.path,
            content: f.content,
          }));

          console.log(`[Orchestrator] Multi File Generation completed: ${files.length} files generated`);

          return {
            code: files.find((f) => /(^|\/)App\.tsx$/i.test(f.path))?.content || code,
            files,
            metadata,
          };
        } catch (error: any) {
          if (isAbortError(error) || request.signal?.aborted) throw error;
          console.warn('[Orchestrator] Multi File Generation failed:', error.message);
        }
      }
    }

    return {
      code,
      metadata,
    };
  }

  /**
   * Enhance prompt with architecture plan
   */
  private enhancePromptWithArchitecture(prompt: string, plan: ArchitecturePlan, complexityProfile?: ComplexityProfile): string {
    const plannedFiles = plan.fileStructure.files.slice(0, 24)
      .map((file) => `- ${file.path} (${file.type})`)
      .join('\n');
    const dependencySummary = plan.dependencies.length > 0 ? plan.dependencies.join(', ') : 'react, react-dom';
    const complexityDirective = this.buildComplexityDirective(complexityProfile, plan);

    return `${prompt}

=== ARCHITECTURE PLAN ===
${plan.explanation}

Component Hierarchy:
${JSON.stringify(plan.componentHierarchy, null, 2)}

State Management: ${plan.stateManagement}
Patterns: ${plan.patterns.join(', ')}
Dependencies: ${dependencySummary}
Planned Files:
${plannedFiles || '- src/App.tsx (component)'}

${complexityDirective}

Bitte implementiere den Code gemäss diesem Architektur-Plan.`;
  }

  private classifyComplexityProfile(
    prompt: string,
    spec: SpecResult,
    plan?: ArchitecturePlan,
    intent?: IntentResult
  ): ComplexityProfile {
    const lower = String(prompt || '').toLowerCase();
    const joinedSpec = [
      ...spec.components,
      ...spec.features,
      ...spec.constraints,
      ...spec.uiElements,
      ...spec.implicitRequirements,
      ...spec.dataFlow,
    ].join(' ').toLowerCase();
    const haystack = `${lower} ${joinedSpec}`;
    const plannedFileCount = plan?.fileStructure.files.length || 0;

    const fullstackSignal = /\b(database|supabase|sql|api|backend|serverless|server|webhook|auth)\b/.test(haystack);
    const dataHeavySignal = /dashboard|chart|table|analytics|portfolio|report|sort|filter|realtime|crypto|inventory|invoice/.test(haystack);
    const interactiveSignal = /drag-and-drop|drag and drop|slider|modal|search|confetti|toggle|wizard|multi-step|form|persist|localstorage|calculator|kanban|pathfinding|cart|checkout/.test(haystack);

    let route: ComplexityRoute = 'simple';
    if (fullstackSignal) {
      route = 'fullstack';
    } else if (dataHeavySignal || spec.estimatedComplexity === 'complex') {
      route = 'data-heavy';
    } else if (interactiveSignal || intent?.intent === 'enhance' || spec.features.length >= 3) {
      route = 'interactive';
    }

    const requiresArchitecture = route !== 'simple' || plannedFileCount >= 4 || spec.estimatedComplexity === 'complex';
    const requiresStructuredOutput = route !== 'simple' || spec.features.length >= 4;
    const requiresMultiFile = route === 'fullstack' || route === 'data-heavy' || plannedFileCount >= 5 || spec.components.length >= 4;

    return {
      route,
      requiresArchitecture,
      requiresStructuredOutput,
      requiresMultiFile,
    };
  }

  private buildComplexityDirective(profile?: ComplexityProfile, plan?: ArchitecturePlan): string {
    if (!profile) return '';

    const lines = [
      '=== COMPLEXITY DIRECTIVE ===',
      `Route: ${profile.route}`,
    ];

    if (profile.requiresMultiFile) {
      lines.push('- Prefer split components, hooks, and utilities instead of a single App.tsx blob.');
      if (plan?.fileStructure.files.length) {
        lines.push('- If you reference a planned file, create it in the output.');
      }
    }

    if (profile.requiresStructuredOutput) {
      lines.push('- Return a structured multi-file result whenever the provider supports it.');
      lines.push('- Keep imports aligned with the generated file paths only.');
    }

    if (profile.route === 'fullstack') {
      lines.push('- Model state, persistence, and transactional flows explicitly.');
    } else if (profile.route === 'data-heavy') {
      lines.push('- Isolate data widgets, tables, and charts into dedicated components.');
    } else if (profile.route === 'interactive') {
      lines.push('- Keep interactive state localised with dedicated hooks/components.');
    }

    return lines.join('\n');
  }

  private buildPassBudgets(request: LLMRequest): PassBudgets {
    const requested = typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens)
      ? Math.max(512, Math.floor(request.maxTokens))
      : 1800;
    const prompt = String(request.prompt || '').toLowerCase();
    const isComplex =
      /kanban|trello|drag|drop|dijkstra|pathfinding|invoice|inventory|checkout|cart|wizard|dashboard|chart|crypto|split-bill|calculator|fullstack|backend|supabase/.test(prompt);
    const isInteractive =
      isComplex || /modal|sidebar|table|sort|filter|localstorage|animation|theme|dark mode/.test(prompt);

    return {
      spec: Math.min(requested, isComplex ? 650 : isInteractive ? 520 : 420),
      architecture: Math.min(requested, isComplex ? 900 : isInteractive ? 720 : 520),
      critique: Math.min(requested, isComplex ? 620 : 480),
      repair: Math.min(requested, isComplex ? 850 : 620),
    };
  }

  /**
   * Create fallback spec for when spec pass is disabled
   */
  private createFallbackSpec(prompt: string): SpecResult {
    return {
      components: ['App'],
      features: [],
      constraints: [],
      uiElements: [],
      dataFlow: [],
      implicitRequirements: [],
      priority: 'medium',
      estimatedComplexity: 'medium',
    };
  }

  /**
   * Create fallback architecture for when architecture pass is disabled
   */
  private createFallbackArchitecture(): ArchitecturePlan {
    return {
      componentHierarchy: [{ name: 'App', type: 'component' }],
      stateManagement: 'local',
      dataFlow: [],
      patterns: [],
      fileStructure: { files: [{ path: 'App.tsx', type: 'component', purpose: 'Main app' }] },
      dependencies: [],
      explanation: 'Standard React architecture',
    };
  }

  /**
   * Create fallback intent for when intent agent is disabled
   */
  private createFallbackIntent(prompt: string, hasExistingCode: boolean): IntentResult {
    return {
      intent: hasExistingCode ? 'modify' : 'create',
      confidence: 0.6,
      context: {
        isIteration: hasExistingCode,
        hasExistingCode,
        complexity: 'medium',
      },
      strategy: hasExistingCode ? 'Modify existing code' : 'Create new component',
    };
  }
}

export const orchestrator = new Orchestrator();
