import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface RateLimitInfo {
    limit?: string | number;
    remaining?: string | number;
    reset?: string | number;
    provider: 'gemini' | 'deepseek' | 'openai' | 'openrouter' | 'openrouter-openai';
    unknown?: boolean;
    lastUpdated: Date;
}

export interface QuotaInfo {
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
}

interface UsageContextType {
    rateLimit: RateLimitInfo | null;
    quota: QuotaInfo | null;
    updateRateLimit: (info: any) => void;
    refreshQuota: () => Promise<void>;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

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

            // Default values if no record exists yet
            const limitRequests = quotaData?.daily_requests_limit || 50;
            const limitTokens = quotaData?.daily_tokens_limit || 100000;
            const usedRequests = usageData?.request_count || 0;
            const usedTokens = usageData?.token_count || 0;

            setQuota({
                plan: quotaData?.plan_type || 'free',
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

    const updateRateLimit = (info: any) => {
        if (!info) return;
        const newInfo = {
            ...info,
            lastUpdated: new Date()
        };
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
