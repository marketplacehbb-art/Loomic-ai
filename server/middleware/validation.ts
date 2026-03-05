import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const validateRequest = (schema: z.ZodSchema) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync(req.body);
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const issues = error.issues;
                console.error('❌ Validation Error:', JSON.stringify(issues, null, 2));
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: issues.map((e) => ({
                        path: e.path.join('.'),
                        message: e.message
                    }))
                });
            }
            return res.status(400).json({ success: false, error: 'Invalid request data' });
        }
    };
};

// Schemas
const phase1FlagsSchema = z.object({
    specPass: z.boolean().optional(),
    architecturePass: z.boolean().optional(),
    selfCritique: z.boolean().optional(),
    repairLoop: z.boolean().optional(),
}).partial();

const phase2FlagsSchema = z.object({
    astRewrite: z.boolean().optional(),
    qualityScoring: z.boolean().optional(),
    multiFileGeneration: z.boolean().optional(),
}).partial();

const phase3FlagsSchema = z.object({
    dynamicPromptConditioning: z.boolean().optional(),
    intentAgent: z.boolean().optional(),
    dependencyIntelligence: z.boolean().optional(),
    styleDNA: z.boolean().optional(),
    componentMemory: z.boolean().optional(),
}).partial();

const enterpriseFlagsSchema = z.object({
    astPatchExecutor: z.boolean().optional(),
    stylePolicy: z.boolean().optional(),
    libraryQuality: z.boolean().optional(),
    diffPreview: z.boolean().optional(),
    operationUndo: z.boolean().optional(),
    editTelemetry: z.boolean().optional(),
}).partial();

const featureFlagsSchema = z.object({
    phase1: phase1FlagsSchema.optional(),
    phase2: phase2FlagsSchema.optional(),
    phase3: phase3FlagsSchema.optional(),
    enterprise: enterpriseFlagsSchema.optional(),
}).partial();

const supabaseIntegrationSchema = z.object({
    connected: z.boolean().optional(),
    environment: z.enum(['test', 'live']).nullable().optional(),
    projectRef: z.string().nullable().optional(),
    projectUrl: z.string().nullable().optional(),
    hasTestConnection: z.boolean().optional(),
    hasLiveConnection: z.boolean().optional(),
}).partial();

const integrationsSchema = z.object({
    supabase: supabaseIntegrationSchema.nullable().optional(),
}).partial();

export const generateSchema = z.object({
    prompt: z.string().min(10, 'Prompt too short (min 10 chars)').max(5000, 'Prompt too long (max 5000 chars)'),
    provider: z.enum(['gemini', 'groq', 'openai', 'nvidia']),
    mode: z.enum(['generate', 'repair']).nullable().optional(),
    errorContext: z.string().max(8000).nullable().optional(),
    generationMode: z.enum(['new', 'edit']).nullable().optional(),
    templateId: z.string().max(100).nullable().optional(),
    image: z.string().nullable().optional(),
    screenshotBase64: z.string().nullable().optional(),
    screenshotMimeType: z.string().nullable().optional(),
    // zod v4 requires explicit key + value schema for records
    files: z.record(z.string(), z.string()).nullable().optional(),
    systemPrompt: z.string().nullable().optional(),
    temperature: z.number().nullable().optional(),
    maxTokens: z.number().nullable().optional(),
    validate: z.boolean().nullable().optional(),
    bundle: z.boolean().nullable().optional(),
    featureFlags: featureFlagsSchema.optional(),
    integrations: integrationsSchema.optional(),
    userId: z.string().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    editAnchor: z.object({
        nodeId: z.string().optional(),
        tagName: z.string().optional(),
        className: z.string().optional(),
        id: z.string().optional(),
        innerText: z.string().optional(),
        selector: z.string().optional(),
        domPath: z.string().optional(),
        sectionId: z.string().optional(),
        routePath: z.string().optional(),
        sourceId: z.string().optional(),
        href: z.string().optional(),
        role: z.string().optional(),
    }).partial().nullable().optional(),
    knowledgeBase: z.array(z.object({
        path: z.string(),
        content: z.string()
    })).optional()
});
