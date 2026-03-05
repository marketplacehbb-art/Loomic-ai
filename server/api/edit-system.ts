type FileMap = Record<string, string>;

export type EditInstructionType =
  | 'style'
  | 'content'
  | 'feature-add'
  | 'feature-modify'
  | 'structural'
  | 'data';

export interface ProjectContextSnapshot {
  fileTree: string;
  components: string[];
  importGraph: string[];
  stateMap: string[];
  routes: string[];
  supabaseTables: string[];
  relevantFiles: FileMap;
}

export interface EditHistoryEntry {
  instruction: string;
  editType: string;
  filesChanged: string[];
  createdAt?: string;
}

export interface EditDiffResult {
  files: FileMap;
  changedPaths: string[];
  revertedByChangeRatio: string[];
  changeRatios: Record<string, number>;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'your',
  'please',
  'make',
  'more',
  'less',
  'add',
  'new',
  'change',
  'update',
  'fix',
  'auf',
  'und',
  'der',
  'die',
  'das',
  'mit',
  'ein',
  'eine',
  'bitte',
]);

const normalizePath = (path: string): string =>
  String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '');

const tokenizeInstruction = (instruction: string): string[] => {
  const raw = String(instruction || '').toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens)).slice(0, 40);
};

export function classifyEdit(instruction: string): EditInstructionType {
  const text = String(instruction || '').toLowerCase();

  if (
    /(new page|add route|new route|routing|add section|new section|layout change|restructure|sidebar|navbar structure|footer structure)/.test(text)
  ) {
    return 'structural';
  }
  if (
    /(database|supabase|fetch|api|endpoint|schema|table|query|sql|rpc|mutation|insert|update row|delete row|auth flow|login backend|register backend)/.test(text)
  ) {
    return 'data';
  }
  if (
    /(color|font|typography|text size|spacing|padding|margin|background|gradient|shadow|border|radius|rounded|hover|animation|theme|tailwind class|header color)/.test(text)
  ) {
    return 'style';
  }
  if (
    /(text|copy|headline|title|description|wording|rename|label|cta text|button text|paragraph|translate|content)/.test(text)
  ) {
    return 'content';
  }
  if (/\b(add|create|build|implement|integrate|introduce)\b/.test(text)) {
    return 'feature-add';
  }
  if (/\b(change|update|fix|improve|modify|adjust|refactor|optimize)\b/.test(text)) {
    return 'feature-modify';
  }
  return 'feature-modify';
}

export function extractComponents(files: FileMap): string[] {
  const components = new Set<string>();
  Object.entries(files || {}).forEach(([rawPath, content]) => {
    const path = normalizePath(rawPath);
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) return;
    const basename = path.split('/').pop()?.replace(/\.(tsx|jsx|ts|js)$/, '') || '';
    if (/^[A-Z][A-Za-z0-9_]+$/.test(basename)) {
      components.add(basename);
    }

    const defaultExportMatches = content.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g);
    for (const match of defaultExportMatches) {
      components.add(match[1]);
    }
    const functionMatches = content.matchAll(/(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g);
    for (const match of functionMatches) {
      components.add(match[1]);
    }
    const constMatches = content.matchAll(/(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/g);
    for (const match of constMatches) {
      components.add(match[1]);
    }
  });
  return Array.from(components).sort().slice(0, 160);
}

export function extractImports(files: FileMap): string[] {
  const graph: string[] = [];
  Object.entries(files || {}).forEach(([rawPath, content]) => {
    const path = normalizePath(rawPath);
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) return;
    const imports = Array.from(content.matchAll(/import\s+[\s\S]*?\s+from\s+['"`]([^'"`]+)['"`]/g))
      .map((match) => String(match[1] || '').trim())
      .filter(Boolean);
    if (imports.length === 0) return;
    graph.push(`${path} -> ${imports.slice(0, 10).join(', ')}`);
  });
  return graph.slice(0, 160);
}

export function extractState(files: FileMap): string[] {
  const stateEntries: string[] = [];
  Object.entries(files || {}).forEach(([rawPath, content]) => {
    const path = normalizePath(rawPath);
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) return;
    const useStateVars = Array.from(content.matchAll(/const\s*\[\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\]\s*=\s*useState\b/g))
      .map((match) => `${match[1]}/${match[2]}`);
    const contexts = Array.from(content.matchAll(/useContext\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g))
      .map((match) => match[1]);
    const reducers = Array.from(content.matchAll(/useReducer\(\s*([A-Za-z_$][A-Za-z0-9_$]*)?/g))
      .map((match) => match[1])
      .filter(Boolean);
    const segments: string[] = [];
    if (useStateVars.length > 0) segments.push(`useState(${useStateVars.slice(0, 6).join(', ')})`);
    if (contexts.length > 0) segments.push(`useContext(${contexts.slice(0, 6).join(', ')})`);
    if (reducers.length > 0) segments.push(`useReducer(${reducers.slice(0, 6).join(', ')})`);
    if (segments.length > 0) stateEntries.push(`${path}: ${segments.join(' | ')}`);
  });
  return stateEntries.slice(0, 160);
}

export function extractRoutes(files: FileMap): string[] {
  const routes = new Set<string>(['/']);
  Object.values(files || {}).forEach((content) => {
    const routePathMatches = content.matchAll(/<Route[^>]*\spath\s*=\s*['"`]([^'"`]+)['"`]/g);
    for (const match of routePathMatches) routes.add(String(match[1] || '').trim());
    const toMatches = content.matchAll(/\bto\s*=\s*['"`]([^'"`]+)['"`]/g);
    for (const match of toMatches) routes.add(String(match[1] || '').trim());
    const hrefMatches = content.matchAll(/\bhref\s*=\s*['"`]([^'"`]+)['"`]/g);
    for (const match of hrefMatches) {
      const href = String(match[1] || '').trim();
      if (!href.startsWith('http')) routes.add(href);
    }
  });
  return Array.from(routes)
    .map((route) => route.split('?')[0].split('#')[0].trim())
    .filter((route) => route.startsWith('/'))
    .sort()
    .slice(0, 120);
}

export function extractSupabaseCalls(files: FileMap): string[] {
  const tables = new Set<string>();
  Object.values(files || {}).forEach((content) => {
    const matches = content.matchAll(/\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g);
    for (const match of matches) {
      tables.add(String(match[1] || '').trim());
    }
  });
  return Array.from(tables).sort().slice(0, 80);
}

export function findRelevantFiles(
  files: FileMap,
  instruction: string,
  limit = 5
): FileMap {
  const keywords = tokenizeInstruction(instruction);
  const entries = Object.entries(files || {}).map(([rawPath, rawContent]) => {
    const path = normalizePath(rawPath);
    const content = String(rawContent || '');
    const lowerPath = path.toLowerCase();
    const lowerContent = content.toLowerCase();
    let score = 0;
    keywords.forEach((keyword) => {
      if (lowerPath.includes(keyword)) score += 10;
      const matches = lowerContent.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
      score += Math.min(8, matches?.length || 0);
    });

    if (/src\/app\.tsx$/.test(lowerPath)) score += 5;
    if (/src\/pages\//.test(lowerPath)) score += 3;
    if (/src\/components\//.test(lowerPath)) score += 2;

    return { path, content, score };
  });

  const ranked = entries
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.path.localeCompare(b.path);
    })
    .slice(0, Math.max(1, limit));

  if (ranked.every((entry) => entry.score <= 0)) {
    const fallbackPaths = ['src/App.tsx', 'src/main.tsx'];
    fallbackPaths.forEach((path) => {
      const hit = entries.find((entry) => entry.path === path);
      if (hit && !ranked.some((entry) => entry.path === hit.path)) ranked.unshift(hit);
    });
  }

  return ranked
    .slice(0, Math.max(1, limit))
    .reduce<FileMap>((acc, entry) => {
      acc[entry.path] = entry.content;
      return acc;
    }, {});
}

export async function buildProjectContext(projectId: string, files: FileMap, instruction: string): Promise<ProjectContextSnapshot> {
  const safeProjectId = String(projectId || '').trim();
  void safeProjectId;
  const normalizedFiles: FileMap = {};
  Object.entries(files || {}).forEach(([path, content]) => {
    normalizedFiles[normalizePath(path)] = String(content || '');
  });
  const fileTree = Object.keys(normalizedFiles).sort().join('\n');
  return {
    fileTree,
    components: extractComponents(normalizedFiles),
    importGraph: extractImports(normalizedFiles),
    stateMap: extractState(normalizedFiles),
    routes: extractRoutes(normalizedFiles),
    supabaseTables: extractSupabaseCalls(normalizedFiles),
    relevantFiles: findRelevantFiles(normalizedFiles, instruction, 5),
  };
}

export function buildEditTypePrompt(editType: EditInstructionType): string {
  if (editType === 'style') {
    return 'Make ONLY Tailwind class changes. Do not touch logic, structure, or content. Return only the files with CSS changes.';
  }
  if (editType === 'content') {
    return 'Change ONLY text content. Keep all className, logic, and structure identical. Return only the files with text changes.';
  }
  if (editType === 'feature-add') {
    return 'Create a new component in src/components/. Import and use it in the appropriate existing file. Do not modify any other existing code. Follow the exact same patterns already used in the codebase.';
  }
  if (editType === 'feature-modify') {
    return 'Modify the existing feature with minimal, targeted changes. Keep routing and unaffected components unchanged. Return only files that must change.';
  }
  if (editType === 'structural') {
    return 'Apply structural updates carefully: add required page/route/section while preserving all existing functionality and import conventions.';
  }
  return 'Apply only data-layer changes (Supabase/API/hooks/state wiring) with minimal UI disruption. Keep component structure stable unless explicitly requested.';
}

export function buildExistingProjectContextBlock(input: {
  projectContext: ProjectContextSnapshot | null;
  instruction: string;
  editType: EditInstructionType | null;
  recentEdits: EditHistoryEntry[];
}): string {
  const context = input.projectContext;
  if (!context) return '';

  const components = context.components.length > 0 ? context.components.join(', ') : '(none)';
  const routes = context.routes.length > 0 ? context.routes.join(', ') : '(none)';
  const tables = context.supabaseTables.length > 0 ? context.supabaseTables.join(', ') : '(none)';
  const history = input.recentEdits.length > 0
    ? input.recentEdits
      .map((entry) => `- "${entry.instruction}" -> changed ${(entry.filesChanged || []).join(', ') || '(unknown files)'}`)
      .join('\n')
    : '- (no recent edits)';

  return `EXISTING PROJECT CONTEXT:
File structure:
${context.fileTree || '(no files)'}

Existing components: ${components}
Existing routes: ${routes}
Supabase tables in use: ${tables}

EDIT INSTRUCTION: ${input.instruction}
EDIT TYPE: ${input.editType || 'feature-modify'}

RECENT EDIT HISTORY for context:
${history}

CRITICAL RULES:
1. You are modifying an EXISTING project
2. Keep ALL existing functionality intact
3. Match the EXACT coding style already used
4. Use the SAME import patterns already established
5. If adding a component, follow the naming convention already used
6. Return COMPLETE file content, not snippets
7. Only return files that actually need to change`;
}

export function buildProjectContextSnapshotPrompt(context: ProjectContextSnapshot | null): string {
  if (!context) return '';
  const relevantFilesBlock = Object.entries(context.relevantFiles)
    .map(([path, content]) => {
      const trimmed = String(content || '').slice(0, 7000);
      return `### ${path}\n\`\`\`tsx\n${trimmed}\n\`\`\``;
    })
    .join('\n\n');

  return `PROJECT CONTEXT SNAPSHOT:
File tree:
${context.fileTree || '(no files)'}

Component map:
${context.components.join(', ') || '(none)'}

Import graph:
${context.importGraph.join('\n') || '(none)'}

State map:
${context.stateMap.join('\n') || '(none)'}

Route map:
${context.routes.join(', ') || '(none)'}

Supabase tables in use:
${context.supabaseTables.join(', ') || '(none)'}

Most relevant files for this edit:
${relevantFilesBlock || '(none)'}`;
}

export function calculateChangeRatio(original: string, modified: string): number {
  const originalLines = String(original || '').split(/\r?\n/);
  const modifiedLines = String(modified || '').split(/\r?\n/);
  const originalCount = Math.max(1, originalLines.length);
  if (originalLines.length === 0 && modifiedLines.length === 0) return 0;
  if (originalLines.length === 0 && modifiedLines.length > 0) return 1;

  const sharedLength = Math.min(originalLines.length, modifiedLines.length);
  let changedLineCount = Math.abs(originalLines.length - modifiedLines.length);
  for (let i = 0; i < sharedLength; i += 1) {
    if (originalLines[i].trim() !== modifiedLines[i].trim()) changedLineCount += 1;
  }
  return Math.max(0, Math.min(1, changedLineCount / originalCount));
}

const getEditTypeRatioThreshold = (editType: EditInstructionType): number => {
  if (editType === 'style') return 0.3;
  if (editType === 'content') return 0.5;
  if (editType === 'feature-modify') return 0.85;
  return 1.01;
};

export function applyEditDiff(oldFiles: FileMap, newFiles: FileMap, editType: EditInstructionType): EditDiffResult {
  const normalizedOldFiles: FileMap = {};
  Object.entries(oldFiles || {}).forEach(([rawPath, content]) => {
    const path = normalizePath(rawPath);
    if (!path) return;
    normalizedOldFiles[path] = String(content || '');
  });

  const normalizedNewFiles: FileMap = {};
  Object.entries(newFiles || {}).forEach(([rawPath, content]) => {
    const path = normalizePath(rawPath);
    if (!path) return;
    normalizedNewFiles[path] = String(content || '');
  });

  const result: FileMap = { ...normalizedOldFiles };
  const revertedByChangeRatio: string[] = [];
  const changedPaths: string[] = [];
  const changeRatios: Record<string, number> = {};
  const threshold = getEditTypeRatioThreshold(editType);

  Object.entries(normalizedNewFiles).forEach(([path, newContent]) => {
    const oldContent = normalizedOldFiles[path];

    if (typeof oldContent === 'string') {
      const changeRatio = calculateChangeRatio(oldContent, newContent);
      changeRatios[path] = changeRatio;
      if (changeRatio > threshold) {
        revertedByChangeRatio.push(path);
        return;
      }
      if (oldContent !== newContent) {
        result[path] = newContent;
        changedPaths.push(path);
      }
      return;
    }

    result[path] = newContent;
    changedPaths.push(path);
    changeRatios[path] = 1;
  });

  return {
    files: result,
    changedPaths: Array.from(new Set(changedPaths)),
    revertedByChangeRatio: Array.from(new Set(revertedByChangeRatio)),
    changeRatios,
  };
}
