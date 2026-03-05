import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
    BarChart3,
    Bell,
    Check,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Pencil,
    Shield,
    Trash2,
    User as UserIcon,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../contexts/UsageContext';
import { api } from '../lib/api';
import { resolveImageWithFallback } from '../lib/assets';
import { supabase } from '../lib/supabase';

type SettingsTab = 'profile' | 'account' | 'api-keys' | 'notifications' | 'usage';
type DisplayApiProvider = 'deepseek' | 'openai' | 'gemini' | 'groq' | 'openrouter';

interface ToastState {
    id: number;
    type: 'success' | 'error';
    text: string;
}

interface SettingsProfileRow {
    id: string;
    username?: string | null;
    full_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    notify_generation_complete?: boolean | null;
    notify_weekly_summary?: boolean | null;
    notify_product_updates?: boolean | null;
    notify_security_alerts?: boolean | null;
    plan_type?: string | null;
    plan?: string | null;
    [key: string]: unknown;
}

interface ProfileFormState {
    username: string;
    fullName: string;
    bio: string;
    avatarUrl: string;
}

interface NotificationPreferences {
    generationCompleteEmail: boolean;
    weeklyUsageSummary: boolean;
    productUpdatesNews: boolean;
    securityAlerts: boolean;
}

interface ApiKeyFieldState {
    value: string;
    visible: boolean;
    saving: boolean;
    testing: boolean;
    configured: boolean;
    masked: string;
    testResult: 'idle' | 'valid' | 'invalid';
    testMessage: string;
}

type ApiKeyStateMap = Record<DisplayApiProvider, ApiKeyFieldState>;

interface UsageHistoryRow {
    id: string;
    createdAt: string;
    prompt: string;
    tokens: number;
}

interface UsageStats {
    plan: 'Free' | 'Pro';
    generationsThisMonth: number;
    generationsLimit: number;
    tokensUsed: number;
    tokensLimit: number;
    storageUsedMb: number;
    storageLimitMb: number;
    history: UsageHistoryRow[];
}

interface AuditLogRow {
    created_at: string;
    details: Record<string, unknown> | null;
}

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'account', label: 'Account', icon: Shield },
    { id: 'api-keys', label: 'API Keys', icon: KeyRound },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
];

const API_KEY_ROWS: Array<{ id: DisplayApiProvider; label: string; placeholder: string }> = [
    { id: 'deepseek', label: 'DeepSeek API Key', placeholder: 'sk-************' },
    { id: 'openai', label: 'OpenAI API Key', placeholder: 'sk-************' },
    { id: 'gemini', label: 'Gemini API Key', placeholder: 'AIza************' },
    { id: 'groq', label: 'Groq API Key', placeholder: 'gsk_************' },
    { id: 'openrouter', label: 'OpenRouter API Key', placeholder: 'sk-or-************' },
];

const createDefaultApiKeyState = (): ApiKeyStateMap => ({
    deepseek: {
        value: '',
        visible: false,
        saving: false,
        testing: false,
        configured: false,
        masked: '',
        testResult: 'idle',
        testMessage: '',
    },
    openai: {
        value: '',
        visible: false,
        saving: false,
        testing: false,
        configured: false,
        masked: '',
        testResult: 'idle',
        testMessage: '',
    },
    gemini: {
        value: '',
        visible: false,
        saving: false,
        testing: false,
        configured: false,
        masked: '',
        testResult: 'idle',
        testMessage: '',
    },
    groq: {
        value: '',
        visible: false,
        saving: false,
        testing: false,
        configured: false,
        masked: '',
        testResult: 'idle',
        testMessage: '',
    },
    openrouter: {
        value: '',
        visible: false,
        saving: false,
        testing: false,
        configured: false,
        masked: '',
        testResult: 'idle',
        testMessage: '',
    },
});

const defaultNotifications: NotificationPreferences = {
    generationCompleteEmail: true,
    weeklyUsageSummary: true,
    productUpdatesNews: true,
    securityAlerts: true,
};

const defaultUsageStats: UsageStats = {
    plan: 'Free',
    generationsThisMonth: 0,
    generationsLimit: 50,
    tokensUsed: 0,
    tokensLimit: 100000,
    storageUsedMb: 0,
    storageLimitMb: 500,
    history: [],
};

const isMissingRowError = (error: unknown): boolean => {
    const code = String((error as { code?: string } | null)?.code || '');
    return code === 'PGRST116';
};

const readBoolean = (value: unknown, fallback: boolean): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    }
    return fallback;
};

const maskApiKey = (value: string): string => {
    const safe = value.trim();
    if (!safe) return '';
    if (safe.length <= 8) return `${safe.slice(0, 2)}****`;
    return `${safe.slice(0, 4)}********${safe.slice(-4)}`;
};

const extractPromptFromDetails = (details: Record<string, unknown>): string => {
    const promptCandidate = details.prompt || details.request_prompt || details.userPrompt || details.input_prompt || '';
    const prompt = String(promptCandidate || '').trim();
    if (!prompt) return 'No prompt captured';
    return prompt.length > 120 ? `${prompt.slice(0, 117)}...` : prompt;
};

const extractTokensFromDetails = (details: Record<string, unknown>): number => {
    const value =
        details.total_tokens ||
        details.tokens_total ||
        details.tokensTotal ||
        details.token_count ||
        details.tokenCount ||
        details.tokens ||
        0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const toMB = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 10) / 10;

const resolveInitials = (fullName: string, username: string, email: string): string => {
    const source = fullName.trim() || username.trim() || email.trim();
    if (!source) return 'U';
    if (source.includes(' ')) {
        const words = source.split(' ').filter(Boolean);
        const initials = `${words[0]?.charAt(0) || ''}${words[1]?.charAt(0) || ''}`.toUpperCase();
        return initials || 'U';
    }
    if (source.includes('@')) {
        const localPart = source.split('@')[0] || '';
        return (localPart.slice(0, 2) || 'U').toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
};

export default function Settings() {
    const navigate = useNavigate();
    const { user: authUser, signOut, refreshProfile } = useAuth();
    const { quota } = useUsage();

    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [bootLoading, setBootLoading] = useState(true);
    const [saveLoading, setSaveLoading] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [apiKeysLoading, setApiKeysLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [notificationsSaving, setNotificationsSaving] = useState(false);
    const [usageLoading, setUsageLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [settingsUser, setSettingsUser] = useState<User | null>(null);
    const [profileForm, setProfileForm] = useState<ProfileFormState>({
        username: '',
        fullName: '',
        bio: '',
        avatarUrl: '',
    });
    const [notifications, setNotifications] = useState<NotificationPreferences>(defaultNotifications);
    const [apiKeys, setApiKeys] = useState<ApiKeyStateMap>(createDefaultApiKeyState());
    const [passwordForm, setPasswordForm] = useState({
        newPassword: '',
        confirmPassword: '',
    });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [usageStats, setUsageStats] = useState<UsageStats>(defaultUsageStats);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deleteError, setDeleteError] = useState('');

    const [toast, setToast] = useState<ToastState | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);

    const currentUser = settingsUser || authUser;

    const showToast = useCallback((type: 'success' | 'error', text: string) => {
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
        const nextToast = {
            id: Date.now(),
            type,
            text,
        };
        setToast(nextToast);
        toastTimerRef.current = window.setTimeout(() => {
            setToast((activeToast) => (activeToast?.id === nextToast.id ? null : activeToast));
            toastTimerRef.current = null;
        }, 3500);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
        };
    }, []);

    const initials = useMemo(
        () => resolveInitials(profileForm.fullName, profileForm.username, currentUser?.email || ''),
        [profileForm.fullName, profileForm.username, currentUser?.email]
    );

    const updateApiKeyField = useCallback(
        (provider: DisplayApiProvider, patch: Partial<ApiKeyFieldState>) => {
            setApiKeys((prev) => ({
                ...prev,
                [provider]: {
                    ...prev[provider],
                    ...patch,
                },
            }));
        },
        []
    );

    const loadApiKeys = useCallback(async () => {
        setApiKeysLoading(true);
        try {
            const response = await api.getUserApiKeysStatus();
            if (!response.success || !response.keys) {
                if (response.error) {
                    showToast('error', response.error);
                }
                return;
            }

            setApiKeys((prev) => {
                const next: ApiKeyStateMap = { ...prev };
                for (const row of API_KEY_ROWS) {
                    const status = response.keys?.[row.id];
                    if (!status) continue;
                    next[row.id] = {
                        ...next[row.id],
                        configured: Boolean(status.configured),
                        masked: String(status.masked || ''),
                    };
                }
                return next;
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load API keys';
            showToast('error', message);
        } finally {
            setApiKeysLoading(false);
        }
    }, [showToast]);

    const loadUsage = useCallback(
        async (userId: string, profileData: SettingsProfileRow | null) => {
            setUsageLoading(true);
            try {
                const now = new Date();
                const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

                const [monthCountResult, monthLogsResult, historyResult, projectsResult] = await Promise.all([
                    supabase
                        .from('audit_logs')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', userId)
                        .eq('action', 'generate_code')
                        .gte('created_at', monthStart),
                    supabase
                        .from('audit_logs')
                        .select('details')
                        .eq('user_id', userId)
                        .eq('action', 'generate_code')
                        .gte('created_at', monthStart),
                    supabase
                        .from('audit_logs')
                        .select('created_at,details')
                        .eq('user_id', userId)
                        .eq('action', 'generate_code')
                        .order('created_at', { ascending: false })
                        .limit(10),
                    supabase
                        .from('projects')
                        .select('id,code')
                        .eq('user_id', userId)
                        .is('deleted_at', null),
                ]);

                if (monthCountResult.error) throw monthCountResult.error;
                if (monthLogsResult.error) throw monthLogsResult.error;
                if (historyResult.error) throw historyResult.error;
                if (projectsResult.error) throw projectsResult.error;

                const monthlyLogs = (monthLogsResult.data || []) as Array<{ details: Record<string, unknown> | null }>;
                const monthlyTokens = monthlyLogs.reduce((sum, row) => {
                    const details = row.details && typeof row.details === 'object' ? row.details : {};
                    return sum + extractTokensFromDetails(details as Record<string, unknown>);
                }, 0);

                const historyRows = ((historyResult.data || []) as AuditLogRow[]).map((row, index) => {
                    const details = row.details && typeof row.details === 'object' ? row.details : {};
                    const typedDetails = details as Record<string, unknown>;
                    return {
                        id: `${row.created_at}-${index}`,
                        createdAt: row.created_at,
                        prompt: extractPromptFromDetails(typedDetails),
                        tokens: extractTokensFromDetails(typedDetails),
                    };
                });

                const encoder = new TextEncoder();
                const projectRows = (projectsResult.data || []) as Array<{ code: string | null }>;
                const storageBytes = projectRows.reduce((sum, row) => {
                    const code = row.code || '';
                    return sum + encoder.encode(code).length;
                }, 0);

                const quotaPlan = String(quota?.plan || '').toLowerCase();
                const profilePlan = String(profileData?.plan_type || profileData?.plan || '').toLowerCase();
                const normalizedPlan = quotaPlan || profilePlan;
                const plan = normalizedPlan.includes('pro') ? 'Pro' : 'Free';

                setUsageStats({
                    plan,
                    generationsThisMonth: Math.max(0, Number(monthCountResult.count || 0)),
                    generationsLimit: 50,
                    tokensUsed: Math.max(0, monthlyTokens),
                    tokensLimit: 100000,
                    storageUsedMb: toMB(storageBytes),
                    storageLimitMb: 500,
                    history: historyRows,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Failed to load usage';
                showToast('error', message);
            } finally {
                setUsageLoading(false);
            }
        },
        [quota?.plan, showToast]
    );

    const loadSettingsData = useCallback(async () => {
        setBootLoading(true);
        try {
            const {
                data: { user: fetchedUser },
                error: userError,
            } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!fetchedUser) throw new Error('Unable to load authenticated user');

            setSettingsUser(fetchedUser);

            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', fetchedUser.id)
                .single();

            let resolvedProfile: SettingsProfileRow | null = null;

            if (profileError && !isMissingRowError(profileError)) {
                throw profileError;
            }
            if (profileData && typeof profileData === 'object') {
                resolvedProfile = profileData as SettingsProfileRow;
            }

            if (!resolvedProfile) {
                const fallbackProfile = await api.getUserProfile(fetchedUser.id);
                if (fallbackProfile) {
                    resolvedProfile = {
                        id: fetchedUser.id,
                        username: fallbackProfile.username,
                        full_name: fallbackProfile.full_name,
                        bio: fallbackProfile.bio,
                        avatar_url: fallbackProfile.avatar_url,
                    };
                }
            }

            const fallbackPrefs = await api.getEmailPreferences(fetchedUser.id).catch(() => null);

            setProfileForm({
                username: String(resolvedProfile?.username || ''),
                fullName: String(resolvedProfile?.full_name || ''),
                bio: String(resolvedProfile?.bio || ''),
                avatarUrl: String(resolvedProfile?.avatar_url || ''),
            });

            setNotifications({
                generationCompleteEmail: readBoolean(
                    resolvedProfile?.notify_generation_complete,
                    readBoolean(fallbackPrefs?.notify_generation_complete, true)
                ),
                weeklyUsageSummary: readBoolean(
                    resolvedProfile?.notify_weekly_summary,
                    readBoolean(fallbackPrefs?.notify_weekly_report, true)
                ),
                productUpdatesNews: readBoolean(
                    resolvedProfile?.notify_product_updates,
                    readBoolean(fallbackPrefs?.notify_product_updates, true)
                ),
                securityAlerts: true,
            });

            await Promise.all([loadApiKeys(), loadUsage(fetchedUser.id, resolvedProfile)]);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load settings';
            showToast('error', message);
        } finally {
            setBootLoading(false);
        }
    }, [loadApiKeys, loadUsage, showToast]);

    useEffect(() => {
        void loadSettingsData();
    }, [loadSettingsData]);

    const handleProfileSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!currentUser) {
            showToast('error', 'No active user session');
            return;
        }

        setSaveLoading(true);
        try {
            const username = profileForm.username.trim();
            const full_name = profileForm.fullName.trim();
            const bio = profileForm.bio.trim();

            const { error } = await supabase
                .from('profiles')
                .update({
                    username,
                    full_name,
                    bio,
                })
                .eq('id', currentUser.id)
                .select('id')
                .single();

            if (error) {
                if (!isMissingRowError(error)) throw error;
                const { error: upsertError } = await supabase.from('profiles').upsert({
                    id: currentUser.id,
                    username,
                    full_name,
                    bio,
                });
                if (upsertError) throw upsertError;
            }

            await api
                .updateUserProfile(currentUser.id, {
                    username: username || null,
                    full_name: full_name || null,
                    bio: bio || null,
                })
                .catch(() => null);
            await refreshProfile().catch(() => null);

            showToast('success', 'Profile updated successfully');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to update profile';
            showToast('error', message);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile || !currentUser) return;

        if (!selectedFile.type.startsWith('image/')) {
            showToast('error', 'Please select a valid image file');
            event.target.value = '';
            return;
        }
        if (selectedFile.size > 2 * 1024 * 1024) {
            showToast('error', 'Avatar must be 2MB or smaller');
            event.target.value = '';
            return;
        }

        setAvatarUploading(true);
        try {
            const storagePath = `${currentUser.id}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(storagePath, selectedFile, {
                upsert: true,
                contentType: selectedFile.type,
            });
            if (uploadError) throw uploadError;

            const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
            const avatarUrl = publicData.publicUrl;

            const { error: profileError } = await supabase
                .from('profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', currentUser.id)
                .select('id')
                .single();
            if (profileError) {
                if (!isMissingRowError(profileError)) throw profileError;
                const { error: upsertAvatarError } = await supabase.from('profiles').upsert({
                    id: currentUser.id,
                    avatar_url: avatarUrl,
                });
                if (upsertAvatarError) throw upsertAvatarError;
            }

            await api.updateUserProfile(currentUser.id, { avatar_url: avatarUrl }).catch(() => null);
            await refreshProfile().catch(() => null);
            setProfileForm((prev) => ({ ...prev, avatarUrl }));
            showToast('success', 'Avatar updated successfully');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to upload avatar';
            showToast('error', message);
        } finally {
            setAvatarUploading(false);
            event.target.value = '';
        }
    };

    const handlePasswordUpdate = async (event: React.FormEvent) => {
        event.preventDefault();
        if (passwordLoading) return;
        setPasswordError('');
        setPasswordSuccess('');

        if (passwordForm.newPassword.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }

        setPasswordLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
            if (error) throw error;

            setPasswordSuccess('Password updated successfully');
            setPasswordForm({ newPassword: '', confirmPassword: '' });
            showToast('success', 'Password updated successfully');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to update password';
            setPasswordError(message);
            showToast('error', message);
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleSaveApiKey = async (provider: DisplayApiProvider) => {
        const value = apiKeys[provider].value.trim();
        if (!value) {
            showToast('error', 'Please enter an API key before saving');
            return;
        }

        updateApiKeyField(provider, { saving: true, testResult: 'idle', testMessage: '' });
        try {
            const response = await api.saveUserApiKey({
                provider,
                apiKey: value,
            });
            if (!response.success) {
                throw new Error(response.error || 'Failed to save API key');
            }

            updateApiKeyField(provider, {
                value: '',
                configured: true,
                masked: maskApiKey(value),
            });
            showToast('success', `${API_KEY_ROWS.find((item) => item.id === provider)?.label || provider} saved`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to save API key';
            showToast('error', message);
        } finally {
            updateApiKeyField(provider, { saving: false });
        }
    };

    const handleTestApiKey = async (provider: DisplayApiProvider) => {
        const value = apiKeys[provider].value.trim();
        updateApiKeyField(provider, { testing: true, testResult: 'idle', testMessage: '' });
        try {
            const response = await api.testUserApiKey({
                provider,
                apiKey: value || undefined,
            });

            if (!response.success) {
                throw new Error(response.error || 'Unable to test API key');
            }

            if (response.valid) {
                updateApiKeyField(provider, {
                    testResult: 'valid',
                    testMessage: 'Valid',
                });
            } else {
                updateApiKeyField(provider, {
                    testResult: 'invalid',
                    testMessage: response.message || 'Invalid',
                });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to test API key';
            updateApiKeyField(provider, {
                testResult: 'invalid',
                testMessage: message,
            });
        } finally {
            updateApiKeyField(provider, { testing: false });
        }
    };

    const handleSaveNotifications = async () => {
        if (!currentUser) {
            showToast('error', 'No active user session');
            return;
        }

        setNotificationsSaving(true);
        try {
            const payload = {
                notify_generation_complete: notifications.generationCompleteEmail,
                notify_weekly_summary: notifications.weeklyUsageSummary,
                notify_product_updates: notifications.productUpdatesNews,
                notify_security_alerts: true,
            };

            const { error } = await supabase
                .from('profiles')
                .update(payload)
                .eq('id', currentUser.id)
                .select('id')
                .single();

            if (error) {
                if (isMissingRowError(error)) {
                    const { error: upsertPreferencesError } = await supabase.from('profiles').upsert({
                        id: currentUser.id,
                        ...payload,
                    });
                    if (!upsertPreferencesError) {
                        showToast('success', 'Notification preferences updated');
                        return;
                    }
                }
                await api.updateEmailPreferences(currentUser.id, {
                    notify_generation_complete: notifications.generationCompleteEmail,
                    notify_weekly_report: notifications.weeklyUsageSummary,
                    notify_product_updates: notifications.productUpdatesNews,
                    notify_error_alerts: true,
                });
            }

            showToast('success', 'Notification preferences updated');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to update notification preferences';
            showToast('error', message);
        } finally {
            setNotificationsSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!currentUser?.email) {
            setDeleteError('User session invalid');
            return;
        }

        const normalizedEmail = deleteEmail.trim().toLowerCase();
        const expected = currentUser.email.trim().toLowerCase();
        if (!normalizedEmail || normalizedEmail !== expected) {
            setDeleteError('Confirmation email does not match your account email');
            return;
        }

        setDeleteLoading(true);
        setDeleteError('');
        try {
            const response = await api.deleteAccount({ email: deleteEmail.trim() });
            if (!response.success) {
                throw new Error(response.error || 'Failed to delete account');
            }

            showToast('success', 'Account deleted successfully');
            await signOut();
            navigate('/login', { replace: true });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to delete account';
            setDeleteError(message);
            showToast('error', message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const generationsProgress = Math.min(
        100,
        Math.round((usageStats.generationsThisMonth / Math.max(1, usageStats.generationsLimit)) * 100)
    );
    const tokenProgress = Math.min(100, Math.round((usageStats.tokensUsed / Math.max(1, usageStats.tokensLimit)) * 100));
    const storageProgress = Math.min(
        100,
        Math.round((usageStats.storageUsedMb / Math.max(1, usageStats.storageLimitMb)) * 100)
    );

    const renderProfileTab = () => (
        <form onSubmit={handleProfileSave} className="max-w-3xl space-y-7">
            <div className="flex flex-wrap items-center gap-5">
                <div className="relative">
                    {profileForm.avatarUrl ? (
                        <img
                            src={resolveImageWithFallback(profileForm.avatarUrl)}
                            alt="Avatar"
                            className="h-24 w-24 rounded-full border border-slate-200 object-cover dark:border-white/10"
                            onError={(event) => {
                                event.currentTarget.src = resolveImageWithFallback(null);
                            }}
                        />
                    ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-bold text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
                            {initials}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="absolute bottom-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary text-white transition hover:bg-primary/90 dark:border-[#121620]"
                        title="Upload avatar"
                    >
                        {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    </button>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                    />
                </div>
                <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{currentUser?.email || 'Unknown user'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Upload an image (max 2MB). Supported: image/*</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Username</span>
                    <input
                        type="text"
                        value={profileForm.username}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                        placeholder="@username"
                    />
                </label>
                <label className="space-y-2 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Full Name</span>
                    <input
                        type="text"
                        value={profileForm.fullName}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                        placeholder="Jane Doe"
                    />
                </label>
            </div>

            <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Bio</span>
                <textarea
                    value={profileForm.bio}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, bio: event.target.value }))}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    placeholder="Tell people about yourself..."
                />
            </label>

            <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
                {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
            </button>
        </form>
    );
    const renderAccountTab = () => (
        <div className="max-w-3xl space-y-10">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/5">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Change Password</h3>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                    <label className="block space-y-2 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">New Password</span>
                        <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(event) =>
                                setPasswordForm((prev) => ({
                                    ...prev,
                                    newPassword: event.target.value,
                                }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                            placeholder="Minimum 8 characters"
                        />
                    </label>
                    <label className="block space-y-2 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Confirm Password</span>
                        <input
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(event) =>
                                setPasswordForm((prev) => ({
                                    ...prev,
                                    confirmPassword: event.target.value,
                                }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                            placeholder="Re-enter new password"
                        />
                    </label>
                    {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
                    {passwordSuccess && <p className="text-sm text-emerald-500">{passwordSuccess}</p>}
                    <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
                    >
                        {passwordLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Update Password
                    </button>
                </form>
            </section>

            <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
                <h3 className="mb-2 text-lg font-semibold text-red-400">Danger Zone</h3>
                <p className="mb-5 text-sm text-red-200/80">
                    Deleting your account will permanently remove all projects and cannot be undone.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setDeleteModalOpen(true);
                        setDeleteEmail('');
                        setDeleteError('');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
                >
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                </button>
            </section>
        </div>
    );
    const renderApiKeysTab = () => (
        <div className="max-w-4xl space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">AI Provider Keys</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Add your own API keys to use premium models
                </p>
            </div>

            <div className="space-y-4">
                {API_KEY_ROWS.map((row) => {
                    const rowState = apiKeys[row.id];
                    const inputType = rowState.visible ? 'text' : 'password';
                    const statusText =
                        rowState.testResult === 'valid'
                            ? '✓ Valid'
                            : rowState.testResult === 'invalid'
                              ? `✗ ${rowState.testMessage || 'Invalid'}`
                              : '';

                    return (
                        <div
                            key={row.id}
                            className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5 lg:grid-cols-[220px_1fr_auto_auto]"
                        >
                            <p className="self-center text-sm font-medium text-slate-700 dark:text-slate-200">{row.label}</p>
                            <div className="relative">
                                <input
                                    type={inputType}
                                    value={rowState.value}
                                    onChange={(event) =>
                                        updateApiKeyField(row.id, {
                                            value: event.target.value,
                                            testResult: 'idle',
                                            testMessage: '',
                                        })
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20 dark:text-white"
                                    placeholder={rowState.masked || row.placeholder}
                                />
                                <button
                                    type="button"
                                    onClick={() => updateApiKeyField(row.id, { visible: !rowState.visible })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                    title={rowState.visible ? 'Hide API key' : 'Show API key'}
                                >
                                    {rowState.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleSaveApiKey(row.id);
                                }}
                                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                            >
                                {rowState.saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleTestApiKey(row.id);
                                }}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                                {rowState.testing ? 'Testing...' : 'Test'}
                            </button>

                            <div className="lg:col-start-2 lg:col-end-5">
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                    {rowState.configured && (
                                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
                                            Saved ({rowState.masked || 'configured'})
                                        </span>
                                    )}
                                    {statusText && (
                                        <span className={rowState.testResult === 'valid' ? 'text-emerald-500' : 'text-red-500'}>
                                            {statusText}
                                        </span>
                                    )}
                                    {apiKeysLoading && (
                                        <span className="text-slate-500 dark:text-slate-400">Refreshing status...</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400">Your keys are encrypted and never shared</p>
        </div>
    );
    const renderNotificationsTab = () => (
        <div className="max-w-3xl space-y-6">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/5">
                {[
                    {
                        key: 'generationCompleteEmail',
                        label: 'Generation complete email',
                        disabled: false,
                    },
                    {
                        key: 'weeklyUsageSummary',
                        label: 'Weekly usage summary',
                        disabled: false,
                    },
                    {
                        key: 'productUpdatesNews',
                        label: 'Product updates & news',
                        disabled: false,
                    },
                    {
                        key: 'securityAlerts',
                        label: 'Security alerts',
                        disabled: true,
                    },
                ].map((item) => {
                    const typedKey = item.key as keyof NotificationPreferences;
                    const checked = notifications[typedKey];
                    return (
                        <div key={item.key} className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                            <button
                                type="button"
                                disabled={item.disabled}
                                onClick={() => {
                                    if (item.disabled) return;
                                    setNotifications((prev) => ({
                                        ...prev,
                                        [typedKey]: !checked,
                                    }));
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                                    checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                                } ${item.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                        checked ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button
                type="button"
                onClick={() => {
                    void handleSaveNotifications();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
                {notificationsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Preferences
            </button>
        </div>
    );
    const renderUsageTab = () => (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Current Plan
                    </p>
                    <span
                        className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            usageStats.plan === 'Pro'
                                ? 'bg-primary/20 text-primary'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                        }`}
                    >
                        {usageStats.plan}
                    </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Generations This Month
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                        {usageStats.generationsThisMonth} / {usageStats.generationsLimit}
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, generationsProgress)}%` }} />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Tokens Used
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                        {usageStats.tokensUsed.toLocaleString()} / {usageStats.tokensLimit.toLocaleString()}
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, tokenProgress)}%` }} />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Storage Used
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                        {usageStats.storageUsedMb} MB / {usageStats.storageLimitMb} MB
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, storageProgress)}%` }} />
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={() => navigate('/billing')}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90"
            >
                Upgrade to Pro
            </button>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">Usage History</h3>
                    {usageLoading && <span className="text-xs text-slate-500 dark:text-slate-400">Refreshing...</span>}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                                <th className="py-2 pr-4 font-medium">Date</th>
                                <th className="py-2 pr-4 font-medium">Prompt</th>
                                <th className="py-2 font-medium">Tokens Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usageStats.history.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="py-4 text-slate-500 dark:text-slate-400">
                                        No generations yet.
                                    </td>
                                </tr>
                            )}
                            {usageStats.history.map((entry) => (
                                <tr
                                    key={entry.id}
                                    className="border-b border-slate-100 text-slate-700 dark:border-white/5 dark:text-slate-300"
                                >
                                    <td className="whitespace-nowrap py-3 pr-4">{new Date(entry.createdAt).toLocaleString()}</td>
                                    <td className="py-3 pr-4">{entry.prompt}</td>
                                    <td className="py-3">{entry.tokens.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderActiveTab = () => {
        if (activeTab === 'profile') return renderProfileTab();
        if (activeTab === 'account') return renderAccountTab();
        if (activeTab === 'api-keys') return renderApiKeysTab();
        if (activeTab === 'notifications') return renderNotificationsTab();
        return renderUsageTab();
    };

    return (
        <div className="min-h-screen bg-background-light text-slate-900 transition-colors duration-300 dark:bg-background-dark dark:text-slate-100">
            <Sidebar />
            <main className="ml-64 px-6 py-8 lg:px-10">
                <div className="mx-auto max-w-6xl">
                    <header className="mb-8">
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h1>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Manage profile, account security, API keys, and usage.
                        </p>
                    </header>

                    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#121620]">
                        <div className="flex flex-wrap gap-4 border-b border-slate-200 px-6 py-4 dark:border-white/10">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const active = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative inline-flex items-center gap-2 pb-3 text-sm font-semibold transition-colors ${
                                            active
                                                ? 'text-white dark:text-white'
                                                : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span>{tab.label}</span>
                                        {active && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-primary" />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-6 lg:p-8">
                            {bootLoading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading settings...
                                </div>
                            ) : (
                                renderActiveTab()
                            )}
                        </div>
                    </section>
                </div>
            </main>

            {deleteModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#151820] p-6 shadow-2xl">
                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <h4 className="text-lg font-semibold text-white">Delete Account</h4>
                                <p className="mt-2 text-sm text-slate-300">
                                    Are you sure? This will permanently delete all your projects.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeleteModalOpen(false)}
                                className="text-slate-400 transition hover:text-slate-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <label className="mb-4 block space-y-2 text-sm">
                            <span className="font-medium text-slate-200">Type your email to confirm:</span>
                            <input
                                type="email"
                                value={deleteEmail}
                                onChange={(event) => setDeleteEmail(event.target.value)}
                                className="w-full rounded-xl border border-red-500/30 bg-black/20 px-4 py-2.5 text-sm text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                                placeholder={currentUser?.email || 'your@email.com'}
                            />
                        </label>

                        {deleteError && <p className="mb-3 text-sm text-red-400">{deleteError}</p>}

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteModalOpen(false)}
                                className="rounded-xl border border-slate-500/40 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDeleteAccount();
                                }}
                                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed right-5 top-5 z-[130]">
                    <div
                        className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl ${
                            toast.type === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}
                    >
                        {toast.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        <span>{toast.text}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
