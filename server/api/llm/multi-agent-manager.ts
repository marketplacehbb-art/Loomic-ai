import { llmManager, LLMRequest } from './manager.js';
import { aiContextManager } from './ai-context-manager.js';

interface ReviewerResult {
  status: 'APPROVED' | 'NEEDS_REVISION';
  issues?: string;
}

export class MultiAgentManager {
  private extractContent(response: unknown): string {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'content' in response) {
      const content = (response as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }
    throw new Error('MultiAgent received unexpected LLM response format');
  }

  private deriveContextProjectId(request: LLMRequest): string {
    const keys = Object.keys(request.currentFiles || {});
    if (keys.length === 0) return 'transient-project';
    const sample = keys.sort().slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '');
    return `files_${keys.length}_${sample || 'project'}`;
  }

  private normalizeReviewerPayload(raw: string): ReviewerResult {
    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    const jsonCandidate =
      firstBrace >= 0 && lastBrace > firstBrace
        ? clean.slice(firstBrace, lastBrace + 1)
        : clean;

    const parsed = JSON.parse(jsonCandidate) as { status?: string; issues?: string };
    const rawStatus = String(parsed.status || '').toUpperCase();
    const status: ReviewerResult['status'] =
      rawStatus === 'APPROVED' ? 'APPROVED' : 'NEEDS_REVISION';

    return {
      status,
      issues: typeof parsed.issues === 'string' ? parsed.issues : undefined,
    };
  }

  private async architectAgent(request: LLMRequest, context: string): Promise<string> {
    const systemPrompt = `You are a staff-level software architect.
Your goal is to analyze the request and produce an implementation plan.

${context}

Rules:
- Do not modify files unnecessarily.
- Respect existing code patterns.
- Prefer stable and modern libraries.
Output: JSON object with fields 'explanation', 'files_to_create', 'files_to_edit', 'dependencies', 'step_by_step_instructions'.`;

    const response = await llmManager.generate({
      ...request,
      systemPrompt,
      prompt: `Analyze this request and create an architecture plan: ${request.prompt}`,
    });

    return this.extractContent(response);
  }

  private async coderAgent(
    request: LLMRequest,
    plan: string,
    context: string,
    feedback?: string
  ): Promise<string> {
    const systemPrompt = `You are a senior fullstack engineer.
Your goal is to produce production-ready code based on the architect plan.

${context}

Rules:
- Return complete code (no placeholders).
- Use strict TypeScript.
- Keep output focused on the requested changes.
Output: full files in the expected format.`;

    let prompt = `Implement this plan:\n${plan}`;
    if (feedback) {
      prompt += `\n\nFIX THESE ISSUES identified by the reviewer:\n${feedback}`;
    }

    const response = await llmManager.generate({
      ...request,
      systemPrompt,
      prompt,
    });

    return this.extractContent(response);
  }

  private async reviewerAgent(request: LLMRequest, code: string, context: string): Promise<ReviewerResult> {
    const systemPrompt = `You are a strict tech lead and security reviewer.
Find bugs, security issues, and anti-patterns.

${context}

Output (JSON): { "status": "APPROVED" | "NEEDS_REVISION", "issues": "Issue summary" }`;

    const response = await llmManager.generate({
      ...request,
      systemPrompt,
      prompt: `Review this code for the request "${request.prompt}":\n\n${code}`,
    });

    const raw = this.extractContent(response);
    try {
      return this.normalizeReviewerPayload(raw);
    } catch (error) {
      console.warn('[MultiAgent] Failed to parse reviewer response:', error);
      return {
        status: 'NEEDS_REVISION',
        issues: 'Reviewer output was not valid JSON. Apply a conservative repair pass.',
      };
    }
  }

  /**
   * Orchestrates the multi-agent generation process.
   */
  async generate(request: LLMRequest): Promise<string> {
    console.log(`[MultiAgent] Starting generation for: ${request.prompt.substring(0, 50)}...`);

    await aiContextManager.initialize('anonymous-user', this.deriveContextProjectId(request));
    const projectContext = aiContextManager.getContextString();

    const architecturePlan = await this.architectAgent(request, projectContext);
    console.log('[MultiAgent] Architecture plan created');

    const code = await this.coderAgent(request, architecturePlan, projectContext);
    console.log('[MultiAgent] Code generated');

    const review = await this.reviewerAgent(request, code, projectContext);
    if (review.status === 'APPROVED') {
      console.log('[MultiAgent] Code approved');
      return code;
    }

    console.log('[MultiAgent] Code needs revision, running one correction pass...');
    return this.coderAgent(
      request,
      architecturePlan,
      projectContext,
      review.issues || 'Reviewer requested revision.'
    );
  }
}

export const multiAgentManager = new MultiAgentManager();
