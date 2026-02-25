import { supabase } from './supabase';
import { Database } from '../types/supabase';

export type Project = Database['public']['Tables']['projects']['Row'];
export type NewProject = Database['public']['Tables']['projects']['Insert'];
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type EmailPreferences = Database['public']['Tables']['email_preferences']['Row'];

// --- New Types for Chat Persistence ---
export type ProjectMessage = Database['public']['Tables']['project_messages']['Row'];
export type NewProjectMessage = Database['public']['Tables']['project_messages']['Insert'];
export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type NewProjectFile = Database['public']['Tables']['project_files']['Insert'];

export type VisualPatchOperation =
    | {
        op: 'replace_text';
        file: string;
        selector: string;
        sourceId?: string;
        text: string;
    }
    | {
        op: 'add_class' | 'remove_class';
        file: string;
        selector: string;
        sourceId?: string;
        classes: string[];
    }
    | {
        op: 'set_prop';
        file: string;
        selector: string;
        sourceId?: string;
        prop: string;
        value: string;
    }
    | {
        op: 'remove_prop';
        file: string;
        selector: string;
        sourceId?: string;
        prop: string;
    };

export interface VisualPatchApplyResponse {
    success: boolean;
    files?: Array<{ path: string; content: string }>;
    patch?: {
        total: number;
        applied: number;
        failed: number;
        changedPaths: string[];
        failedReasons: Array<{ file: string; selector: string; reason: string }>;
    };
    diff?: {
        changes: Array<{ path: string; before: string; after: string }>;
    };
    verify?: {
        pass: boolean;
        errorCount: number;
        warningCount: number;
        errors: string[];
        warnings: string[];
        qualityPass: boolean;
        qualityCriticalCount: number;
        qualityFindings: any[];
        checkedPaths?: string[];
    };
    style?: {
        promptDetected: boolean;
        retryApplied: boolean;
    };
    error?: string;
    code?: string;
}

export type SupabaseIntegrationEnvironment = 'test' | 'live';

export interface SupabaseIntegrationEnvStatus {
    environment: SupabaseIntegrationEnvironment;
    connected: boolean;
    connectedAt?: string | null;
    projectRef?: string | null;
    scopes?: string[];
    tokenExpiresAt?: string | null;
    updatedAt?: string | null;
    mode?: 'db' | 'memory';
}

export interface SupabaseIntegrationStatusResponse {
    success: boolean;
    status: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus>;
    error?: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
};

const buildAuthHeaders = async (withJsonContentType = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (withJsonContentType) headers['Content-Type'] = 'application/json';
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
};

const isMissingTableError = (error: any) =>
    error?.code === 'PGRST205';

export const api = {
    // Projects
    async getProjects(page = 1, limit = 20) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('projects')
            .select('*', { count: 'exact' })
            .order('updated_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        return { data: data as Project[], count };
    },

    async getProject(id: string) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Project;
    },

    async createProject(project: NewProject) {
        const { data, error } = await supabase
            .from('projects')
            .insert(project)
            .select()
            .single();

        if (error) throw error;
        return data as Project;
    },

    async updateProject(id: string, updates: Partial<Project>) {
        const { data, error } = await supabase
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Project;
    },

    async deleteProject(id: string) {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // --- Messages (Chat History) ---
    async getMessages(projectId: string) {
        const { data, error } = await supabase
            .from('project_messages')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) {
            // Graceful fallback if persistence tables are not migrated yet
            if (isMissingTableError(error)) return [];
            throw error;
        }
        return data as ProjectMessage[];
    },

    async saveMessage(message: NewProjectMessage) {
        const { data, error } = await supabase
            .from('project_messages')
            .insert(message)
            .select()
            .single();

        if (error) throw error;
        return data as ProjectMessage;
    },

    // --- Knowledge Base Files ---
    async getProjectFiles(projectId: string) {
        const { data, error } = await supabase
            .from('project_files')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            // Graceful fallback if persistence tables are not migrated yet
            if (isMissingTableError(error)) return [];
            throw error;
        }
        return data as ProjectFile[];
    },

    async saveProjectFile(file: NewProjectFile) {
        const { data, error } = await supabase
            .from('project_files')
            .insert(file)
            .select()
            .single();

        if (error) throw error;
        return data as ProjectFile;
    },

    async deleteProjectFile(fileId: string) {
        const { error } = await supabase
            .from('project_files')
            .delete()
            .eq('id', fileId);

        if (error) throw error;
    },

    // User Profile
    async getUserProfile(userId: string) {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows returned"
        return data as UserProfile | null;
    },

    async updateUserProfile(userId: string, updates: Partial<UserProfile>) {
        // Upsert to handle creation if it doesn't exist
        const { data, error } = await supabase
            .from('user_profiles')
            .upsert({ user_id: userId, ...updates })
            .select()
            .single();

        if (error) throw error;
        return data as UserProfile;
    },

    // Email Preferences
    async getEmailPreferences(userId: string) {
        const { data, error } = await supabase
            .from('email_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data as EmailPreferences | null;
    },

    async updateEmailPreferences(userId: string, updates: Partial<EmailPreferences>) {
        const { data, error } = await supabase
            .from('email_preferences')
            .upsert({ user_id: userId, ...updates })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Storage
    async uploadAvatar(userId: string, file: File) {
        const fileExt = file.name.split('.').pop();
        const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

        // 1. Upload
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return data.publicUrl;
    },

    // Metrics / Usage
    async getUsageHistory(userId: string, hours = 24) {
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('audit_logs')
            .select('created_at, details')
            .eq('user_id', userId)
            .eq('action', 'generate_code')
            .gte('created_at', startTime)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data.map(log => ({
            created_at: log.created_at,
            ...((log.details as any) || {})
        }));
    },

    // Deterministic visual edits via AST patch pipeline
    async applyVisualPatch(input: {
        files: Record<string, string>;
        operations: VisualPatchOperation[];
        prompt?: string;
        verify?: boolean;
        primaryPath?: string;
        projectId?: string;
    }): Promise<VisualPatchApplyResponse> {
        const response = await fetch(`${API_URL}/api/generate/visual-apply`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        const payload = await response.json();
        return payload as VisualPatchApplyResponse;
    },

    async verifyGeneratedFiles(input: {
        files: Record<string, string>;
        primaryPath?: string;
        prompt?: string;
    }) {
        const response = await fetch(`${API_URL}/api/generate/verify`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json();
    },

    async getSupabaseIntegrationStatus(projectId: string): Promise<SupabaseIntegrationStatusResponse> {
        const query = new URLSearchParams({ projectId }).toString();
        const response = await fetch(`${API_URL}/api/integrations/supabase/status?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<SupabaseIntegrationStatusResponse>;
    },

    async createSupabaseConnectLink(input: {
        projectId: string;
        environment: SupabaseIntegrationEnvironment;
        projectRef?: string;
    }): Promise<{ success: boolean; authorizeUrl?: string; environment?: SupabaseIntegrationEnvironment; error?: string; }> {
        const response = await fetch(`${API_URL}/api/integrations/supabase/connect`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json();
    },

    async disconnectSupabaseIntegration(input: {
        projectId: string;
        environment: SupabaseIntegrationEnvironment;
    }): Promise<{ success: boolean; environment?: SupabaseIntegrationEnvironment; mode?: 'db' | 'memory'; error?: string; }> {
        const response = await fetch(`${API_URL}/api/integrations/supabase/disconnect`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json();
    },

    // --- Git integration ---
    git: {
        init: async (projectId = 'default', files?: Record<string, string>) => {
            const response = await fetch(`${API_URL}/api/git/init`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId, files })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git init failed (${response.status})`);
            }
            return response.json();
        },
        status: async (projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/status`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git status failed (${response.status})`);
            }
            return response.json();
        },
        add: async (files: string | string[], projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/add`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId, files })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git add failed (${response.status})`);
            }
            return response.json();
        },
        commit: async (message: string, projectId = 'default', files?: Record<string, string>) => {
            const response = await fetch(`${API_URL}/api/git/commit`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId, message, files })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git commit failed (${response.status})`);
            }
            return response.json();
        },
        history: async (projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/history`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git history failed (${response.status})`);
            }
            return response.json();
        },
        getBranches: async (projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/branches`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git get branches failed (${response.status})`);
            }
            return response.json();
        },
        checkout: async (branch: string, create?: boolean, projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/branches/checkout`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId, branch, create })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git checkout failed (${response.status})`);
            }
            return response.json();
        },
        push: async (remote: string, branch: string, token?: string, projectId = 'default') => {
            const response = await fetch(`${API_URL}/api/git/push`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ projectId, remote, branch, token })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `Git push failed (${response.status})`);
            }
            return response.json();
        }
    }
};
