import { llmManager, LLMRequest } from '../llm/manager.js';
import { CritiqueResult, CritiqueIssue } from './self-critique.js';
import { codeProcessor } from '../../utils/code-processor.js';

/**
 * Repair Loop - Phase 1 Component 4
 * Iteratively fixes code based on critique
 */

export interface RepairFix {
  issue: CritiqueIssue;
  fix: string;
  applied: boolean;
}

export interface RepairLoopResult {
  code: string;
  iterations: number;
  fixesApplied: RepairFix[];
  remainingIssues: CritiqueIssue[];
  success: boolean;
}

export class RepairLoop {
  private MAX_ITERATIONS = 3;

  /**
   * Attempt to repair code based on critique
   */
  async repair(
    code: string,
    critique: CritiqueResult,
    request: LLMRequest,
    context?: string
  ): Promise<RepairLoopResult> {
    if (!critique.needsRepair || critique.issues.length === 0) {
      return {
        code,
        iterations: 0,
        fixesApplied: [],
        remainingIssues: [],
        success: true,
      };
    }

    let currentCode = code;
    let remainingIssues = [...critique.issues];
    const fixesApplied: RepairFix[] = [];
    let iteration = 0;

    // Prioritize issues: critical first, then major, then minor
    const prioritizedIssues = this.prioritizeIssues(remainingIssues);

    console.log(`[RepairLoop] Starting repair for ${prioritizedIssues.length} issues...`);

    for (iteration = 1; iteration <= this.MAX_ITERATIONS && prioritizedIssues.length > 0; iteration++) {
      console.log(`[RepairLoop] Iteration ${iteration}/${this.MAX_ITERATIONS}`);

      // Take top issues for this iteration (max 5 to avoid overwhelming the LLM)
      const issuesToFix = prioritizedIssues.slice(0, 5);
      const remainingAfterThisIteration = prioritizedIssues.slice(5);

      try {
        const repairedCode = await this.applyFixes(currentCode, issuesToFix, request, context);
        
        // Validate the repaired code
        const validation = await codeProcessor.process(repairedCode, 'App.tsx', {
          validate: true,
          bundle: true,
        });

        if (validation.errors.length === 0) {
          // Fix successful
          currentCode = repairedCode;
          issuesToFix.forEach(issue => {
            fixesApplied.push({
              issue,
              fix: 'Applied via LLM repair',
              applied: true,
            });
          });

          // Update remaining issues
          remainingIssues = remainingAfterThisIteration;
          
          // If no more issues, we're done
          if (remainingAfterThisIteration.length === 0) {
            break;
          }
        } else {
          // Repair introduced new errors, keep original code
          console.warn(`[RepairLoop] Iteration ${iteration} introduced ${validation.errors.length} new errors`);
          // Try next iteration with remaining issues
          remainingIssues = prioritizedIssues;
          break;
        }
      } catch (error: any) {
        console.error(`[RepairLoop] Iteration ${iteration} failed:`, error.message);
        // Continue with next iteration
        break;
      }
    }

    const success = remainingIssues.length === 0 || 
                   remainingIssues.every(issue => issue.severity === 'minor');

    console.log(`[RepairLoop] Completed after ${iteration} iterations. Success: ${success}`);

    return {
      code: currentCode,
      iterations: iteration,
      fixesApplied,
      remainingIssues,
      success,
    };
  }

  /**
   * Prioritize issues by severity
   */
  private prioritizeIssues(issues: CritiqueIssue[]): CritiqueIssue[] {
    const severityOrder = { critical: 0, major: 1, minor: 2 };
    return [...issues].sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Apply fixes to code
   */
  private async applyFixes(
    code: string,
    issues: CritiqueIssue[],
    request: LLMRequest,
    context?: string
  ): Promise<string> {
    const systemPrompt = `Du bist ein Senior Fullstack Entwickler (Expert Level).
Dein Ziel: Repariere den Code basierend auf den identifizierten Problemen.

Regeln:
- Behebe ALLE aufgeführten Probleme
- Schreibe vollständigen Code (keine "// ... rest of code")
- Nutze TypeScript strikt
- Behalte den bestehenden Code-Stil bei
- Füge keine neuen Features hinzu, nur Fixes

${context || ''}`;

    const issuesText = issues.map((issue, idx) => 
      `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}
     Location: ${issue.location}
     Suggestion: ${issue.suggestion}`
    ).join('\n\n');

    const fixPrompt = `Repariere diesen Code:

Aktueller Code:
${code.substring(0, 4000)}${code.length > 4000 ? '...' : ''}

Zu behebende Probleme:
${issuesText}

Repariere den Code und behebe ALLE aufgeführten Probleme.`;

    const response = await llmManager.generate({
      ...request,
      systemPrompt,
      prompt: fixPrompt,
      temperature: 0.3,
      maxTokens: 4000,
    });

    return typeof response === 'string' ? response : ((response as any)?.content || '');
  }
}

export const repairLoop = new RepairLoop();
