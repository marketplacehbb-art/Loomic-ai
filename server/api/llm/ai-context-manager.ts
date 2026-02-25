interface ContextRule {
    id: string;
    category: 'style' | 'preference' | 'tech' | 'global';
    content: string;
    weight: number;
}

interface ProjectIteration {
    id: string;
    prompt: string;
    user_feedback?: number;
    correction_notes?: string;
}

export class AIContextManager {
    private rules: ContextRule[] = [];
    private history: ProjectIteration[] = [];

    /**
     * Initializes the manager by fetching context from the database
     */
    async initialize(userId: string, projectId?: string) {
        try {
            // Mock implementation until we have corresponding backend endpoints or direct DB access
            // In a real implementation, this would fetch from 'ai_context_rules' and 'project_iterations'
            console.log(`[AIContextManager] Initializing for User: ${userId}, Project: ${projectId}`);

            // Simulating fetch
            this.rules = [
                { id: '1', category: 'global', content: 'Always use strict TypeScript.', weight: 10 },
                { id: '2', category: 'style', content: 'Prefer "Inter" font and glassmorphism.', weight: 5 }
            ];
        } catch (error) {
            console.error('[AIContextManager] Failed to initialize:', error);
        }
    }

    /**
     * Retrieves relevant context for the current prompt
     * (Simple rule retrieval for now, can be upgraded to Vector Search/RAG later)
     */
    getContextString(): string {
        if (this.rules.length === 0) return '';

        const sortedRules = [...this.rules].sort((a, b) => b.weight - a.weight);

        return `
## PROJECT MEMORY & CONTEXT RULES:
The following rules are PERMANENT for this project/user. You MUST follow them:

${sortedRules.map(r => `- [${r.category.toUpperCase()}] ${r.content}`).join('\n')}
`;
    }

    /**
     * Adds a new rule learned from user feedback
     */
    async addRule(userId: string, category: ContextRule['category'], content: string) {
        console.log(`[AIContextManager] Learning new rule: [${category}] ${content}`);
        // Check for duplicates before adding
        // DB Insert Logic here
        this.rules.push({ id: Date.now().toString(), category, content, weight: 5 });
    }
}

export const aiContextManager = new AIContextManager();
