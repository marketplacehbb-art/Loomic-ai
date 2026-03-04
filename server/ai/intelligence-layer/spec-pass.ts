import { llmManager, LLMRequest } from '../llm/manager.js';
import { parseJsonWithSchema, z } from './json-contract.js';

/**
 * Spec Pass - Phase 1 Component 1
 * Analyzes user prompt and extracts structured specifications
 */

export interface SpecResult {
  components: string[];
  features: string[];
  constraints: string[];
  uiElements: string[];
  dataFlow: string[];
  implicitRequirements: string[];
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: 'simple' | 'medium' | 'complex';
}

const specSchema = z.object({
  components: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  uiElements: z.array(z.string()).default([]),
  dataFlow: z.union([z.array(z.string()), z.string()]).optional(),
  implicitRequirements: z.array(z.string()).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  estimatedComplexity: z.enum(['simple', 'medium', 'complex']).default('medium'),
});
type ParsedSpec = z.infer<typeof specSchema>;

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return name === 'AbortError' || /aborted|aborterror/i.test(message);
}

export class SpecPass {
  private readonly specSchema = specSchema;

  /**
   * Analyze prompt and extract structured specifications
   */
  async analyze(
    prompt: string,
    context?: string,
    options?: {
      provider?: 'gemini' | 'groq' | 'openai' | 'nvidia';
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): Promise<SpecResult> {
    const systemPrompt = `Du bist ein erfahrener Requirements-Analyst.
Dein Ziel: Analysiere den User-Prompt und extrahiere strukturierte Spezifikationen.

Analysiere den Prompt und erstelle ein JSON-Objekt mit:
- components: Liste der benötigten React-Komponenten
- features: Liste der Features/Funktionalitäten
- constraints: Technische Constraints und Anforderungen
- uiElements: UI-Elemente die benötigt werden (Buttons, Forms, etc.)
- dataFlow: Beschreibung des Datenflusses
- implicitRequirements: Implizite Anforderungen die nicht explizit genannt wurden
- priority: Priorität (high/medium/low)
- estimatedComplexity: Geschätzte Komplexität (simple/medium/complex)

Output: NUR ein valides JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const analysisPrompt = `Analysiere diesen Prompt und extrahiere die Spezifikationen:

${prompt}

${context ? `\nKontext:\n${context}` : ''}

Erstelle ein strukturiertes Spec-Objekt.`;

    try {
      const analysisMaxTokens = Math.max(
        256,
        Math.min(800, Math.floor(typeof options?.maxTokens === 'number' ? options.maxTokens : 600))
      );
      const response = await llmManager.generate({
        provider: options?.provider || 'gemini',
        prompt: analysisPrompt,
        systemPrompt,
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: analysisMaxTokens,
        signal: options?.signal,
      });

      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const parsed = parseJsonWithSchema(responseText, this.specSchema);
      if (parsed.data) {
        return this.normalizeSpec(parsed.data);
      }

      const strictRetryPrompt = `${analysisPrompt}

Return STRICT JSON only. No markdown, no prose, no code fences.
Required keys: components, features, constraints, uiElements, dataFlow, implicitRequirements, priority, estimatedComplexity.`;
      const retry = await llmManager.generate({
        provider: options?.provider || 'gemini',
        prompt: strictRetryPrompt,
        systemPrompt,
        temperature: 0,
        maxTokens: Math.max(256, Math.min(600, analysisMaxTokens)),
        signal: options?.signal,
      });
      const retryText = typeof retry === 'string'
        ? retry
        : ((retry as any)?.content || '');
      const retryParsed = parseJsonWithSchema(retryText, this.specSchema);
      if (retryParsed.data) {
        return this.normalizeSpec(retryParsed.data);
      }

      return this.createFallbackSpec(prompt);
    } catch (error: any) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }
      console.warn('[SpecPass] Failed to analyze prompt, using fallback:', error.message);
      return this.createFallbackSpec(prompt);
    }
  }

  /**
   * Normalize spec object to ensure all fields are present
   */
  private normalizeSpec(spec: ParsedSpec): SpecResult {
    const normalizedDataFlow = Array.isArray(spec.dataFlow)
      ? spec.dataFlow
      : (typeof spec.dataFlow === 'string' ? [spec.dataFlow] : []);

    return {
      components: spec.components,
      features: spec.features,
      constraints: spec.constraints,
      uiElements: spec.uiElements,
      dataFlow: normalizedDataFlow,
      implicitRequirements: spec.implicitRequirements,
      priority: spec.priority,
      estimatedComplexity: spec.estimatedComplexity,
    };
  }

  /**
   * Create fallback spec from simple prompt analysis
   */
  private createFallbackSpec(prompt: string): SpecResult {
    const lowerPrompt = prompt.toLowerCase();
    
    // Simple keyword-based analysis
    const components: string[] = [];
    if (lowerPrompt.includes('form') || lowerPrompt.includes('input')) components.push('Form');
    if (lowerPrompt.includes('button')) components.push('Button');
    if (lowerPrompt.includes('card')) components.push('Card');
    if (lowerPrompt.includes('modal') || lowerPrompt.includes('dialog')) components.push('Modal');
    if (lowerPrompt.includes('list') || lowerPrompt.includes('table')) components.push('List');
    if (components.length === 0) components.push('App');

    const features: string[] = [];
    if (lowerPrompt.includes('search')) features.push('Search');
    if (lowerPrompt.includes('filter')) features.push('Filter');
    if (lowerPrompt.includes('sort')) features.push('Sort');
    if (lowerPrompt.includes('dark mode') || lowerPrompt.includes('theme')) features.push('Theme Toggle');

    return {
      components,
      features,
      constraints: [],
      uiElements: components,
      dataFlow: ['User Input → Component State → Display'],
      implicitRequirements: ['Responsive Design', 'Accessibility'],
      priority: 'medium',
      estimatedComplexity: 'medium',
    };
  }
}

export const specPass = new SpecPass();
