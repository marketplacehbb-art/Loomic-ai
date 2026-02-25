import { codeProcessor } from '../../utils/code-processor.js';
import { LLMRequest } from './manager.js';

export class SelfCorrectionManager {
    private MAX_RETRIES = 2;

    /**
     * Attempts to fix code that failed validation or bundling
     */
    async attemptFix(
        rawCode: string,
        errors: string[],
        request: LLMRequest,
        context: string
    ): Promise<{ code: string; success: boolean; error?: string }> {

        let currentCode = rawCode;
        let currentErrors = errors;

        console.log(`[SelfCorrection] Starting fix loop for ${errors.length} errors...`);

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            console.log(`[SelfCorrection] Attempt ${attempt}/${this.MAX_RETRIES}`);

            const fixPrompt = `
The previous code generation failed with the following errors:
${currentErrors.map(e => `- ${e}`).join('\n')}

Refactor the code to fix these errors. ensure full functionality.
`;

            // Re-use the Multi-Agent Coder logic (via a direct call or similar)
            // Since MultiAgentManager is a class, we might need to expose the coderAgent or simpler:
            // We can just construct a new prompt for the LLM Manager, but keeping it within the agent persona is better.

            // For now, we will assume we can ask the Coder Agent to "FIX"
            // We need to modify MultiAgentManager to allow direct access or just use LLMManager here with persona.

            // Let's use a direct LLM call with the Coder Persona for speed/simplicity here
            // duplicating the system prompt slightly but keeping it decoupled
            const systemPrompt = `Du bist ein Senior Fullstack Entwickler (Expert Level).
Dein Ziel: Repariere den fehlerhaften Code basierend auf den Fehlermeldungen.
Regeln:
- Schreibe vollständigen Code.
- Nutze TypeScript strikt.
- Behalte den Style und Kontext bei.

${context}`;

            const generated = await import('./manager.js').then(m => m.llmManager.generate({
                ...request,
                systemPrompt,
                prompt: `Here is the broken code:\n\n${currentCode}\n\n${fixPrompt}`
            }));

            const fixedCode =
                typeof generated === 'string'
                    ? generated
                    : (generated && typeof generated === 'object' && 'content' in generated && !('getReader' in generated))
                        ? ((generated as any).content || '')
                        : '';

            if (!fixedCode || typeof fixedCode !== 'string') {
                throw new Error('Self-correction returned invalid response payload');
            }

            // Validate the fix
            const processingResult = await codeProcessor.process(fixedCode, 'App.tsx', { validate: true, bundle: true });

            if (processingResult.errors.length === 0) {
                console.log(`[SelfCorrection] ✅ Fix successful on attempt ${attempt}`);
                return { code: fixedCode, success: true };
            }

            // If still errors, update for next loop
            currentCode = fixedCode;
            currentErrors = processingResult.errors;
            console.log(`[SelfCorrection] ❌ Attempt ${attempt} failed with ${currentErrors.length} errors.`);
        }

        console.log('[SelfCorrection] All attempts failed.');
        return { code: currentCode, success: false, error: 'Max retries reached' };
    }
}

export const selfCorrectionManager = new SelfCorrectionManager();
