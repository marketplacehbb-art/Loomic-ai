import { z } from 'zod';

function stripCodeFence(raw: string): string {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || trimmed).trim();
}

export function extractFirstJsonObject(raw: string): string | null {
  const candidate = stripCodeFence(raw);
  if (!candidate) return null;

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const ch = candidate[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseJsonWithSchema<T>(
  raw: string,
  schema: z.ZodType<T>
): { data?: T; error?: string } {
  const jsonPayload = extractFirstJsonObject(raw);
  if (!jsonPayload) {
    return { error: 'no-json-object-found' };
  }

  try {
    const parsed = JSON.parse(jsonPayload);
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return { error: validated.error.message };
    }
    return { data: validated.data };
  } catch (error: any) {
    return { error: error?.message || 'json-parse-failed' };
  }
}

export { z };
