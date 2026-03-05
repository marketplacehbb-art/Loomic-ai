import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabase.js';

export type PersistMode = 'db' | 'memory';

export interface GitHubConnectionStatus {
  connected: boolean;
  username?: string;
  repoName?: string;
  repoUrl?: string;
  lastSync?: string;
  connectedAt?: string;
  mode: PersistMode;
}

interface GitHubConnectionRecord extends GitHubConnectionStatus {
  userId: string;
  projectId: string;
  token: string;
}

interface ProjectSnapshotRow {
  id: string;
  name: string | null;
  code: unknown;
}

const GITHUB_PROVIDER = 'github';
const GITHUB_ENVIRONMENT = 'test';
const ENCRYPTED_TOKEN_PREFIX = 'enc:v1:';

const inMemoryConnections = new Map<string, GitHubConnectionRecord>();

const tokenSecret = String(
  process.env.GITHUB_INTEGRATION_TOKEN_SECRET ||
    process.env.SUPABASE_INTEGRATION_TOKEN_SECRET ||
    process.env.SUPABASE_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
).trim();

const nowIso = (): string => new Date().toISOString();

const getConnectionKey = (userId: string, projectId: string): string => `${userId}:${projectId}`;

const isMissingTableError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  String(error?.message || '').toLowerCase().includes('could not find the table');

const normalizeText = (value: unknown, maxLength = 260): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  return text.slice(0, maxLength);
};

const base64UrlEncode = (value: Buffer): string =>
  value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${'='.repeat(paddingLength)}`, 'base64');
};

const createTokenEncryptionKey = (): Buffer | null => {
  if (!tokenSecret) return null;
  return crypto.createHash('sha256').update(tokenSecret).digest();
};

const encryptToken = (value?: string): string | null => {
  const token = normalizeText(value, 4096);
  if (!token) return null;

  const key = createTokenEncryptionKey();
  if (!key) {
    return token;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTED_TOKEN_PREFIX}${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(encrypted)}`;
};

const decryptToken = (value?: string | null): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  if (!raw.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
    return raw;
  }

  const key = createTokenEncryptionKey();
  if (!key) return '';

  const encoded = raw.slice(ENCRYPTED_TOKEN_PREFIX.length);
  const [ivRaw, authTagRaw, encryptedRaw, ...rest] = encoded.split('.');
  if (!ivRaw || !authTagRaw || !encryptedRaw || rest.length > 0) return '';

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, base64UrlDecode(ivRaw));
    decipher.setAuthTag(base64UrlDecode(authTagRaw));
    const decrypted = Buffer.concat([
      decipher.update(base64UrlDecode(encryptedRaw)),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

const toStatus = (record: GitHubConnectionRecord): GitHubConnectionStatus => ({
  connected: Boolean(record.connected),
  username: normalizeText(record.username),
  repoName: normalizeText(record.repoName),
  repoUrl: normalizeText(record.repoUrl, 1024),
  lastSync: normalizeText(record.lastSync, 64),
  connectedAt: normalizeText(record.connectedAt, 64),
  mode: record.mode,
});

const fromDbRow = (row: any): GitHubConnectionRecord => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    userId: String(row?.user_id || '').trim(),
    projectId: String(row?.project_id || '').trim(),
    connected: row?.status === 'connected',
    username:
      normalizeText(row?.project_ref) ||
      normalizeText((metadata as Record<string, unknown>).username) ||
      '',
    repoName: normalizeText((metadata as Record<string, unknown>).repoName),
    repoUrl: normalizeText((metadata as Record<string, unknown>).repoUrl, 1024),
    lastSync: normalizeText((metadata as Record<string, unknown>).lastSync, 64),
    connectedAt: normalizeText(row?.connected_at, 64),
    token: decryptToken(row?.access_token),
    mode: 'db',
  };
};

const normalizeGitHubFilePath = (value: string): string => {
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .trim();
  if (!normalized || normalized.includes('\0')) return '';
  if (normalized.startsWith('/') || normalized.endsWith('/')) return '';
  if (normalized.split('/').some((part) => part === '..')) return '';
  return normalized;
};

function parseProjectCodeToFileMap(rawCode: unknown): Record<string, string> {
  const files: Record<string, string> = {};

  const addFile = (path: unknown, content: unknown) => {
    if (typeof path !== 'string' || typeof content !== 'string') return;
    const normalizedPath = normalizeGitHubFilePath(path);
    if (!normalizedPath) return;
    files[normalizedPath] = content;
  };

  const consume = (value: unknown) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => consume(entry));
      return;
    }

    if (typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    const pathCandidate =
      record.path ||
      record.filePath ||
      record.filename ||
      record.name;
    const contentCandidate =
      record.content ||
      record.code ||
      record.source;

    if (typeof pathCandidate === 'string' && typeof contentCandidate === 'string') {
      addFile(pathCandidate, contentCandidate);
      return;
    }

    if (record.files) {
      consume(record.files);
      return;
    }

    const asEntries = Object.entries(record);
    if (asEntries.length === 0) return;

    const allValuesAreStrings = asEntries.every(([, content]) => typeof content === 'string');
    if (allValuesAreStrings) {
      asEntries.forEach(([path, content]) => addFile(path, content));
    }
  };

  let parsed: unknown = rawCode;
  if (typeof rawCode === 'string') {
    try {
      parsed = JSON.parse(rawCode);
    } catch {
      parsed = rawCode;
    }
  }

  consume(parsed);

  if (Object.keys(files).length === 0 && typeof rawCode === 'string' && rawCode.trim()) {
    addFile('src/App.tsx', rawCode);
  }

  return files;
}

export const verifyGitHubProjectOwnership = async (projectId: string, userId: string): Promise<boolean> => {
  if (!supabaseAdmin) return true;

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[GitHub Sync] project ownership check failed:', error.message);
    return false;
  }
  return Boolean(data?.id);
};

export async function getGitHubConnectionWithToken(
  userId: string,
  projectId: string
): Promise<GitHubConnectionRecord> {
  const key = getConnectionKey(userId, projectId);

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('project_integrations')
      .select('user_id,project_id,status,project_ref,access_token,metadata,connected_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('provider', GITHUB_PROVIDER)
      .eq('environment', GITHUB_ENVIRONMENT)
      .maybeSingle();

    if (!error && data) {
      const record = fromDbRow(data);
      inMemoryConnections.set(key, record);
      return record;
    }

    if (error && !isMissingTableError(error)) {
      console.warn('[GitHub Sync] project_integrations read failed, fallback to memory:', error.message);
    }
  }

  const memoryRecord = inMemoryConnections.get(key);
  if (memoryRecord) return memoryRecord;

  return {
    userId,
    projectId,
    connected: false,
    username: '',
    token: '',
    mode: 'memory',
  };
}

export async function getGitHubConnectionStatus(
  userId: string,
  projectId: string
): Promise<GitHubConnectionStatus> {
  const record = await getGitHubConnectionWithToken(userId, projectId);
  return toStatus(record);
}

export async function saveGitHubConnection(input: {
  userId: string;
  projectId: string;
  token?: string;
  username?: string;
  connected?: boolean;
  repoName?: string;
  repoUrl?: string;
  lastSync?: string;
}): Promise<GitHubConnectionStatus> {
  const current = await getGitHubConnectionWithToken(input.userId, input.projectId);
  const connected = input.connected ?? true;
  const token = normalizeText(input.token, 4096) || current.token;
  const now = nowIso();
  const connectedAt = connected ? (current.connectedAt || now) : undefined;

  if (connected && !token) {
    throw new Error('Missing GitHub token for connected state');
  }

  const nextRecord: GitHubConnectionRecord = {
    userId: input.userId,
    projectId: input.projectId,
    connected,
    username: normalizeText(input.username) || normalizeText(current.username) || '',
    repoName: normalizeText(input.repoName, 140) || normalizeText(current.repoName, 140),
    repoUrl: normalizeText(input.repoUrl, 1024) || normalizeText(current.repoUrl, 1024),
    lastSync: normalizeText(input.lastSync, 64) || normalizeText(current.lastSync, 64),
    connectedAt,
    token: connected ? token : '',
    mode: 'memory',
  };

  const key = getConnectionKey(input.userId, input.projectId);

  if (supabaseAdmin) {
    const metadata = {
      username: nextRecord.username || null,
      repoName: nextRecord.repoName || null,
      repoUrl: nextRecord.repoUrl || null,
      lastSync: nextRecord.lastSync || null,
    };

    const payload = {
      user_id: input.userId,
      project_id: input.projectId,
      provider: GITHUB_PROVIDER,
      environment: GITHUB_ENVIRONMENT,
      status: connected ? 'connected' : 'disconnected',
      connected_at: connected ? (connectedAt || now) : null,
      disconnected_at: connected ? null : now,
      project_ref: nextRecord.username || null,
      access_token: connected ? encryptToken(nextRecord.token) : null,
      metadata,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from('project_integrations')
      .upsert(payload, { onConflict: 'project_id,provider,environment' })
      .select('user_id,project_id,status,project_ref,access_token,metadata,connected_at')
      .maybeSingle();

    if (!error && data) {
      const dbRecord = fromDbRow(data);
      if (!dbRecord.token && nextRecord.token) {
        dbRecord.token = nextRecord.token;
      }
      inMemoryConnections.set(key, dbRecord);
      return toStatus(dbRecord);
    }

    if (error && !isMissingTableError(error)) {
      throw error;
    }
  }

  inMemoryConnections.set(key, nextRecord);
  return toStatus(nextRecord);
}

export async function loadProjectFilesForGitHubPush(input: {
  userId: string;
  projectId: string;
}): Promise<{ projectName: string; files: Record<string, string> }> {
  if (!supabaseAdmin) {
    throw new Error('Project persistence is unavailable on server');
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id,name,code')
    .eq('id', input.projectId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project files: ${error.message}`);
  }

  const row = data as ProjectSnapshotRow | null;
  if (!row?.id) {
    throw new Error('Project not found or access denied');
  }

  const files = parseProjectCodeToFileMap(row.code);
  if (Object.keys(files).length === 0) {
    throw new Error('Project has no stored files to push');
  }

  return {
    projectName: normalizeText(row.name, 120) || 'AI Builder Project',
    files,
  };
}

export { normalizeGitHubFilePath };
