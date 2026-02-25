export interface DeterministicEditResult {
  applied: boolean;
  files: Record<string, string>;
  actions: string[];
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

function replaceInFiles(
  files: Record<string, string>,
  replacer: (content: string, path: string) => { content: string; changed: boolean }
): { files: Record<string, string>; changedPaths: string[] } {
  const next: Record<string, string> = {};
  const changedPaths: string[] = [];
  Object.entries(files).forEach(([path, content]) => {
    if (typeof content !== 'string') {
      next[path] = content;
      return;
    }
    const result = replacer(content, path);
    next[path] = result.content;
    if (result.changed) changedPaths.push(path);
  });
  return { files: next, changedPaths };
}

function applyFullWidthButton(files: Record<string, string>): DeterministicEditResult {
  const result = replaceInFiles(files, (content, path) => {
    if (!/\.(tsx|jsx|ts|js)$/i.test(path)) return { content, changed: false };
    const next = content.replace(
      /(<button\b[^>]*className=")([^"]*)(")/g,
      (full, start, classes, end) => {
        if (/\bw-full\b/.test(classes)) return full;
        return `${start}${classes} w-full${end}`;
      }
    );
    return { content: next, changed: next !== content };
  });
  return {
    applied: result.changedPaths.length > 0,
    files: result.files,
    actions: result.changedPaths.length > 0 ? ['button_full_width'] : [],
  };
}

function applyDarkThemeHint(files: Record<string, string>): DeterministicEditResult {
  const result = replaceInFiles(files, (content, path) => {
    if (!/\.(tsx|jsx|ts|js|css)$/i.test(path)) return { content, changed: false };
    let next = content;
    next = next.replace(/\bbg-white\b/g, 'bg-slate-950');
    next = next.replace(/\btext-slate-900\b/g, 'text-slate-100');
    next = next.replace(/\bborder-slate-200\b/g, 'border-slate-800');
    return { content: next, changed: next !== content };
  });
  return {
    applied: result.changedPaths.length > 0,
    files: result.files,
    actions: result.changedPaths.length > 0 ? ['dark_theme_hint'] : [],
  };
}

function hashPromptSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildStyleRefreshSnippet(prompt: string): string {
  const lower = normalizePrompt(prompt);
  const seed = hashPromptSeed(lower);

  const wantsGold = /(gold|golden|amber|luxury|elegant)/.test(lower);
  const wantsVivid = /(vivid|neon|bold|colorful|bunt|krass)/.test(lower);

  const goldPalettes = [
    { from: '#1a1204', via: '#3f2b0b', to: '#0b0b0f', glowA: '245, 158, 11', glowB: '251, 191, 36' },
    { from: '#201506', via: '#4a320d', to: '#09090b', glowA: '217, 119, 6', glowB: '251, 191, 36' },
    { from: '#1a1003', via: '#3c290b', to: '#08080a', glowA: '234, 179, 8', glowB: '245, 158, 11' },
  ];

  const vividPalettes = [
    { from: '#0f172a', via: '#1d4ed8', to: '#312e81', glowA: '56, 189, 248', glowB: '129, 140, 248' },
    { from: '#0b1020', via: '#0f766e', to: '#1e3a8a', glowA: '45, 212, 191', glowB: '56, 189, 248' },
    { from: '#111827', via: '#6d28d9', to: '#312e81', glowA: '192, 132, 252', glowB: '56, 189, 248' },
  ];

  const darkPalettes = [
    { from: '#020617', via: '#0f172a', to: '#1e293b', glowA: '56, 189, 248', glowB: '129, 140, 248' },
    { from: '#030712', via: '#111827', to: '#1f2937', glowA: '59, 130, 246', glowB: '99, 102, 241' },
    { from: '#0a0f1f', via: '#1e1b4b', to: '#312e81', glowA: '67, 56, 202', glowB: '129, 140, 248' },
  ];

  const pool = wantsGold ? goldPalettes : (wantsVivid ? vividPalettes : darkPalettes);
  const selected = pool[seed % pool.length];
  const noiseAlphaA = (0.14 + (seed % 5) * 0.02).toFixed(2);
  const noiseAlphaB = (0.12 + (seed % 4) * 0.02).toFixed(2);

  return `/* ai-style-refresh:start */
:root {
  --ai-style-seed: ${seed};
  --ai-bg-from: ${selected.from};
  --ai-bg-via: ${selected.via};
  --ai-bg-to: ${selected.to};
}
body {
  background:
    radial-gradient(1120px 560px at 12% -8%, rgba(${selected.glowA}, ${noiseAlphaA}), transparent 58%),
    radial-gradient(900px 460px at 88% 0%, rgba(${selected.glowB}, ${noiseAlphaB}), transparent 60%),
    linear-gradient(135deg, var(--ai-bg-from), var(--ai-bg-via) 45%, var(--ai-bg-to));
}
/* ai-style-refresh:end */`;
}

function applyStyleRefreshFallback(input: {
  files: Record<string, string>;
  prompt: string;
}): DeterministicEditResult {
  const lower = normalizePrompt(input.prompt);
  const styleSignal = /(hintergrund|background|theme|palette|farbe|farben|style|styling|design|schoener|schoner|modern|premium|gold|golden)/.test(lower);
  if (!styleSignal) {
    return { applied: false, files: input.files, actions: [] };
  }

  const nextFiles = { ...input.files };
  const cssPath = Object.keys(nextFiles).find((path) => path.replace(/\\/g, '/').toLowerCase() === 'src/index.css');
  const markerStart = '/* ai-style-refresh:start */';
  const markerEnd = '/* ai-style-refresh:end */';

  if (cssPath && typeof nextFiles[cssPath] === 'string') {
    const cssContent = nextFiles[cssPath];
    const snippet = buildStyleRefreshSnippet(input.prompt);
    let nextCss = cssContent;

    if (cssContent.includes(markerStart) && cssContent.includes(markerEnd)) {
      nextCss = cssContent.replace(
        /\/\*\s*ai-style-refresh:start\s*\*\/[\s\S]*?\/\*\s*ai-style-refresh:end\s*\*\//g,
        snippet
      );
    } else {
      nextCss = `${cssContent.trimEnd()}\n\n${snippet}\n`;
    }

    if (nextCss !== cssContent) {
      nextFiles[cssPath] = nextCss;
      return {
        applied: true,
        files: nextFiles,
        actions: ['style_refresh_fallback_css'],
      };
    }
  }

  const appPath = Object.keys(nextFiles).find((path) => path.replace(/\\/g, '/').toLowerCase() === 'src/app.tsx');
  if (appPath && typeof nextFiles[appPath] === 'string') {
    const appContent = nextFiles[appPath];
    const wantsGold = /(gold|golden|amber|luxury|elegant)/.test(lower);
    const replacementClass = wantsGold
      ? 'bg-gradient-to-br from-amber-50 via-amber-100 to-yellow-100 dark:from-slate-950 dark:via-amber-950/25 dark:to-slate-900'
      : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950';
    const next = appContent.replace(
      /className="([^"]*min-h-screen[^"]*)"/,
      (_full, classes: string) => {
        if (classes.includes('bg-gradient-to-br')) return `className="${classes}"`;
        return `className="${classes} ${replacementClass}"`;
      }
    );
    if (next !== appContent) {
      nextFiles[appPath] = next;
      return {
        applied: true,
        files: nextFiles,
        actions: ['style_refresh_fallback_app'],
      };
    }
  }

  return { applied: false, files: input.files, actions: [] };
}

function applyBrandRename(files: Record<string, string>, prompt: string): DeterministicEditResult {
  const renameMatch = prompt.match(/(?:name|brand|namen?|heisst|heiss|rename)[^"'`]*["'`]?([a-zA-Z0-9][a-zA-Z0-9 \-]{2,40})["'`]?/i);
  if (!renameMatch) {
    return { applied: false, files, actions: [] };
  }
  const targetBrand = renameMatch[1].trim();
  if (!targetBrand) return { applied: false, files, actions: [] };

  const result = replaceInFiles(files, (content, path) => {
    if (!/\.(tsx|jsx|ts|js|html)$/i.test(path)) return { content, changed: false };
    let next = content;
    next = next.replace(/\{\{\s*projectName\s*\}\}/gi, targetBrand);
    next = next.replace(/\b(?:Nova Project|BuilderKit)\b/g, targetBrand);
    return { content: next, changed: next !== content };
  });
  return {
    applied: result.changedPaths.length > 0,
    files: result.files,
    actions: result.changedPaths.length > 0 ? ['brand_rename'] : [],
  };
}

export function applyDeterministicEditActions(input: {
  prompt: string;
  files: Record<string, string>;
  forceStyleFallback?: boolean;
}): DeterministicEditResult {
  const prompt = normalizePrompt(input.prompt);
  let currentFiles = { ...input.files };
  const actions: string[] = [];
  let applied = false;

  if (/button .*full width|voll(?:e|er)? breite|w-full/.test(prompt)) {
    const result = applyFullWidthButton(currentFiles);
    currentFiles = result.files;
    applied = applied || result.applied;
    actions.push(...result.actions);
  }

  if (/dark|dunkel|dark mode/.test(prompt)) {
    const result = applyDarkThemeHint(currentFiles);
    currentFiles = result.files;
    applied = applied || result.applied;
    actions.push(...result.actions);
  }

  if (/name|brand|rename|heisst|heiss|nenn/.test(prompt)) {
    const result = applyBrandRename(currentFiles, input.prompt);
    currentFiles = result.files;
    applied = applied || result.applied;
    actions.push(...result.actions);
  }

  const stylePrompt = /(hintergrund|background|theme|palette|farbe|farben|style|styling|design|schoener|schoner|modern|premium|gold|golden)/.test(prompt);
  if (input.forceStyleFallback || (stylePrompt && !applied)) {
    const result = applyStyleRefreshFallback({
      files: currentFiles,
      prompt: input.prompt,
    });
    currentFiles = result.files;
    applied = applied || result.applied;
    actions.push(...result.actions);
  }

  return {
    applied,
    files: currentFiles,
    actions: [...new Set(actions)],
  };
}
