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

    let code: string;
    let architecturePlan: ArchitecturePlan | undefined;
    let intent: IntentResult | undefined;
    let conditionedRequest: LLMRequest = request;
    let styleDNA: StyleDNA | undefined;

    // Phase 3: Elite Features (PRE-GENERATION)
    if (flags.phase3.intentAgent || flags.phase3.dynamicPromptConditioning || 
        flags.phase3.styleDNA || flags.phase3.componentMemory) {
      metadata.phase3 = {};

      // 1. Intent Agent (runs first)
      if (flags.phase3.intentAgent) {
        console.log('[Orchestrator] Running Intent Agent...');
        try {
          intent = await intentAgent.detectIntent(request.prompt, request.currentFiles);
          metadata.phase3.intent = intent;
          console.log(`[Orchestrator] Intent detected: ${intent.intent} (confidence: ${intent.confidence})`);
        } catch (error: any) {
          console.warn('[Orchestrator] Intent Agent failed:', error.message);
        }
      }

      // 2. Style DNA Extraction (if existing code available)
      if (flags.phase3.styleDNA && request.currentFiles && Object.keys(request.currentFiles).length > 0) {
        console.log('[Orchestrator] Extracting Style DNA...');
        try {
          styleDNA = await styleDNAInjector.extractStyleDNA(request.currentFiles);
          metadata.phase3.styleDNA = styleDNA;
          console.log('[Orchestrator] Style DNA extracted');
        } catch (error: any) {
          console.warn('[Orchestrator] Style DNA extraction failed:', error.message);
        }
      }

      // 3. Dynamic Prompt Conditioning
      if (flags.phase3.dynamicPromptConditioning) {
        console.log('[Orchestrator] Conditioning prompts...');
        try {
          const spec = metadata.phase1?.spec;
          const conditioned = dynamicPromptConditioner.condition(
            request,
            intent || this.createFallbackIntent(request.prompt, !!request.currentFiles),
            spec,
            architecturePlan,
            undefined, // userHistory - could be added later
            styleDNA ? JSON.stringify(styleDNA) : undefined
          );
          metadata.phase3.conditionedPrompt = conditioned;
          
          // Update request with conditioned prompts
          conditionedRequest = {
            ...request,
            systemPrompt: conditioned.systemPrompt,
            prompt: conditioned.userPrompt,
          };
          console.log('[Orchestrator] Prompts conditioned');
        } catch (error: any) {
          console.warn('[Orchestrator] Prompt conditioning failed:', error.message);
        }
      }

      // 4. Component Memory Search (check for reusable components)
      if (flags.phase3.componentMemory) {
        console.log('[Orchestrator] Searching component memory...');
        try {
          const searchResult = await componentMemory.search(request.prompt, 3);
          if (searchResult.components.length > 0) {
            console.log(`[Orchestrator] Found ${searchResult.components.length} similar components in memory`);
            // Could suggest reusing components here
          }
        } catch (error: any) {
          console.warn('[Orchestrator] Component memory search failed:', error.message);
        }
      }
    }

    // Phase 1: Intelligence Layer
    if (flags.phase1.specPass || flags.phase1.architecturePass || flags.phase1.selfCritique || flags.phase1.repairLoop) {
      metadata.phase1 = {};

      // 1. Spec Pass
      let spec: SpecResult | undefined;
      if (flags.phase1.specPass) {
        console.log('[Orchestrator] Running Spec Pass...');
        spec = await specPass.analyze(request.prompt, context);
        metadata.phase1.spec = spec;
        console.log(`[Orchestrator] Spec Pass completed: ${spec.components.length} components identified`);
      }

      // 2. Architecture Pass
      if (flags.phase1.architecturePass) {
        console.log('[Orchestrator] Running Architecture Pass...');
        architecturePlan = await architecturePass.createPlan(
          spec || this.createFallbackSpec(request.prompt),
          request,
          context
        );
        metadata.phase1.architecture = architecturePlan;
        console.log('[Orchestrator] Architecture Pass completed');
      }

      // Generate code (with or without architecture plan)
      // Use conditioned request if Phase 3 prompt conditioning was applied
      const generationRequest = conditionedRequest !== request ? conditionedRequest : request;
      
      if (architecturePlan) {
        // Use architecture plan in prompt
        const enhancedPrompt = this.enhancePromptWithArchitecture(generationRequest.prompt, architecturePlan);
        const response = await llmManager.generate({
          ...generationRequest,
          prompt: enhancedPrompt,
        });
        code = typeof response === 'string' ? response : ((response as any)?.content || '');
      } else {
        // Standard generation (with conditioned prompts if available)
        const response = await llmManager.generate(generationRequest);
        code = typeof response === 'string' ? response : ((response as any)?.content || '');
      }

      // 3. Self Critique
      let critique: CritiqueResult | undefined;
      if (flags.phase1.selfCritique) {
        console.log('[Orchestrator] Running Self Critique...');
        critique = await selfCritique.critique(
          code,
          architecturePlan || this.createFallbackArchitecture(),
          request,
          context
        );
        metadata.phase1.critique = critique;
        console.log(`[Orchestrator] Self Critique completed: Score ${critique.score}/100`);

        // 4. Repair Loop
        if (flags.phase1.repairLoop && critique.needsRepair) {
          console.log('[Orchestrator] Running Repair Loop...');
          const repair = await repairLoop.repair(code, critique, request, context);
          metadata.phase1.repair = repair;
          code = repair.code;
          console.log(`[Orchestrator] Repair Loop completed: ${repair.iterations} iterations, Success: ${repair.success}`);
        }
      }
    } else {
      // No Phase 1 features enabled, use standard generation
      // But still use conditioned request if Phase 3 was applied
      const generationRequest = conditionedRequest !== request ? conditionedRequest : request;
      const response = await llmManager.generate(generationRequest);
      code = typeof response === 'string' ? response : ((response as any)?.content || '');
    }

    // Phase 3: Elite Features (POST-GENERATION)
    if (flags.phase3.dependencyIntelligence || flags.phase3.styleDNA || flags.phase3.componentMemory) {
      if (!metadata.phase3) {
        metadata.phase3 = {};
      }

      // 5. Dependency Intelligence
      if (flags.phase3.dependencyIntelligence) {
        console.log('[Orchestrator] Analyzing dependencies...');
        try {
          const depAnalysis = await dependencyIntelligence.analyze(code);
          metadata.phase3.dependencyAnalysis = depAnalysis;
          console.log(`[Orchestrator] Dependency analysis completed: ${depAnalysis.dependencies.length} dependencies found`);
        } catch (error: any) {
          console.warn('[Orchestrator] Dependency analysis failed:', error.message);
        }
      }

      // 6. Style DNA Injection (if style DNA was extracted)
      if (flags.phase3.styleDNA && styleDNA) {
        console.log('[Orchestrator] Injecting Style DNA...');
        try {
          const injectionResult = await styleDNAInjector.injectStyle(code, styleDNA);
          if (injectionResult.styleApplied) {
            code = injectionResult.code;
            console.log(`[Orchestrator] Style DNA injected: ${injectionResult.changes.length} changes applied`);
          }
        } catch (error: any) {
          console.warn('[Orchestrator] Style DNA injection failed:', error.message);
        }
      }

      // 7. Component Memory Storage (store generated components)
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
          console.warn('[Orchestrator] Component memory storage failed:', error.message);
        }
      }
    }

    // Phase 2: Processor Evolution (applied after code generation)
    if (flags.phase2.astRewrite || flags.phase2.qualityScoring || flags.phase2.multiFileGeneration) {
      metadata.phase2 = {};

      // 1. AST Rewrite
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
          console.warn('[Orchestrator] AST Rewrite failed:', error.message);
        }
      }

      // 2. Quality Scoring
      if (flags.phase2.qualityScoring) {
        console.log('[Orchestrator] Running Quality Scoring...');
        try {
          const qualityScore = await qualityScorer.score(code, 'App.tsx');
          metadata.phase2.qualityScore = qualityScore;
          console.log(`[Orchestrator] Quality Scoring completed: Score ${qualityScore.overall}/100`);
        } catch (error: any) {
          console.warn('[Orchestrator] Quality Scoring failed:', error.message);
        }
      }

      // 3. Multi File Generation
      if (flags.phase2.multiFileGeneration) {
        console.log('[Orchestrator] Running Multi File Generation...');
        try {
          const multiFileResult = await multiFileGenerator.generate(code, 'App.tsx');
          metadata.phase2.multiFile = multiFileResult;
          
          // Convert to files array format
          const files = multiFileResult.files.map(f => ({
            path: f.path,
            content: f.content,
          }));

          console.log(`[Orchestrator] Multi File Generation completed: ${files.length} files generated`);
          
          return {
            code: files.find(f => f.path === 'App.tsx')?.content || code,
            files,
            metadata,
          };
        } catch (error: any) {
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
  private enhancePromptWithArchitecture(prompt: string, plan: ArchitecturePlan): string {
    return `${prompt}

=== ARCHITECTURE PLAN ===
${plan.explanation}

Component Hierarchy:
${JSON.stringify(plan.componentHierarchy, null, 2)}

State Management: ${plan.stateManagement}
Patterns: ${plan.patterns.join(', ')}

Bitte implementiere den Code gemäß diesem Architektur-Plan.`;
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
