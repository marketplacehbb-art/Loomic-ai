const warnedLegacyEnvKeys = new Set<string>();

function readEnvValue(keys: string[]): { value: string; key?: string } {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return { value: value.trim(), key };
    }
  }
  return { value: '' };
}

function warnLegacyKeyUse(legacyKey: string, preferredKeys: string[]): void {
  if (warnedLegacyEnvKeys.has(legacyKey)) {
    return;
  }
  warnedLegacyEnvKeys.add(legacyKey);
  console.warn(
    `[Security] Legacy env key "${legacyKey}" is in use. ` +
    `Migrate to ${preferredKeys.join(' or ')} (server-only).`
  );
}

function resolveSecretEnv(preferredKeys: string[], legacyKeys: string[]): string {
  const preferred = readEnvValue(preferredKeys);
  if (preferred.value) {
    return preferred.value;
  }

  const legacy = readEnvValue(legacyKeys);
  if (legacy.value) {
    if (legacy.key) {
      warnLegacyKeyUse(legacy.key, preferredKeys);
    }
    return legacy.value;
  }

  return '';
}

export function getOpenRouterApiKey(): string {
  return resolveSecretEnv(['OPENROUTER_API_KEY'], ['VITE_OPENROUTER_API_KEY']);
}

export function getGeminiApiKey(): string {
  return resolveSecretEnv(['GEMINI_API_KEY'], ['VITE_GEMINI_API_KEY']);
}

export function getOpenAIApiKey(): string {
  return resolveSecretEnv(['OPENAI_API_KEY'], ['VITE_OPENAI_API_KEY']);
}

export function getGroqApiKey(): string {
  return resolveSecretEnv(['GROQ_API_KEY'], ['VITE_GROQ_API_KEY']);
}

export function getNvidiaApiKey(): string {
  return resolveSecretEnv(['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY'], ['VITE_NVIDIA_API_KEY']);
}

export function getDeepSeekApiKey(): string {
  return resolveSecretEnv(['DEEPSEEK_API_KEY'], ['VITE_DEEPSEEK_API_KEY']);
}

export function getSupabaseServiceKey(): string {
  return resolveSecretEnv(
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    ['VITE_SUPABASE_SERVICE_ROLE_KEY']
  );
}

export function detectClientExposedSecrets(): string[] {
  const riskyKeys = [
    'VITE_OPENAI_API_KEY',
    'VITE_GEMINI_API_KEY',
    'VITE_OPENROUTER_API_KEY',
    'VITE_GROQ_API_KEY',
    'VITE_NVIDIA_API_KEY',
    'VITE_DEEPSEEK_API_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
  ];

  return riskyKeys.filter((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}
