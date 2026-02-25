import { llmManager, LLMRequest } from '../llm/manager.js';

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

export class SpecPass {
  /**
   * Analyze prompt and extract structured specifications
   */
  async analyze(prompt: string, context?: string): Promise<SpecResult> {
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
      const response = await llmManager.generate({
        provider: 'gemini', // Use default provider
        prompt: analysisPrompt,
        systemPrompt,
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 2000,
      });

      // Parse JSON from response
      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const spec = JSON.parse(jsonMatch[0]);
        return this.normalizeSpec(spec);
      }

      // Fallback: Create basic spec from prompt analysis
      return this.createFallbackSpec(prompt);
    } catch (error: any) {
      console.warn('[SpecPass] Failed to analyze prompt, using fallback:', error.message);
      return this.createFallbackSpec(prompt);
    }
  }

  /**
   * Normalize spec object to ensure all fields are present
   */
  private normalizeSpec(spec: any): SpecResult {
    return {
      components: Array.isArray(spec.components) ? spec.components : [],
      features: Array.isArray(spec.features) ? spec.features : [],
      constraints: Array.isArray(spec.constraints) ? spec.constraints : [],
      uiElements: Array.isArray(spec.uiElements) ? spec.uiElements : [],
      dataFlow: Array.isArray(spec.dataFlow) ? spec.dataFlow : [spec.dataFlow || ''],
      implicitRequirements: Array.isArray(spec.implicitRequirements) ? spec.implicitRequirements : [],
      priority: ['high', 'medium', 'low'].includes(spec.priority) ? spec.priority : 'medium',
      estimatedComplexity: ['simple', 'medium', 'complex'].includes(spec.estimatedComplexity) 
        ? spec.estimatedComplexity 
        : 'medium',
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
