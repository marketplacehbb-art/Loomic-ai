import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase.js';

export type UserApiKeyProvider = 'deepseek' | 'openai' | 'gemini' | 'groq' | 'openrouter' | 'nvidia';
export type UserApiKeyMap = Partial<Record<UserApiKeyProvider, string>>;

type PersistMode = 'db' | 'memory';

const API_KEY_STORE_FIELD = 'api_keys_encrypted';
const ENCRYPTED_PREFIX = 'uak:v1:';
const inMemoryUserApiKeyStore = new Map<string, Record<string, string>>();

const encryptionSecret = String(
  process.env.USER_API_KEYS_SECRET ||
  process.env.GITHUB_INTEGRATION_TOKEN_SECRET ||
  process.env.SUPABASE_INTEGRATION_TOKEN_SECRET ||
  process.env.SUPABASE_OAUTH_STATE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

const base64UrlEncode = (value: Buffer): string =>
  value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${'='.repeat(paddingLength)}`, 'base64');
};

const createKey = (): Buffer | null => {
  if (!encryptionSecret) return null;
  return crypto.createHash('sha256').update(encryptionSecret).digest();
};

const normalizeProvider = (value: unknown): UserApiKeyProvider | null => {
  const provider = String(value || '').trim().toLowerCase();
  if (
    provider === 'deepseek' ||
    provider === 'openai' ||
    provider === 'gemini' ||
    provider === 'groq' ||
    provider === 'openrouter' ||
    provider === 'nvidia'
  ) {
    return provider;
  }
  return null;
};

const sanitizeApiKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 4096);
};

const isMissingResourceError = (error: any): boolean =>
  error?.code === 'PGRST205' ||
  error?.code === '42P01' ||
  String(error?.message || '').toLowerCase().includes('column') ||
  String(error?.message || '').toLowerCase().includes('table');

const encryptValue = (plain: string): string => {
  const safe = sanitizeApiKey(plain);
  if (!safe) return '';
  const key = createKey();
  if (!key) return safe;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(safe, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(encrypted)}`;
};

const decryptValue = (encryptedValue: string): string => {
  const value = sanitizeApiKey(encryptedValue);
  if (!value) return '';
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  const key = createKey();
  if (!key) return '';

  const payload = value.slice(ENCRYPTED_PREFIX.length);
  const [ivRaw, authTagRaw, encryptedRaw, ...rest] = payload.split('.');
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

const sanitizeEncryptedPayload = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([provider, encrypted]) => {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) return;
    const encryptedValue = sanitizeApiKey(encrypted);
    if (!encryptedValue) return;
    next[normalizedProvider] = encryptedValue;
  });
  return next;
};

const maskApiKey = (value: string): string => {
  const safe = sanitizeApiKey(value);
  if (!safe) return '';
  if (safe.length <= 8) return `${safe.slice(0, 2)}••••`;
  return `${safe.slice(0, 4)}••••••••${safe.slice(-4)}`;
};

const readEncryptedPayloadFromDb = async (userId: string): Promise<Record<string, string>> => {
  if (!supabaseAdmin) return {};

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (!isMissingResourceError(error)) {
      console.warn('[User API Keys] profiles read failed:', error.message);
    }
    return {};
  }

  const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const payload =
    row[API_KEY_STORE_FIELD] ||
    row.api_keys ||
    row.provider_api_keys ||
    null;

  return sanitizeEncryptedPayload(payload);
};

const persistEncryptedPayloadToDb = async (
  userId: string,
  payload: Record<string, string>
): Promise<boolean> => {
  if (!supabaseAdmin) return false;

  const upsertPayload: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
    [API_KEY_STORE_FIELD]: payload,
  };

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert(upsertPayload, { onConflict: 'id' });

  if (error) {
    if (!isMissingResourceError(error)) {
      console.warn('[User API Keys] profiles write failed:', error.message);
    }
    return false;
  }

  return true;
};

const mergeEncryptedPayload = async (userId: string): Promise<Record<string, string>> => {
  const dbPayload = await readEncryptedPayloadFromDb(userId);
  const memoryPayload = inMemoryUserApiKeyStore.get(userId) || {};
  return { ...dbPayload, ...memoryPayload };
};

export async function saveUserApiKey(input: {
  userId: string;
  provider: UserApiKeyProvider;
  apiKey: string;
}): Promise<{ success: boolean; mode: PersistMode; error?: string }> {
  const userId = String(input.userId || '').trim();
  const provider = normalizeProvider(input.provider);
  const apiKey = sanitizeApiKey(input.apiKey);

  if (!userId) return { success: false, mode: 'memory', error: 'Missing userId' };
  if (!provider) return { success: false, mode: 'memory', error: 'Invalid provider' };
  if (!apiKey) return { success: false, mode: 'memory', error: 'Missing API key' };

  const encryptedPayload = await mergeEncryptedPayload(userId);
  encryptedPayload[provider] = encryptValue(apiKey);
  inMemoryUserApiKeyStore.set(userId, encryptedPayload);

  const persistedToDb = await persistEncryptedPayloadToDb(userId, encryptedPayload);
  return {
    success: true,
    mode: persistedToDb ? 'db' : 'memory',
  };
}

export async function getUserProviderApiKeys(userId: string): Promise<UserApiKeyMap> {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return {};

  const encryptedPayload = await mergeEncryptedPayload(safeUserId);
  const decrypted: UserApiKeyMap = {};

  Object.entries(encryptedPayload).forEach(([provider, encrypted]) => {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) return;
    const decryptedValue = decryptValue(encrypted);
    if (!decryptedValue) return;
    decrypted[normalizedProvider] = decryptedValue;
  });

  return decrypted;
}

export async function getUserApiKeyStatus(userId: string): Promise<Record<UserApiKeyProvider, {
  configured: boolean;
  masked: string;
}>> {
  const keys = await getUserProviderApiKeys(userId);
  return {
    deepseek: {
      configured: Boolean(keys.deepseek),
      masked: keys.deepseek ? maskApiKey(keys.deepseek) : '',
    },
    openai: {
      configured: Boolean(keys.openai),
      masked: keys.openai ? maskApiKey(keys.openai) : '',
    },
    gemini: {
      configured: Boolean(keys.gemini),
      masked: keys.gemini ? maskApiKey(keys.gemini) : '',
    },
    groq: {
      configured: Boolean(keys.groq),
      masked: keys.groq ? maskApiKey(keys.groq) : '',
    },
    openrouter: {
      configured: Boolean(keys.openrouter),
      masked: keys.openrouter ? maskApiKey(keys.openrouter) : '',
    },
    nvidia: {
      configured: Boolean(keys.nvidia),
      masked: keys.nvidia ? maskApiKey(keys.nvidia) : '',
    },
  };
}

export async function testUserApiKey(provider: UserApiKeyProvider, apiKey: string): Promise<{
  valid: boolean;
  message: string;
}> {
  const key = sanitizeApiKey(apiKey);
  if (!key) {
    return { valid: false, message: 'No key configured' };
  }

  try {
    let response: Response;
    if (provider === 'gemini') {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
      );
    } else {
      const endpoint =
        provider === 'deepseek'
          ? 'https://api.deepseek.com/v1/models'
          : provider === 'openai'
            ? 'https://api.openai.com/v1/models'
            : provider === 'groq'
              ? 'https://api.groq.com/openai/v1/models'
              : provider === 'openrouter'
                ? 'https://openrouter.ai/api/v1/models'
                : 'https://integrate.api.nvidia.com/v1/models';

      response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${key}`,
          ...(provider === 'openrouter'
            ? {
              'HTTP-Referer': 'https://localhost:3000',
              'X-Title': 'AI Builder',
            }
            : {}),
        },
      });
    }

    if (response.ok) {
      return { valid: true, message: 'Valid' };
    }

    return { valid: false, message: `Invalid (${response.status})` };
  } catch (error: any) {
    return { valid: false, message: error?.message || 'Invalid' };
  }
}
