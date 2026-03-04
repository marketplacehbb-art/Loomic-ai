import { llmManager, LLMRequest } from '../llm/manager.js';
import { ArchitecturePlan } from './architecture-pass.js';
import { parseJsonWithSchema, z } from './json-contract.js';

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

const critiqueIssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']).default('minor'),
  category: z.enum(['performance', 'maintainability', 'accessibility', 'best-practices', 'security', 'type-safety']).default('best-practices'),
  description: z.string().default('Issue found'),
  location: z.string().default('Unknown'),
  suggestion: z.string().default('Review and fix'),
});

const critiqueSchema = z.object({
  score: z.number().default(75),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  issues: z.array(critiqueIssueSchema).default([]),
  suggestions: z.array(z.string()).default([]),
  needsRepair: z.boolean().optional(),
});

type ParsedCritique = z.infer<typeof critiqueSchema>;

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return name === 'AbortError' || /aborted|aborterror/i.test(message);
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
      const critiqueMaxTokens = Math.max(
        480,
        Math.min(
          1400,
          Math.floor(typeof request.maxTokens === 'number' ? request.maxTokens * 0.35 : 1100)
        )
      );
      const response = await llmManager.generate({
        ...request,
        systemPrompt,
        prompt: critiquePrompt,
        temperature: 0.3, // Lower temperature for consistent critique
        maxTokens: critiqueMaxTokens,
      });

      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const parsed = parseJsonWithSchema(responseText, critiqueSchema);
      if (parsed.data) {
        return this.normalizeCritique(parsed.data);
      }

      const retry = await llmManager.generate({
        ...request,
        systemPrompt,
        prompt: `${critiquePrompt}\n\nReturn STRICT JSON only. No markdown, no prose.`,
        temperature: 0,
        maxTokens: Math.max(512, Math.min(1200, critiqueMaxTokens)),
      });
      const retryText = typeof retry === 'string'
        ? retry
        : ((retry as any)?.content || '');
      const retryParsed = parseJsonWithSchema(retryText, critiqueSchema);
      if (retryParsed.data) {
        return this.normalizeCritique(retryParsed.data);
      }

      return this.createFallbackCritique(code);
    } catch (error: any) {
      if (isAbortError(error) || request.signal?.aborted) {
        throw error;
      }
      console.warn('[SelfCritique] Failed to critique code, using fallback:', error.message);
      return this.createFallbackCritique(code);
    }
  }

  /**
   * Normalize critique result
   */
  private normalizeCritique(critique: ParsedCritique): CritiqueResult {
    const score = typeof critique.score === 'number' 
      ? Math.max(0, Math.min(100, critique.score))
      : 75;

    return {
      score,
      strengths: critique.strengths,
      weaknesses: critique.weaknesses,
      issues: critique.issues.map((issue) => this.normalizeIssue(issue)),
      suggestions: critique.suggestions,
      needsRepair: critique.needsRepair !== undefined 
        ? critique.needsRepair 
        : score < 70 || critique.issues.some((issue) => issue.severity === 'critical'),
    };
  }

  /**
   * Normalize critique issue
   */
  private normalizeIssue(issue: z.infer<typeof critiqueIssueSchema>): CritiqueIssue {
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
