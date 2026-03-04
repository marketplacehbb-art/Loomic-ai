import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface RateLimitInfo {
    limit?: string | number;
    remaining?: string | number;
    reset?: string | number;
    provider?: 'gemini' | 'groq' | 'openai' | 'nvidia';
    tokensUsed?: string | number;
    tokenLimit?: string | number;
    plan?: string;
    unknown?: boolean;
    lastUpdated: Date;
}

export interface QuotaInfo {
    scope: 'user' | 'project';
    projectId?: string;
    plan: string;
    requests: {
        limit: number;
        used: number;
        remaining: number;
    };
    tokens: {
        limit: number;
        used: number;
        remaining: number;
    };
    account?: {
        requests: {
            limit: number;
            used: number;
            remaining: number;
        };
        tokens: {
            limit: number;
            used: number;
            remaining: number;
        };
    };
    project?: {
        requests: {
            limit: number;
            used: number;
            remaining: number;
        };
        tokens: {
            limit: number;
            used: number;
            remaining: number;
        };
    };
}

interface UsageContextType {
    rateLimit: RateLimitInfo | null;
    quota: QuotaInfo | null;
    updateRateLimit: (info: Partial<RateLimitInfo>) => void;
    refreshQuota: () => Promise<void>;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

const PROJECT_DAILY_REQUEST_LIMIT = 25;
const PROJECT_DAILY_TOKEN_LIMIT = 50000;

const isMissingTableError = (error: any) =>
    error?.code === 'PGRST205' || error?.code === '42P01';

const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const resolveActiveProjectId = (): string | null => {
    const fromStorage = String(localStorage.getItem('active_project_id') || '').trim();
    if (isUuid(fromStorage)) return fromStorage;

    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = String(searchParams.get('project_id') || '').trim();
    if (isUuid(fromQuery)) return fromQuery;

    return null;
};

export function UsageProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(() => {
        const saved = localStorage.getItem('ai_usage_info');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return parsed;
            } catch (e) {
                return null;
            }
        }
        return null;
    });

    const [quota, setQuota] = useState<QuotaInfo | null>(null);

    const refreshQuota = async () => {
        if (!user) return;

        try {
            const projectId = resolveActiveProjectId();
            // Fetch Quota Definition
            const { data: quotaData, error: quotaError } = await supabase
                .from('user_quotas')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (quotaError) {
                console.error('Error fetching quota:', quotaError);
                return;
            }

            // Fetch Daily Usage
            const today = new Date().toISOString().split('T')[0];
            const { data: usageData, error: usageError } = await supabase
                .from('daily_usage')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', today)
                .maybeSingle();

            if (usageError) {
                console.error('Error fetching usage:', usageError);
                return;
            }

            // Account defaults if no record exists yet
            const limitRequests = quotaData?.daily_requests_limit || 50;
            const limitTokens = quotaData?.daily_tokens_limit || 100000;
            const usedRequests = usageData?.request_count || 0;
            const usedTokens = usageData?.token_count || 0;

            const account = {
                requests: {
                    limit: limitRequests,
                    used: usedRequests,
                    remaining: Math.max(0, limitRequests - usedRequests)
                },
                tokens: {
                    limit: limitTokens,
                    used: usedTokens,
                    remaining: Math.max(0, limitTokens - usedTokens)
                }
            };

            let projectQuota: QuotaInfo['project'] | undefined;
            if (projectId) {
                const { data: projectQuotaData, error: projectQuotaError } = await supabase
                    .from('project_quotas')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('project_id', projectId)
                    .maybeSingle();

                if (projectQuotaError && !isMissingTableError(projectQuotaError)) {
                    console.error('Error fetching project quota:', projectQuotaError);
                } else {
                    const { data: projectUsageData, error: projectUsageError } = await supabase
                        .from('project_daily_usage')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('project_id', projectId)
                        .eq('date', today)
                        .maybeSingle();

                    if (projectUsageError && !isMissingTableError(projectUsageError)) {
                        console.error('Error fetching project usage:', projectUsageError);
                    } else {
                        const projectRequestLimit = projectQuotaData?.daily_requests_limit || PROJECT_DAILY_REQUEST_LIMIT;
                        const projectTokenLimit = projectQuotaData?.daily_tokens_limit || PROJECT_DAILY_TOKEN_LIMIT;
                        const projectRequestsUsed = projectUsageData?.request_count || 0;
                        const projectTokensUsed = projectUsageData?.token_count || 0;
                        projectQuota = {
                            requests: {
                                limit: projectRequestLimit,
                                used: projectRequestsUsed,
                                remaining: Math.max(0, projectRequestLimit - projectRequestsUsed),
                            },
                            tokens: {
                                limit: projectTokenLimit,
                                used: projectTokensUsed,
                                remaining: Math.max(0, projectTokenLimit - projectTokensUsed),
                            },
                        };
                    }
                }
            }

            const scoped = projectQuota || account;
            setQuota({
                scope: projectQuota ? 'project' : 'user',
                projectId: projectQuota ? (projectId || undefined) : undefined,
                plan: quotaData?.plan_type || 'free',
                requests: scoped.requests,
                tokens: scoped.tokens,
                account,
                project: projectQuota,
            });

        } catch (err) {
            console.error('Failed to refresh quota:', err);
        }
    };

    // Initial fetch when user changes
    useEffect(() => {
        if (user) {
            refreshQuota();
        } else {
            setQuota(null);
        }
    }, [user]);

    const updateRateLimit = (info: Partial<RateLimitInfo>) => {
        if (!info) return;
        const newInfo = {
            ...info,
            lastUpdated: new Date()
        } as RateLimitInfo;
        setRateLimit(newInfo);
        localStorage.setItem('ai_usage_info', JSON.stringify(newInfo));
    };

    return (
        <UsageContext.Provider value={{ rateLimit, quota, updateRateLimit, refreshQuota }}>
            {children}
        </UsageContext.Provider>
    );
}

export function useUsage() {
    const context = useContext(UsageContext);
    if (context === undefined) {
        throw new Error('useUsage must be used within a UsageProvider');
    }
    return context;
}
