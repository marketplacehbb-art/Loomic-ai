function toSingleLine(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function redactSensitiveText(input: string): string {
  if (!input) return '';

  const replacements: Array<[RegExp, string]> = [
    [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]'],
    [/\b(sk-(?:proj-)?[A-Za-z0-9_-]{16,})\b/g, '[REDACTED_OPENAI_KEY]'],
    [/\b(gsk_[A-Za-z0-9_-]{16,})\b/g, '[REDACTED_GROQ_KEY]'],
    [/\b(or-[A-Za-z0-9_-]{16,})\b/g, '[REDACTED_OPENROUTER_KEY]'],
    [/\bAIza[0-9A-Za-z\-_]{20,}\b/g, '[REDACTED_GEMINI_KEY]'],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g, '[REDACTED_JWT]'],
    [/\b(sba?_[A-Za-z0-9_-]{16,})\b/g, '[REDACTED_SUPABASE_TOKEN]'],
    [/\b(api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/=]{8,}['"]?/gi, '$1=[REDACTED]'],
  ];

  let output = input;
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return '';
}

export function sanitizeErrorMessage(
  error: unknown,
  options?: {
    fallback?: string;
    maxLength?: number;
  }
): string {
  const fallback = options?.fallback || 'Unexpected error';
  const maxLength = typeof options?.maxLength === 'number' ? options.maxLength : 280;
  const raw = extractErrorMessage(error) || fallback;
  const redacted = redactSensitiveText(raw) || fallback;
  const normalized = toSingleLine(redacted) || fallback;
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function sanitizeErrorForLog(error: unknown, maxLength = 1000): string {
  return sanitizeErrorMessage(error, {
    fallback: 'Unexpected server error',
    maxLength,
  });
}
