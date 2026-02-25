import { llmManager, LLMRequest } from '../llm/manager.js';

/**
 * Intent Agent - Phase 3 Component 1
 * Detects user intentions from prompts
 */

export type IntentType = 'create' | 'modify' | 'fix' | 'refactor' | 'enhance' | 'style';

export interface IntentResult {
  intent: IntentType;
  confidence: number; // 0-1
  target?: string; // Component/feature being targeted
  context: {
    isIteration: boolean;
    hasExistingCode: boolean;
    complexity: 'simple' | 'medium' | 'complex';
  };
  strategy: string; // Suggested generation strategy
}

export class IntentAgent {
  /**
   * Detect intent from prompt
   */
  async detectIntent(prompt: string, existingFiles?: Record<string, string>): Promise<IntentResult> {
    const hasExistingCode = !!existingFiles && Object.keys(existingFiles).length > 0;
    const lowerPrompt = prompt.toLowerCase();

    // Quick heuristic-based detection first (fast)
    const heuristicIntent = this.heuristicDetection(lowerPrompt, hasExistingCode);

    // If confidence is high, use heuristic
    if (heuristicIntent.confidence > 0.8) {
      return heuristicIntent;
    }

    // Otherwise, use LLM for more accurate detection
    try {
      return await this.llmDetection(prompt, hasExistingCode);
    } catch (error: any) {
      console.warn('[IntentAgent] LLM detection failed, using heuristic:', error.message);
      return heuristicIntent;
    }
  }

  /**
   * Heuristic-based intent detection (fast, no LLM call)
   */
  private heuristicDetection(lowerPrompt: string, hasExistingCode: boolean): IntentResult {
    // Create intent
    if (lowerPrompt.includes('create') || lowerPrompt.includes('build') || lowerPrompt.includes('make') || 
        lowerPrompt.includes('new') || lowerPrompt.includes('generate')) {
      if (!hasExistingCode) {
        return {
          intent: 'create',
          confidence: 0.9,
          context: {
            isIteration: false,
            hasExistingCode: false,
            complexity: this.estimateComplexity(lowerPrompt),
          },
          strategy: 'Generate new component from scratch',
        };
      }
    }

    // Modify intent
    if (lowerPrompt.includes('modify') || lowerPrompt.includes('change') || lowerPrompt.includes('update') ||
        lowerPrompt.includes('edit') || lowerPrompt.includes('adjust')) {
      return {
        intent: 'modify',
        confidence: 0.85,
        target: this.extractTarget(lowerPrompt),
        context: {
          isIteration: true,
          hasExistingCode: true,
          complexity: 'medium',
        },
        strategy: 'Modify existing component while preserving structure',
      };
    }

    // Fix intent
    if (lowerPrompt.includes('fix') || lowerPrompt.includes('bug') || lowerPrompt.includes('error') ||
        lowerPrompt.includes('broken') || lowerPrompt.includes('not working')) {
      return {
        intent: 'fix',
        confidence: 0.9,
        target: this.extractTarget(lowerPrompt),
        context: {
          isIteration: true,
          hasExistingCode: true,
          complexity: 'simple',
        },
        strategy: 'Focus on fixing specific issues without major refactoring',
      };
    }

    // Refactor intent
    if (lowerPrompt.includes('refactor') || lowerPrompt.includes('improve') || lowerPrompt.includes('optimize') ||
        lowerPrompt.includes('clean up') || lowerPrompt.includes('restructure')) {
      return {
        intent: 'refactor',
        confidence: 0.8,
        target: this.extractTarget(lowerPrompt),
        context: {
          isIteration: true,
          hasExistingCode: true,
          complexity: 'complex',
        },
        strategy: 'Refactor code structure while maintaining functionality',
      };
    }

    // Enhance intent
    if (lowerPrompt.includes('add') || lowerPrompt.includes('enhance') || lowerPrompt.includes('extend') ||
        lowerPrompt.includes('improve') || lowerPrompt.includes('upgrade')) {
      return {
        intent: 'enhance',
        confidence: 0.75,
        target: this.extractTarget(lowerPrompt),
        context: {
          isIteration: true,
          hasExistingCode: true,
          complexity: 'medium',
        },
        strategy: 'Add new features to existing component',
      };
    }

    // Style intent
    if (lowerPrompt.includes('style') || lowerPrompt.includes('design') || lowerPrompt.includes('css') ||
        lowerPrompt.includes('look') || lowerPrompt.includes('appearance') || lowerPrompt.includes('theme')) {
      return {
        intent: 'style',
        confidence: 0.85,
        target: this.extractTarget(lowerPrompt),
        context: {
          isIteration: true,
          hasExistingCode: true,
          complexity: 'simple',
        },
        strategy: 'Focus on styling and visual changes only',
      };
    }

    // Default: create if no existing code, modify if existing
    return {
      intent: hasExistingCode ? 'modify' : 'create',
      confidence: 0.6,
      context: {
        isIteration: hasExistingCode,
        hasExistingCode: hasExistingCode || false,
        complexity: this.estimateComplexity(lowerPrompt),
      },
      strategy: hasExistingCode 
        ? 'Modify existing code based on prompt'
        : 'Create new component from scratch',
    };
  }

  /**
   * LLM-based intent detection (more accurate)
   */
  private async llmDetection(prompt: string, hasExistingCode: boolean): Promise<IntentResult> {
    const systemPrompt = `Du bist ein Intent-Analyse-Agent.
Analysiere den User-Prompt und bestimme die Intention.

Mögliche Intentionen:
- create: Neue Komponente/Feature erstellen
- modify: Bestehende Komponente ändern
- fix: Bug beheben
- refactor: Code verbessern/umstrukturieren
- enhance: Feature erweitern
- style: Nur Styling-Änderungen

Output: JSON mit {intent, confidence (0-1), target (optional), strategy}`;

    const analysisPrompt = `Analysiere diesen Prompt:

"${prompt}"

Bestehender Code vorhanden: ${hasExistingCode ? 'Ja' : 'Nein'}

Bestimme die Intention und gib ein JSON-Objekt zurück.`;

    try {
      const response = await llmManager.generate({
        provider: 'gemini',
        prompt: analysisPrompt,
        systemPrompt,
        temperature: 0.2,
        maxTokens: 500,
      });

      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          intent: this.validateIntent(result.intent),
          confidence: Math.max(0, Math.min(1, result.confidence || 0.7)),
          target: result.target,
          context: {
            isIteration: hasExistingCode,
            hasExistingCode,
            complexity: result.complexity || this.estimateComplexity(prompt.toLowerCase()),
          },
          strategy: result.strategy || 'Standard generation strategy',
        };
      }
    } catch (error) {
      // Fall through to heuristic
    }

    return this.heuristicDetection(prompt.toLowerCase(), hasExistingCode);
  }

  /**
   * Validate intent type
   */
  private validateIntent(intent: string): IntentType {
    const validIntents: IntentType[] = ['create', 'modify', 'fix', 'refactor', 'enhance', 'style'];
    return validIntents.includes(intent as IntentType) ? (intent as IntentType) : 'create';
  }

  /**
   * Extract target component/feature from prompt
   */
  private extractTarget(lowerPrompt: string): string | undefined {
    // Try to find component names (capitalized words)
    const componentMatch = lowerPrompt.match(/(?:the |a |an )?([A-Z][a-zA-Z0-9]+)/);
    if (componentMatch) {
      return componentMatch[1];
    }

    // Try to find quoted strings
    const quotedMatch = lowerPrompt.match(/"([^"]+)"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    return undefined;
  }

  /**
   * Estimate complexity from prompt
   */
  private estimateComplexity(lowerPrompt: string): 'simple' | 'medium' | 'complex' {
    const complexKeywords = ['complex', 'advanced', 'sophisticated', 'multiple', 'many', 'several'];
    const simpleKeywords = ['simple', 'basic', 'easy', 'quick', 'small'];

    const complexCount = complexKeywords.filter(k => lowerPrompt.includes(k)).length;
    const simpleCount = simpleKeywords.filter(k => lowerPrompt.includes(k)).length;

    if (complexCount > simpleCount) return 'complex';
    if (simpleCount > complexCount) return 'simple';
    return 'medium';
  }
}

export const intentAgent = new IntentAgent();
