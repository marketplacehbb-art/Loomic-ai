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

export interface SupabaseModuleLinks {
    dashboard: string;
    database: string;
    sqlEditor: string;
    usersAuth: string;
    storage: string;
    edgeFunctions: string;
    ai: string;
    secrets: string;
    logs: string;
    customEmails: string;
}

export interface SupabaseIntegrationEnvStatus {
    environment: SupabaseIntegrationEnvironment;
    connected: boolean;
    connectedAt?: string | null;
    projectRef?: string | null;
    projectUrl?: string | null;
    scopes?: string[];
    tokenExpiresAt?: string | null;
    updatedAt?: string | null;
    mode?: 'db' | 'memory';
    links?: SupabaseModuleLinks | null;
}

export interface SupabaseIntegrationStatusResponse {
    success: boolean;
    status: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus>;
    connected?: boolean;
    projectUrl?: string | null;
    environment?: SupabaseIntegrationEnvironment | null;
    error?: string;
}

export interface SupabaseCredentialConnectResponse {
    success: boolean;
    connected?: boolean;
    projectUrl?: string | null;
    environment?: SupabaseIntegrationEnvironment;
    mode?: 'db' | 'memory';
    error?: string;
}

export interface SupabaseGenerateSchemaResponse {
    success: boolean;
    sql?: string;
    tables?: string[];
    error?: string;
}

export interface SupabaseIntegrationLinksResponse {
    success: boolean;
    environment: SupabaseIntegrationEnvironment;
    connected: boolean;
    projectRef?: string | null;
    requiredIds?: {
        projectId: string;
        projectRef?: string | null;
    };
    links?: SupabaseModuleLinks | null;
    modules?: Array<{ key: string; label: string; url: string | null }>;
    connectCta?: boolean;
    error?: string;
}

export interface SupabaseIntegrationHealthResponse {
    success: boolean;
    environment?: SupabaseIntegrationEnvironment;
    connected?: boolean;
    degraded?: boolean;
    status?: string;
    upstreamStatus?: number | null;
    upstreamError?: string | null;
    checkedAt?: string;
    projectRef?: string | null;
    lastError?: {
        timestamp: string;
        message: string;
        environment?: SupabaseIntegrationEnvironment;
        code?: string;
    } | null;
    error?: string;
}

export interface SupabaseIntegrationLastErrorResponse {
    success: boolean;
    environment?: SupabaseIntegrationEnvironment | null;
    lastError?: {
        timestamp: string;
        message: string;
        environment?: SupabaseIntegrationEnvironment;
        code?: string;
    } | null;
    recentAudit?: Array<{
        timestamp: string;
        action: string;
        environment?: SupabaseIntegrationEnvironment;
        metadata?: Record<string, any>;
    }>;
    error?: string;
}

export interface CloudState {
    projectId: string;
    enabled: boolean;
    enabledAt?: string | null;
    updatedAt?: string | null;
    lastActionSource?: string | null;
    mode?: 'db' | 'memory';
}

export interface CloudStateResponse {
    success: boolean;
    state?: CloudState;
    error?: string;
}

export interface CloudOverviewModule {
    id: string;
    label: string;
    description: string;
    countLabel?: string | null;
    count?: number | null;
    emptyMessage?: string;
    url?: string | null;
}

export interface CloudOverviewResponse {
    success: boolean;
    projectId?: string;
    cloud?: CloudState;
    supabase?: {
        connected: boolean;
        environment?: SupabaseIntegrationEnvironment | null;
        projectRef?: string | null;
    };
    links?: SupabaseModuleLinks | null;
    modules?: CloudOverviewModule[];
    error?: string;
}

export type PublishStatus = 'draft' | 'publishing' | 'published' | 'failed';
export type PublishAccess = 'public' | 'unlisted' | 'private';
export type VercelDeployStatus = 'building' | 'ready' | 'error';

export interface ProjectPublication {
    projectId: string;
    status: PublishStatus;
    slug: string;
    access: PublishAccess;
    publishedUrl?: string | null;
    siteTitle?: string | null;
    siteDescription?: string | null;
    releaseVersion?: number;
    publishedAt?: string | null;
    lastError?: string | null;
    vercelDeploymentId?: string | null;
    vercelUrl?: string | null;
    vercelStatus?: VercelDeployStatus | null;
    lastDeployedAt?: string | null;
    mode?: 'db' | 'memory';
    updatedAt?: string | null;
}

export interface PublishStatusResponse {
    success: boolean;
    publication?: ProjectPublication;
    error?: string;
}

export interface VercelDeployResponse {
    success: boolean;
    url?: string;
    deploymentId?: string;
    publication?: ProjectPublication;
    error?: string;
}

export interface VercelDeployStatusResponse {
    success: boolean;
    status?: VercelDeployStatus;
    url?: string;
    error?: string;
}

export interface GitHubConnectResponse {
    connected: boolean;
    username?: string;
    error?: string;
}

export interface GitHubSyncStatusResponse {
    connected: boolean;
    repoUrl?: string;
    lastSync?: string;
    username?: string;
    error?: string;
}

export interface GitHubPushResponse {
    success: boolean;
    repoUrl?: string;
    error?: string;
}

export interface GenerateSnapshotHistoryEntry {
    id: string;
    createdAt: string;
    fileCount: number;
    projectId: string;
    label?: string;
}

export interface GenerateSnapshotsResponse {
    success: boolean;
    projectId?: string;
    snapshots?: GenerateSnapshotHistoryEntry[];
    error?: string;
}

export interface GenerateSnapshotRestoreResponse {
    success: boolean;
    projectId?: string;
    snapshotId?: string;
    files?: Array<{ path: string; content: string }>;
    metadata?: {
        createdAt?: string;
        fileCount?: number;
    };
    error?: string;
    code?: string;
}

export type SecurityFindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SecurityFindingCategory = 'rls' | 'auth' | 'policy' | 'edge' | 'secrets';

export interface SecurityFinding {
    severity: SecurityFindingSeverity;
    category: SecurityFindingCategory;
    resource: string;
    evidence: string;
    fixSuggestion: string;
    autofixPossible: boolean;
}

export interface SecurityScanSnapshot {
    timestamp: string;
    score: number;
    findings: SecurityFinding[];
}

export interface SecurityScanResponse {
    success: boolean;
    projectId?: string;
    environment?: SupabaseIntegrationEnvironment;
    timestamp?: string;
    score?: number;
    findings?: SecurityFinding[];
    summary?: {
        total: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    previous?: SecurityScanSnapshot | null;
    boundaries?: {
        staticOnly: boolean;
        runtimeTrafficScanning: boolean;
        fullCodeAnalysis: boolean;
    };
    error?: string;
}

export interface SecurityScanHistoryResponse {
    success: boolean;
    projectId?: string;
    history?: SecurityScanSnapshot[];
    error?: string;
}

export interface GenerateObservabilityMetrics {
    windowStartMs: number;
    windowEndMs: number;
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    fallbackRate: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    avgProcessingTimeMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    providers: Record<string, {
        requests: number;
        successRate: number;
        avgDurationMs: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
    }>;
    errorCategories: Record<string, number>;
    generationModes: Record<string, number>;
    costPerRequestUsd: number;
    thresholds: {
        minSampleSize: number;
        maxP95DurationMs: number;
        minSuccessRate: number;
        maxFallbackRate: number;
        maxCostPerRequestUsd: number;
    };
    alerts: Array<{
        id: 'p95_latency' | 'success_rate' | 'fallback_rate' | 'cost_per_request';
        severity: 'warning' | 'critical';
        title: string;
        message: string;
        value: number;
        threshold: number;
    }>;
}

export interface GenerateObservabilityResponse {
    success: boolean;
    metrics?: GenerateObservabilityMetrics;
    error?: string;
}

export interface GenerateSloStatus {
    windowStartMs: number;
    windowEndMs: number;
    totalRequests: number;
    minSampleSize: number;
    status: 'pass' | 'fail' | 'insufficient_data';
    checks: Array<{
        id: 'p95_latency' | 'success_rate' | 'fallback_rate' | 'cost_per_request';
        pass: boolean;
        value: number;
        threshold: number;
        comparator: '<=' | '>=';
    }>;
}

export interface GenerateSloResponse {
    success: boolean;
    slo?: GenerateSloStatus;
    error?: string;
}

const normalizeApiBaseUrl = (value?: string): string => {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
};

const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

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

    async getProjectStats() {
        const { count: publishedCount, error } = await supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('is_public', true);

        if (error) throw error;
        return {
            publishedCount: publishedCount || 0,
        };
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
            details: (log.details as any) || {}
        }));
    },

    async getGenerateObservability(windowMs = 3_600_000): Promise<GenerateObservabilityResponse> {
        const query = new URLSearchParams({ windowMs: String(windowMs) }).toString();
        const response = await fetch(`${API_URL}/api/generate/observability?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<GenerateObservabilityResponse>;
    },

    async getGenerateSlo(windowMs = 3_600_000): Promise<GenerateSloResponse> {
        const query = new URLSearchParams({ windowMs: String(windowMs) }).toString();
        const response = await fetch(`${API_URL}/api/generate/slo?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<GenerateSloResponse>;
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

    async getGenerateSnapshots(projectId: string, limit = 20): Promise<GenerateSnapshotsResponse> {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
        const response = await fetch(`${API_URL}/api/generate/snapshots/${projectId}?limit=${safeLimit}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<GenerateSnapshotsResponse>;
    },

    async restoreGenerateSnapshot(input: {
        projectId: string;
        snapshotId: string;
        files?: Record<string, string>;
    }): Promise<GenerateSnapshotRestoreResponse> {
        const body = JSON.stringify(input);
        let response = await fetch(`${API_URL}/api/generate/snapshot/restore`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body,
        });
        if (response.status === 404) {
            response = await fetch(`${API_URL}/api/generate/rollback`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body,
            });
        }
        return response.json() as Promise<GenerateSnapshotRestoreResponse>;
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

    async connectSupabaseCredentials(input: {
        projectId: string;
        projectUrl: string;
        anonKey: string;
        environment?: SupabaseIntegrationEnvironment;
    }): Promise<SupabaseCredentialConnectResponse> {
        const response = await fetch(`${API_URL}/api/integrations/supabase/connect`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<SupabaseCredentialConnectResponse>;
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

    async disconnectSupabaseCredentials(input: {
        projectId: string;
        environment?: SupabaseIntegrationEnvironment;
    }): Promise<{ success: boolean; connected?: boolean; mode?: 'db' | 'memory'; error?: string; }> {
        const response = await fetch(`${API_URL}/api/integrations/supabase/disconnect`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json();
    },

    async generateSupabaseSchema(input: {
        projectId: string;
        description: string;
    }): Promise<SupabaseGenerateSchemaResponse> {
        const response = await fetch(`${API_URL}/api/integrations/supabase/generate-schema`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<SupabaseGenerateSchemaResponse>;
    },

    async getSupabaseIntegrationLinks(
        projectId: string,
        environment?: SupabaseIntegrationEnvironment
    ): Promise<SupabaseIntegrationLinksResponse> {
        const query = new URLSearchParams({ projectId });
        if (environment) query.set('environment', environment);
        const response = await fetch(`${API_URL}/api/integrations/supabase/links?${query.toString()}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<SupabaseIntegrationLinksResponse>;
    },

    async getSupabaseIntegrationHealth(
        projectId: string,
        environment?: SupabaseIntegrationEnvironment
    ): Promise<SupabaseIntegrationHealthResponse> {
        const query = new URLSearchParams({ projectId });
        if (environment) query.set('environment', environment);
        const response = await fetch(`${API_URL}/api/integrations/supabase/health?${query.toString()}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<SupabaseIntegrationHealthResponse>;
    },

    async getSupabaseIntegrationLastError(
        projectId: string,
        environment?: SupabaseIntegrationEnvironment
    ): Promise<SupabaseIntegrationLastErrorResponse> {
        const query = new URLSearchParams({ projectId });
        if (environment) query.set('environment', environment);
        const response = await fetch(`${API_URL}/api/integrations/supabase/last-error?${query.toString()}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<SupabaseIntegrationLastErrorResponse>;
    },

    async getCloudState(projectId: string): Promise<CloudStateResponse> {
        const query = new URLSearchParams({ projectId }).toString();
        const response = await fetch(`${API_URL}/api/cloud/state?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<CloudStateResponse>;
    },

    async enableCloud(input: {
        projectId: string;
        source?: string;
    }): Promise<CloudStateResponse> {
        const response = await fetch(`${API_URL}/api/cloud/enable`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<CloudStateResponse>;
    },

    async getCloudOverview(
        projectId: string,
        environment?: SupabaseIntegrationEnvironment
    ): Promise<CloudOverviewResponse> {
        const query = new URLSearchParams({ projectId });
        if (environment) query.set('environment', environment);
        const response = await fetch(`${API_URL}/api/cloud/overview?${query.toString()}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<CloudOverviewResponse>;
    },

    async getPublishStatus(projectId: string): Promise<PublishStatusResponse> {
        const query = new URLSearchParams({ projectId }).toString();
        const response = await fetch(`${API_URL}/api/publish/status?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<PublishStatusResponse>;
    },

    async publishProject(input: {
        projectId: string;
        slug?: string;
        access?: PublishAccess;
        siteTitle?: string;
        siteDescription?: string;
    }): Promise<PublishStatusResponse> {
        const response = await fetch(`${API_URL}/api/publish/publish`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<PublishStatusResponse>;
    },

    async unpublishProject(input: { projectId: string }): Promise<PublishStatusResponse> {
        const response = await fetch(`${API_URL}/api/publish/unpublish`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<PublishStatusResponse>;
    },

    async deployToVercel(input: { projectId: string }): Promise<VercelDeployResponse> {
        const response = await fetch(`${API_URL}/api/publish/deploy-vercel`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<VercelDeployResponse>;
    },

    async getVercelDeployStatus(deploymentId: string): Promise<VercelDeployStatusResponse> {
        const response = await fetch(`${API_URL}/api/publish/deploy-status/${encodeURIComponent(deploymentId)}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<VercelDeployStatusResponse>;
    },

    async runSecurityScan(input: {
        projectId: string;
        environment?: SupabaseIntegrationEnvironment;
        files?: Record<string, string>;
    }): Promise<SecurityScanResponse> {
        const response = await fetch(`${API_URL}/api/security/scan`, {
            method: 'POST',
            headers: await buildAuthHeaders(true),
            body: JSON.stringify(input),
        });
        return response.json() as Promise<SecurityScanResponse>;
    },

    async getSecurityScanHistory(projectId: string): Promise<SecurityScanHistoryResponse> {
        const query = new URLSearchParams({ projectId }).toString();
        const response = await fetch(`${API_URL}/api/security/history?${query}`, {
            method: 'GET',
            headers: await buildAuthHeaders(false),
        });
        return response.json() as Promise<SecurityScanHistoryResponse>;
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
        githubStatus: async (projectId: string): Promise<GitHubSyncStatusResponse> => {
            const query = new URLSearchParams({ projectId }).toString();
            const response = await fetch(`${API_URL}/api/git/status?${query}`, {
                method: 'GET',
                headers: await buildAuthHeaders(false),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `GitHub status failed (${response.status})`);
            }
            return response.json() as Promise<GitHubSyncStatusResponse>;
        },
        connect: async (token: string, projectId: string): Promise<GitHubConnectResponse> => {
            const response = await fetch(`${API_URL}/api/git/connect`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify({ token, projectId }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `GitHub connect failed (${response.status})`);
            }
            return response.json() as Promise<GitHubConnectResponse>;
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
        },
        pushToGitHub: async (input: {
            projectId: string;
            repoName: string;
            createNew: boolean;
            commitMessage?: string;
        }): Promise<GitHubPushResponse> => {
            const response = await fetch(`${API_URL}/api/git/push`, {
                method: 'POST',
                headers: await buildAuthHeaders(true),
                body: JSON.stringify(input),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as any;
                throw new Error(body.error || `GitHub push failed (${response.status})`);
            }
            return response.json() as Promise<GitHubPushResponse>;
        }
    }
};
