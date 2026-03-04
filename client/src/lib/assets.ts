export const DEFAULT_PLACEHOLDER_IMAGE = '/placeholder.svg';

export function resolveImageWithFallback(
  image: string | null | undefined,
  fallback: string = DEFAULT_PLACEHOLDER_IMAGE
): string {
  const candidate = typeof image === 'string' ? image.trim() : '';
  return candidate.length > 0 ? candidate : fallback;
}
