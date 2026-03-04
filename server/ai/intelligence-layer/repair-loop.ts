import { llmManager, LLMRequest } from '../llm/manager.js';
import { CritiqueResult, CritiqueIssue } from './self-critique.js';
import { codeProcessor } from '../../utils/code-processor.js';

/**
 * Repair Loop - Phase 1 Component 4
 * Iteratively fixes code based on critique.
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

type RepairIssueClass = 'syntax' | 'imports' | 'types' | 'runtime' | 'ui' | 'other';

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return name === 'AbortError' || /aborted|aborterror/i.test(message);
}

export class RepairLoop {
  private MAX_ITERATIONS = 3;

  /**
   * Attempt to repair code based on critique.
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
    let pendingIssues = this.prioritizeIssues(remainingIssues);
    const fixesApplied: RepairFix[] = [];
    let iteration = 0;

    const maxIterations = this.MAX_ITERATIONS;

    console.log(`[RepairLoop] Starting repair for ${pendingIssues.length} issues...`);

    for (iteration = 1; iteration <= maxIterations && pendingIssues.length > 0; iteration++) {
      console.log(`[RepairLoop] Iteration ${iteration}/${maxIterations}`);

      const targetBatch = this.selectIssuesForIteration(pendingIssues);
      const issuesToFix = targetBatch.issues;
      const remainingAfterThisIteration = pendingIssues.filter((candidate) => !issuesToFix.includes(candidate));

      try {
        const deterministicRepair = this.applyDeterministicFixes(currentCode, targetBatch.focusClass);
        const candidateCode = deterministicRepair.changed
          ? deterministicRepair.code
          : await this.applyFixes(currentCode, issuesToFix, targetBatch.focusClass, request, context);

        const validation = await codeProcessor.process(candidateCode, 'App.tsx', {
          validate: true,
          bundle: true,
        });

        if (validation.errors.length === 0) {
          currentCode = candidateCode;
          issuesToFix.forEach((issue) => {
            fixesApplied.push({
              issue,
              fix: deterministicRepair.changed
                ? `Applied via deterministic ${targetBatch.focusClass} repair`
                : `Applied via focused ${targetBatch.focusClass} repair`,
              applied: true,
            });
          });

          remainingIssues = remainingAfterThisIteration;
          pendingIssues = this.prioritizeIssues(remainingAfterThisIteration);

          if (pendingIssues.length === 0) {
            break;
          }
        } else {
          console.warn(
            `[RepairLoop] Iteration ${iteration} introduced ${validation.errors.length} new errors while fixing ${targetBatch.focusClass}`
          );
          remainingIssues = pendingIssues;
          break;
        }
      } catch (error: any) {
        if (isAbortError(error) || request.signal?.aborted) {
          throw error;
        }
        console.error(
          `[RepairLoop] Iteration ${iteration} failed while fixing ${targetBatch.focusClass}:`,
          error.message
        );
        remainingIssues = pendingIssues;
        break;
      }
    }

    const success = remainingIssues.length === 0 ||
      remainingIssues.every((issue) => issue.severity === 'minor');

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
   * Prioritize issues by severity.
   */
  private prioritizeIssues(issues: CritiqueIssue[]): CritiqueIssue[] {
    const severityOrder = { critical: 0, major: 1, minor: 2 };
    const categoryOrder: Record<string, number> = {
      syntax: 0,
      imports: 1,
      typescript: 2,
      type: 2,
      runtime: 3,
      accessibility: 4,
      ui: 5,
      logic: 6,
      performance: 7,
      maintainability: 8,
    };

    return [...issues].sort((a, b) => {
      const categoryA = categoryOrder[(a.category || '').toLowerCase()] ?? 99;
      const categoryB = categoryOrder[(b.category || '').toLowerCase()] ?? 99;
      if (categoryA !== categoryB) return categoryA - categoryB;
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private classifyIssue(issue: CritiqueIssue): RepairIssueClass {
    const text = `${issue.category} ${issue.description} ${issue.suggestion} ${issue.location}`.toLowerCase();

    if (/import|module|dependency|resolve|package\.json|cannot find module|cannot resolve/.test(text)) {
      return 'imports';
    }

    if (/syntax|parse|unterminated|expected|jsx|closing tag|semicolon|comma|quote|bracket/.test(text)) {
      return 'syntax';
    }

    if (/type|typescript|assignable|property does not exist|generic|infer|never\b/.test(text)) {
      return 'types';
    }

    if (/runtime|hook|usecontext|usestate|undefined|null|cannot read properties|referenceerror/.test(text)) {
      return 'runtime';
    }

    if (/ui|layout|style|accessibility|aria|contrast|responsive/.test(text)) {
      return 'ui';
    }

    return 'other';
  }

  private selectIssuesForIteration(issues: CritiqueIssue[]): { focusClass: RepairIssueClass; issues: CritiqueIssue[] } {
    const firstIssue = issues[0];
    const focusClass = firstIssue ? this.classifyIssue(firstIssue) : 'other';
    const selected = issues.filter((issue) => this.classifyIssue(issue) === focusClass).slice(0, 2);

    return {
      focusClass,
      issues: selected.length > 0 ? selected : issues.slice(0, 1),
    };
  }

  private applyDeterministicFixes(
    code: string,
    focusClass: RepairIssueClass
  ): { code: string; changed: boolean } {
    let next = code;

    if (focusClass === 'syntax') {
      next = this.stripCodeFences(next);
      next = next.replace(
        /export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*\)\s*;?/g,
        'export default $1;'
      );
    }

    if (focusClass === 'imports' || focusClass === 'syntax') {
      next = this.dedupeImportLines(next);
    }

    return {
      code: next,
      changed: next !== code,
    };
  }

  private stripCodeFences(code: string): string {
    return code
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, '')
      .replace(/\s*```$/i, '');
  }

  private dedupeImportLines(code: string): string {
    const seen = new Set<string>();
    const lines = code.split('\n');
    const nextLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!/^import\s/.test(trimmed)) {
        return true;
      }
      if (seen.has(trimmed)) {
        return false;
      }
      seen.add(trimmed);
      return true;
    });

    return nextLines.join('\n');
  }

  /**
   * Apply focused fixes to code.
   */
  private async applyFixes(
    code: string,
    issues: CritiqueIssue[],
    focusClass: RepairIssueClass,
    request: LLMRequest,
    context?: string
  ): Promise<string> {
    const requestedMaxTokens = typeof request.maxTokens === 'number' ? request.maxTokens : 1400;
    const repairMaxTokens = Math.max(512, Math.min(1600, Math.floor(requestedMaxTokens * 0.65)));

    const systemPrompt = `You are a senior fullstack engineer.\nRepair only the requested issues.\n\nRules:\n- Focus only on the issue class \"${focusClass}\"\n- Change as little code as possible outside the affected lines\n- Return the full final code only\n- No markdown, no explanation\n- Do not add new features\n- Keep TypeScript valid\n\n${context || ''}`;

    const issuesText = issues.map((issue, idx) =>
      `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}\n` +
      `   Location: ${issue.location}\n` +
      `   Suggestion: ${issue.suggestion}`
    ).join('\n\n');

    const locations = issues.map((issue) => issue.location).join(', ');
    const fixPrompt = `Repair this code with a narrow scope.\n\nFocus class: ${focusClass}\nAffected locations: ${locations}\n\nCurrent code:\n${code.substring(0, 4000)}${code.length > 4000 ? '...' : ''}\n\nIssues to fix:\n${issuesText}\n\nRepair only the listed issues and preserve unrelated code.`;

    const response = await llmManager.generate({
      ...request,
      systemPrompt,
      prompt: fixPrompt,
      temperature: 0.2,
      maxTokens: repairMaxTokens,
    });

    return typeof response === 'string' ? response : ((response as any)?.content || '');
  }
}

export const repairLoop = new RepairLoop();
