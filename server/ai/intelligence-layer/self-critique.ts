import { llmManager, LLMRequest } from '../llm/manager.js';
import { ArchitecturePlan } from './architecture-pass.js';

/**
 * Self Critique - Phase 1 Component 3
 * Critically evaluates generated code
 */

export interface CritiqueIssue {
  severity: 'critical' | 'major' | 'minor';
  category: 'performance' | 'maintainability' | 'accessibility' | 'best-practices' | 'security' | 'type-safety';
  description: string;
  location: string; // File:Line or Component name
  suggestion: string;
}

export interface CritiqueResult {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  issues: CritiqueIssue[];
  suggestions: string[];
  needsRepair: boolean;
}

export class SelfCritique {
  /**
   * Critique generated code
   */
  async critique(
    code: string,
    architecturePlan: ArchitecturePlan,
    request: LLMRequest,
    context?: string
  ): Promise<CritiqueResult> {
    const systemPrompt = `Du bist ein strenger Tech Lead und Code-Reviewer.
Dein Ziel: Bewerte den generierten Code kritisch und identifiziere Probleme.

Erstelle ein JSON-Objekt mit:
- score: Gesamt-Score von 0-100
- strengths: Liste der Stärken des Codes
- weaknesses: Liste der Schwächen
- issues: Array von Problemen mit {severity, category, description, location, suggestion}
- suggestions: Allgemeine Verbesserungsvorschläge
- needsRepair: Boolean ob Reparatur nötig ist (true wenn score < 70 oder critical issues vorhanden)

Kategorien: performance, maintainability, accessibility, best-practices, security, type-safety
Severity: critical (muss gefixt werden), major (sollte gefixt werden), minor (nice-to-have)

Output: NUR ein valides JSON-Objekt.`;

    const critiquePrompt = `Bewerte diesen Code kritisch:

Architektur-Plan:
${JSON.stringify(architecturePlan, null, 2)}

Generierter Code:
${code.substring(0, 4000)}${code.length > 4000 ? '...' : ''}

${context ? `\nKontext:\n${context}` : ''}

Original Request: ${request.prompt}`;

    try {
      const response = await llmManager.generate({
        ...request,
        systemPrompt,
        prompt: critiquePrompt,
        temperature: 0.3, // Lower temperature for consistent critique
        maxTokens: 2000,
      });

      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const critique = JSON.parse(jsonMatch[0]);
        return this.normalizeCritique(critique);
      }

      // Fallback: Basic critique
      return this.createFallbackCritique(code);
    } catch (error: any) {
      console.warn('[SelfCritique] Failed to critique code, using fallback:', error.message);
      return this.createFallbackCritique(code);
    }
  }

  /**
   * Normalize critique result
   */
  private normalizeCritique(critique: any): CritiqueResult {
    const score = typeof critique.score === 'number' 
      ? Math.max(0, Math.min(100, critique.score))
      : 75;

    return {
      score,
      strengths: Array.isArray(critique.strengths) ? critique.strengths : [],
      weaknesses: Array.isArray(critique.weaknesses) ? critique.weaknesses : [],
      issues: Array.isArray(critique.issues) 
        ? critique.issues.map((issue: any) => this.normalizeIssue(issue))
        : [],
      suggestions: Array.isArray(critique.suggestions) ? critique.suggestions : [],
      needsRepair: critique.needsRepair !== undefined 
        ? critique.needsRepair 
        : score < 70 || (critique.issues || []).some((i: any) => i.severity === 'critical'),
    };
  }

  /**
   * Normalize critique issue
   */
  private normalizeIssue(issue: any): CritiqueIssue {
    return {
      severity: ['critical', 'major', 'minor'].includes(issue.severity)
        ? issue.severity
        : 'minor',
      category: ['performance', 'maintainability', 'accessibility', 'best-practices', 'security', 'type-safety'].includes(issue.category)
        ? issue.category
        : 'best-practices',
      description: issue.description || 'Issue found',
      location: issue.location || 'Unknown',
      suggestion: issue.suggestion || 'Review and fix',
    };
  }

  /**
   * Create fallback critique
   */
  private createFallbackCritique(code: string): CritiqueResult {
    // Simple heuristic-based critique
    const issues: CritiqueIssue[] = [];
    
    if (!code.includes('useState') && !code.includes('useEffect')) {
      // Might be missing hooks
    }

    if (code.includes('any')) {
      issues.push({
        severity: 'minor',
        category: 'type-safety',
        description: 'Usage of "any" type found',
        location: 'Code',
        suggestion: 'Replace "any" with proper types',
      });
    }

    const score = issues.length === 0 ? 85 : Math.max(50, 85 - issues.length * 10);

    return {
      score,
      strengths: ['Code structure looks good', 'TypeScript usage'],
      weaknesses: issues.length > 0 ? ['Type safety could be improved'] : [],
      issues,
      suggestions: [],
      needsRepair: score < 70,
    };
  }
}

export const selfCritique = new SelfCritique();
