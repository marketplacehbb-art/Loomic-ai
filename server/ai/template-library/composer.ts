import { BlockCategory, ComposedTemplateProject, TemplateBlock, TemplatePreset } from './types.js';
import { getBlockById, getTemplatePreset, inferPresetFromPrompt } from './registry.js';

interface ComposeInput {
  templateId?: string;
  prompt: string;
  forceBlockIds?: string[];
  projectName?: string;
  planContextPrompt?: string;
  pagePaths?: string[];
}

const PROJECT_NAME_STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'bauen', 'build', 'create', 'dashboard',
  'der', 'die', 'ein', 'eine', 'einen', 'einer', 'einem', 'for', 'fuer', 'fur',
  'für', 'homepage', 'ich', 'in', 'landing', 'landingpage', 'mach', 'make', 'mir',
  'modern', 'moderne', 'modernes', 'my', 'nh', 'page', 'please', 'projekt',
  'resta', 'restaurant', 'saas', 'shop', 'site', 'startup', 'und', 'webseite',
  'website'
]);

function titleCaseWord(input: string): string {
  if (input.length <= 3) return input.toUpperCase();
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

function normalizeProjectName(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9&\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const filtered = words.filter((word) => !PROJECT_NAME_STOP_WORDS.has(word.toLowerCase()));
  const selected = (filtered.length > 0 ? filtered : words).slice(0, 3);

  return selected.map((word) => titleCaseWord(word)).join(' ');
}

function extractProjectNameFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();

  const quotedMatch = trimmed.match(/["'`“”]([^"'`“”]{2,60})["'`“”]/);
  if (quotedMatch) {
    const normalized = normalizeProjectName(quotedMatch[1]);
    if (normalized) return normalized;
  }

  const explicitPatterns = [
    /\b(?:name|brand|projektname|appname|heißt|heisst|called|named)\s*(?::|ist|is)?\s*([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,60})/i,
    /\b(?:für|fuer|for)\s+([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,60})/i
  ];

  for (const pattern of explicitPatterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const normalized = normalizeProjectName(match[1]);
    if (normalized) return normalized;
  }

  const tokens = (trimmed.match(/[a-zA-Z0-9&-]+/g) || [])
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 2 && !PROJECT_NAME_STOP_WORDS.has(token));

  if (tokens.length > 0) {
    return tokens.slice(0, 2).map((token) => titleCaseWord(token)).join(' ');
  }

  return 'Nova Project';
}

function applyProjectTokens(code: string, projectName: string): string {
  return code.replace(/\{\{\s*projectName\s*\}\}/gi, projectName);
}

function choosePreset(input: ComposeInput): TemplatePreset {
  if (input.templateId) {
    const explicit = getTemplatePreset(input.templateId);
    if (explicit) {
      return explicit;
    }
  }
  return inferPresetFromPrompt(input.prompt);
}

function pickOptionalBlocks(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const extra: string[] = [];

  if (/modal|dialog|confirm/.test(lower)) extra.push('modal-action-01');
  if (/pricing|plan|subscription/.test(lower)) extra.push('pricing-three-tier-01');
  if (/chart|graph|report/.test(lower)) extra.push('chart-area-mock-01');
  if (/stats|numbers|kpi/.test(lower)) extra.push('stats-cards-01');
  if (/footer|impressum|contact/.test(lower)) extra.push('footer-enterprise-01');
  if (/hero|headline/.test(lower)) extra.push('hero-ai-modern-01');

  return extra;
}

function dedupeBlocks(blocks: TemplateBlock[]): TemplateBlock[] {
  const seen = new Set<string>();
  const result: TemplateBlock[] = [];
  blocks.forEach((block) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      result.push(block);
    }
  });
  return result;
}

function resolveBlocks(preset: TemplatePreset, prompt: string, forceBlockIds: string[] = []): TemplateBlock[] {
  const ids = forceBlockIds.length > 0
    ? forceBlockIds
    : [...preset.defaultBlocks, ...pickOptionalBlocks(prompt)];
  const resolved = ids
    .map((id) => getBlockById(id))
    .filter((block): block is TemplateBlock => Boolean(block));
  return dedupeBlocks(resolved);
}

function buildLandingApp(blocks: TemplateBlock[]): string {
  const landingRenderOrder: BlockCategory[] = [
    'navbar',
    'banner',
    'hero',
    'features',
    'testimonials',
    'team',
    'timeline',
    'gallery',
    'blog',
    'ecommerce',
    'social-proof',
    'pricing',
    'cta',
    'faq',
    'contact',
    'footer',
  ];
  const ordered = landingRenderOrder.flatMap((category) => blocks.filter((block) => block.category === category));

  const imports: string[] = [];
  const sections: string[] = [];
  const seenImports = new Set<string>();

  ordered.forEach((block) => {
    const importPath = `./${block.filePath.replace(/^src\//, '')}`;
    const importLine = `import ${block.componentName} from '${importPath}';`;
    if (!seenImports.has(importLine)) {
      imports.push(importLine);
      seenImports.add(importLine);
    }
    sections.push(`      <${block.componentName} />`);
  });

  return `${imports.join('\n')}

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
${sections.join('\n')}
    </div>
  );
}
`;
}

function buildDashboardApp(blocks: TemplateBlock[]): string {
  const sidebar = blocks.find((b) => b.category === 'sidebar');
  const dashboard = blocks.find((b) => b.category === 'dashboard');
  const stats = blocks.find((b) => b.category === 'stats');
  const chart = blocks.find((b) => b.category === 'chart');
  const footer = blocks.find((b) => b.category === 'footer');

  const imports: string[] = [];
  const content: string[] = [];

  if (sidebar) imports.push(`import ${sidebar.componentName} from './${sidebar.filePath.replace(/^src\//, '')}';`);
  if (dashboard) imports.push(`import ${dashboard.componentName} from './${dashboard.filePath.replace(/^src\//, '')}';`);
  if (stats) imports.push(`import ${stats.componentName} from './${stats.filePath.replace(/^src\//, '')}';`);
  if (chart) imports.push(`import ${chart.componentName} from './${chart.filePath.replace(/^src\//, '')}';`);
  if (footer) imports.push(`import ${footer.componentName} from './${footer.filePath.replace(/^src\//, '')}';`);

  if (dashboard) content.push(`          <${dashboard.componentName} />`);
  if (stats) content.push(`          <${stats.componentName} />`);
  if (chart) content.push(`          <${chart.componentName} />`);
  if (footer) content.push(`          <div className="mt-8"><${footer.componentName} /></div>`);

  return `${imports.join('\n')}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        ${sidebar ? `<${sidebar.componentName} />` : '<aside className="w-16 border-r border-slate-200 dark:border-slate-800" />'}
        <main className="flex-1 space-y-6 px-6 py-6">
${content.join('\n')}
        </main>
      </div>
    </div>
  );
}
`;
}

function buildAuthApp(blocks: TemplateBlock[]): string {
  const primaryAuth = blocks.find((b) => b.id === 'auth-split-card-01') || blocks.find((b) => b.category === 'auth');
  const secondaryAuth = blocks.find((b) => b.id === 'auth-minimal-01');
  const footer = blocks.find((b) => b.category === 'footer');

  const imports: string[] = [];
  if (primaryAuth) imports.push(`import ${primaryAuth.componentName} from './${primaryAuth.filePath.replace(/^src\//, '')}';`);
  if (secondaryAuth) imports.push(`import ${secondaryAuth.componentName} from './${secondaryAuth.filePath.replace(/^src\//, '')}';`);
  if (footer) imports.push(`import ${footer.componentName} from './${footer.filePath.replace(/^src\//, '')}';`);

  return `${imports.join('\n')}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-8">
        ${primaryAuth ? `<${primaryAuth.componentName} />` : '<div />'}
        ${secondaryAuth ? `<${secondaryAuth.componentName} />` : ''}
      </div>
      ${footer ? `<div className="mt-12"><${footer.componentName} /></div>` : ''}
    </div>
  );
}
`;
}

function buildAppFile(mode: TemplatePreset['mode'], blocks: TemplateBlock[]): string {
  if (mode === 'dashboard') return buildDashboardApp(blocks);
  if (mode === 'auth') return buildAuthApp(blocks);
  return buildLandingApp(blocks);
}

function buildCompositionPrompt(
  preset: TemplatePreset,
  blocks: TemplateBlock[],
  projectName: string,
  planContextPrompt?: string,
  pagePaths: string[] = ['/']
): string {
  const list = blocks.map((block) => `- ${block.id} (${block.category}, ${block.style})`).join('\n');
  const multiPageInstruction = pagePaths.length > 1
    ? `Routing requirement: Generate real multi-page routing for these paths: ${pagePaths.join(', ')}.`
    : 'Routing requirement: Keep single-page structure unless prompt requests additional routes.';
  const basePrompt = `Template preset: ${preset.id}
Template mode: ${preset.mode}
Project name / brand: ${projectName}
Selected blocks:
${list}
${multiPageInstruction}

Compose the app using these blocks. Keep file boundaries, reuse existing section structure, and only adapt:
1) copy text
2) small visual styling
3) simple interactions.
Ensure branding in navbar/hero uses the project name above.
Never use placeholder brand names like "BuilderKit".
Never use placeholder labels like "Feature 1", "Feature 2", "Lorem ipsum", or generic one-line hero copy.
Avoid replacing the full project with a single-file rewrite.`;
  if (!planContextPrompt) {
    return basePrompt;
  }
  return `${basePrompt}\n\nStructured plan context:\n${planContextPrompt}`;
}

export function composeTemplateProject(input: ComposeInput): ComposedTemplateProject {
  const preset = choosePreset(input);
  const selectedBlocks = resolveBlocks(preset, input.prompt, input.forceBlockIds || []);
  const projectName = (input.projectName && input.projectName.trim().length > 0)
    ? input.projectName.trim()
    : extractProjectNameFromPrompt(input.prompt);

  const files: Record<string, string> = {};
  selectedBlocks.forEach((block) => {
    files[block.filePath] = applyProjectTokens(block.code, projectName);
  });

  files['src/App.tsx'] = applyProjectTokens(buildAppFile(preset.mode, selectedBlocks), projectName);

  return {
    preset,
    selectedBlocks,
    projectName,
    files,
    compositionPrompt: buildCompositionPrompt(preset, selectedBlocks, projectName, input.planContextPrompt, input.pagePaths),
  };
}
