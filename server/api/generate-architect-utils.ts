type ArchitectEditScope = 'small_fix' | 'style_tweak' | 'component_update' | 'refactor';

export function normalizeArchitectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}

export function normalizeArchitectPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((entry) => normalizeArchitectPath(String(entry || '')))
    .filter((entry) => entry.length > 0)
    .filter((entry) => /\.(tsx|ts|jsx|js|css|json)$/.test(entry));
  return Array.from(new Set(normalized));
}

export function inferFallbackEditScope(prompt: string): ArchitectEditScope {
  const lower = prompt.toLowerCase();
  if (/(refactor|architektur|architecture|restructure|neu aufbauen|rewrite|umstruktur)/.test(lower)) return 'refactor';
  if (/(farbe|farben|color|theme|style|styling|hintergrund|background|spacing|typography|font)/.test(lower)) return 'style_tweak';
  if (/(fix|bug|error|fehler|one line|klein|small)/.test(lower)) return 'small_fix';
  return 'component_update';
}
