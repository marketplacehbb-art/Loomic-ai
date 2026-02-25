import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

/**
 * Usage Monitor Middleware
 * Checks user quotas before processing requests
 */
export const usageMonitor = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Only trust the userId set by requireAuth middleware — never the client body.
        // This prevents a client from spoofing another user's quota.
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

        // Estimate tokens (rough approximation: 4 chars = 1 token)
        const promptLength = prompt?.length || 0;
        const contextLength = currentFiles ? JSON.stringify(currentFiles).length : 0;
        const estimatedTokens = Math.ceil((promptLength + contextLength) / 4);

        // Call Supabase RPC to check and increment
        const { data, error } = await supabase.rpc('check_and_increment_quota', {
            p_user_id: userId,
            p_estimated_tokens: estimatedTokens
        });

        if (error) {
            console.error('Usage Check Error:', error);
            // Fail closed for security/cost.
            return res.status(500).json({ error: 'Failed to verify usage quota' });
        }

        if (data && !data.allowed) {
            return res.status(429).json({
                success: false,
                error: `Quota Exceeded: ${data.reason}`,
                code: data.reason,
                limit: data.limit,
                current: data.current
            });
        }

        // Attach usageId to request object so we can update actual tokens later
        (req as any).usageId = data.usage_id;
        (req as any).userPlan = data.plan;
        (req as any).usageStats = {
            limit: data.quota_requests,
            remaining: data.remaining_requests,
            used: data.used_requests,
            plan: data.plan,
            tokenLimit: data.quota_tokens,
            tokensUsed: data.used_tokens
        };

        next();
    } catch (err) {
        console.error('Usage Monitor Middleware Error:', err);
        next(err);
    }
};
