import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

/**
 * Usage Monitor Middleware
 * Checks user quotas before processing requests
 */

interface QuotaDecision {
    allowed: boolean;
    usage_id?: string;
    plan?: string;
    remaining_requests?: number;
    quota_requests?: number;
    quota_tokens?: number;
    used_requests?: number;
    used_tokens?: number;
    reason?: string;
    current?: number;
    limit?: number;
}

interface UsageCounter {
    plan: string;
    limit: number;
    remaining: number;
    used: number;
    tokenLimit: number;
    tokensUsed: number;
}

interface UsageStats extends UsageCounter {
    scope: 'user' | 'project';
    projectId?: string;
    tokenRemaining: number;
    account: UsageCounter;
    scoped: UsageCounter;
    accountLimit: number;
    accountRemaining: number;
    accountUsed: number;
    accountTokenLimit: number;
    accountTokensUsed: number;
    accountTokenRemaining: number;
    projectLimit?: number;
    projectRemaining?: number;
    projectUsed?: number;
    projectTokenLimit?: number;
    projectTokensUsed?: number;
    projectTokenRemaining?: number;
}

const PROJECT_DAILY_REQUEST_LIMIT = toPositiveInt(process.env.PROJECT_QUOTA_DAILY_REQUEST_LIMIT, 25);
const PROJECT_DAILY_TOKEN_LIMIT = toPositiveInt(process.env.PROJECT_QUOTA_DAILY_TOKEN_LIMIT, 50_000);

function toPositiveInt(input: unknown, fallback: number): number {
    const value = Number.parseInt(String(input ?? ''), 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toNonNegativeInt(input: unknown, fallback = 0): number {
    const value = Number.parseInt(String(input ?? ''), 10);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, value);
}

function normalizeUuid(input: unknown): string {
    if (typeof input !== 'string') return '';
    const value = input.trim();
    if (!value) return '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value
        : '';
}

function isMissingRpcError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === 'PGRST202' ||
        code === '42883' ||
        message.includes('could not find the function') ||
        (message.includes('function') && message.includes('does not exist'))
    );
}

function normalizeCounter(decision: QuotaDecision, fallback: UsageCounter): UsageCounter {
    const limit = toPositiveInt(decision.quota_requests, fallback.limit);
    const used = toNonNegativeInt(decision.used_requests, fallback.used);
    const remainingRaw = toNonNegativeInt(decision.remaining_requests, Math.max(0, limit - used));
    const remaining = Math.max(0, Math.min(limit, remainingRaw));
    const tokenLimit = toPositiveInt(decision.quota_tokens, fallback.tokenLimit);
    const tokensUsed = toNonNegativeInt(decision.used_tokens, fallback.tokensUsed);

    return {
        plan: typeof decision.plan === 'string' && decision.plan.trim() ? decision.plan : fallback.plan,
        limit,
        remaining,
        used: Math.max(used, Math.max(0, limit - remaining)),
        tokenLimit,
        tokensUsed,
    };
}

export function buildUsageStats(input: {
    account: QuotaDecision;
    project?: QuotaDecision | null;
    projectId?: string;
}): UsageStats {
    const accountFallback: UsageCounter = {
        plan: 'free',
        limit: 50,
        remaining: 50,
        used: 0,
        tokenLimit: 100_000,
        tokensUsed: 0,
    };
    const projectFallback: UsageCounter = {
        plan: 'project',
        limit: PROJECT_DAILY_REQUEST_LIMIT,
        remaining: PROJECT_DAILY_REQUEST_LIMIT,
        used: 0,
        tokenLimit: PROJECT_DAILY_TOKEN_LIMIT,
        tokensUsed: 0,
    };

    const account = normalizeCounter(input.account, accountFallback);
    const project = input.project ? normalizeCounter(input.project, projectFallback) : null;
    const scoped = project || account;
    const scope: UsageStats['scope'] = project ? 'project' : 'user';

    return {
        scope,
        projectId: scope === 'project' ? input.projectId : undefined,
        plan: scoped.plan || account.plan,
        limit: scoped.limit,
        remaining: scoped.remaining,
        used: scoped.used,
        tokenLimit: scoped.tokenLimit,
        tokensUsed: scoped.tokensUsed,
        tokenRemaining: Math.max(0, scoped.tokenLimit - scoped.tokensUsed),
        account,
        scoped,
        accountLimit: account.limit,
        accountRemaining: account.remaining,
        accountUsed: account.used,
        accountTokenLimit: account.tokenLimit,
        accountTokensUsed: account.tokensUsed,
        accountTokenRemaining: Math.max(0, account.tokenLimit - account.tokensUsed),
        projectLimit: project?.limit,
        projectRemaining: project?.remaining,
        projectUsed: project?.used,
        projectTokenLimit: project?.tokenLimit,
        projectTokensUsed: project?.tokensUsed,
        projectTokenRemaining: project ? Math.max(0, project.tokenLimit - project.tokensUsed) : undefined,
    };
}

async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('[UsageMonitor] Failed to verify project ownership:', error);
        return false;
    }

    return Boolean(data?.id);
}

export const usageMonitor = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Only trust the userId set by requireAuth middleware, never the client body.
        const userId = (req as any).authUser?.id as string | undefined;
        const prompt = req.body?.prompt;
        const currentFiles = req.body?.currentFiles || req.body?.files;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: User ID required for generation',
                code: 'AUTH_REQUIRED'
            });
        }

        // Keep req.body.userId in sync with the verified auth identity.
        req.body.userId = userId;

        const projectId = normalizeUuid((req.body as any)?.projectId || (req.query as any)?.projectId);
        if (projectId) {
            const isOwner = await verifyProjectOwnership(projectId, userId);
            if (!isOwner) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: project access denied',
                    code: 'PROJECT_ACCESS_DENIED',
                });
            }
        }

        // Estimate tokens (rough approximation: 4 chars = 1 token)
        const promptLength = prompt?.length || 0;
        const contextLength = currentFiles ? JSON.stringify(currentFiles).length : 0;
        const estimatedTokens = Math.ceil((promptLength + contextLength) / 4);

        // 1) Account-level quota (always enforced)
        const accountResult = await supabase.rpc('check_and_increment_quota', {
            p_user_id: userId,
            p_estimated_tokens: estimatedTokens
        });

        if (accountResult.error) {
            console.error('Usage Check Error:', accountResult.error);
            return res.status(500).json({ error: 'Failed to verify usage quota' });
        }

        const accountDecision = (accountResult.data || {}) as QuotaDecision;
        if (accountDecision && !accountDecision.allowed) {
            return res.status(429).json({
                success: false,
                error: `Quota Exceeded: ${accountDecision.reason}`,
                code: accountDecision.reason,
                limit: accountDecision.limit,
                current: accountDecision.current
            });
        }

        // 2) Project-level quota (optional, only if projectId provided and RPC exists)
        let projectDecision: QuotaDecision | null = null;
        if (projectId) {
            const projectResult = await supabase.rpc('check_and_increment_project_quota', {
                p_user_id: userId,
                p_project_id: projectId,
                p_estimated_tokens: estimatedTokens,
            });

            if (projectResult.error) {
                if (!isMissingRpcError(projectResult.error)) {
                    console.error('Project Usage Check Error:', projectResult.error);
                    return res.status(500).json({ error: 'Failed to verify project usage quota' });
                }
            } else {
                projectDecision = (projectResult.data || {}) as QuotaDecision;
                if (projectDecision && !projectDecision.allowed) {
                    return res.status(429).json({
                        success: false,
                        error: `Project Quota Exceeded: ${projectDecision.reason}`,
                        code: projectDecision.reason || 'PROJECT_QUOTA_EXCEEDED',
                        projectId,
                        limit: projectDecision.limit,
                        current: projectDecision.current,
                    });
                }
            }
        }

        const usageStats = buildUsageStats({
            account: accountDecision,
            project: projectDecision,
            projectId,
        });

        // Attach usage IDs so actual output tokens can be persisted post-generation.
        (req as any).usageId = accountDecision.usage_id;
        (req as any).projectUsageId = projectDecision?.usage_id;
        (req as any).userPlan = usageStats.plan;
        (req as any).usageStats = usageStats;

        next();
    } catch (err) {
        console.error('Usage Monitor Middleware Error:', err);
        next(err);
    }
};
