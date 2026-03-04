export const TIMEOUT_MS = 240000; // 4 minutes timeout

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = TIMEOUT_MS,
  onTimeout?: () => void
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // no-op, timeout should still reject
      }
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  });
}

export function buildEditModeContextPrompt(
  existingFiles: Record<string, string>,
  brand: string,
  language: string
): string {
  const extractRouteHints = (): string[] => {
    const routes = new Set<string>(['/']);
    const pushPath = (raw: string) => {
      if (!raw) return;
      if (!raw.startsWith('/')) return;
      if (raw.startsWith('//')) return;
      if (raw.startsWith('/#')) return;
      const clean = raw.split('?')[0].split('#')[0].trim();
      if (!clean) return;
      routes.add(clean);
    };

    Object.values(existingFiles).forEach((content) => {
      if (typeof content !== 'string' || content.length === 0) return;
      const patterns = [
        /path\s*=\s*["'`]([^"'`]+)["'`]/g,
        /\bto\s*=\s*["'`]([^"'`]+)["'`]/g,
        /\bhref\s*=\s*["'`]([^"'`]+)["'`]/g,
      ];
      patterns.forEach((pattern) => {
        for (const match of content.matchAll(pattern)) {
          pushPath(match[1]);
        }
      });
    });

    return [...routes].sort().slice(0, 14);
  };

  const extractStyleFingerprint = (): string => {
    const joined = Object.values(existingFiles)
      .filter((content): content is string => typeof content === 'string')
      .join('\n');
    if (!joined) return 'unknown';

    const colorBases = ['slate', 'zinc', 'neutral', 'gray', 'blue', 'cyan', 'indigo', 'emerald', 'orange', 'amber', 'rose', 'red', 'teal', 'violet'];
    const colorScores = new Map<string, number>();
    colorBases.forEach((color) => colorScores.set(color, 0));

    const colorMatches = joined.match(/\b(?:bg|text|border)-([a-z]+)-\d{2,3}\b/g) || [];
    colorMatches.forEach((token) => {
      const parts = token.split('-');
      const color = parts.length >= 3 ? parts[1] : '';
      if (colorScores.has(color)) {
        colorScores.set(color, (colorScores.get(color) || 0) + 1);
      }
    });

    const topColors = [...colorScores.entries()]
      .filter((entry) => entry[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((entry) => entry[0]);

    const radiusMatches = joined.match(/\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?\b/g) || [];
    const radiusDensity = radiusMatches.length > 45 ? 'high' : radiusMatches.length > 18 ? 'medium' : 'low';

    if (topColors.length === 0) {
      return `palette=neutral, radius_density=${radiusDensity}`;
    }
    return `palette=${topColors.join(', ')}, radius_density=${radiusDensity}`;
  };

  const normalizedPaths = Object.keys(existingFiles)
    .map((path) => path.replace(/\\/g, '/').replace(/^\.?\//, ''))
    .filter((path) => /^src\/.*\.(tsx|ts|jsx|js|css)$/.test(path))
    .sort();
  const sectionPaths = normalizedPaths.filter((path) => path.startsWith('src/components/sections/'));
  const previewPaths = normalizedPaths.slice(0, 24);
  const sectionPreview = sectionPaths.slice(0, 12);

  const pathList = previewPaths.length > 0
    ? previewPaths.map((path) => `- ${path}`).join('\n')
    : '- (none)';
  const sectionList = sectionPreview.length > 0
    ? sectionPreview.map((path) => `- ${path}`).join('\n')
    : '- (none)';
  const routeList = extractRouteHints().map((path) => `- ${path}`).join('\n');
  const styleFingerprint = extractStyleFingerprint();

  return `Edit mode is active. Use the current project files as the source of truth.
Brand: ${brand}
Language: ${language}
Existing source files (${normalizedPaths.length} total, preview):
${pathList}
Existing section files (${sectionPaths.length} total, preview):
${sectionList}
Detected routes (preview):
${routeList}
Style fingerprint:
${styleFingerprint}
Do not reset to a template preset or generic starter content.
  Keep current routing, layout, and section structure unless the user explicitly asks for structural changes.
Apply the smallest possible code diff to satisfy the prompt.`;
}
