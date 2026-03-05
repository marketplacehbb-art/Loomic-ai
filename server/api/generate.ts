/**
 * Express API Route: POST /api/generate
 * Handles LLM code generation requests with code processing
 */

import { Router, Request, Response } from 'express';
import { llmManager } from './llm/manager.js';
import { codeProcessor } from '../utils/code-processor.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { validateRequest, generateSchema } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getBaseTemplateFiles } from '../ai/project-pipeline/template-base.js';
import { createFilePlan, filterFilesForLLMContext } from '../ai/project-pipeline/file-planner.js';
import { assembleProjectFiles, hydrateMissingLocalImports, toProcessedFiles } from '../ai/project-pipeline/project-assembler.js';
import {
  applySectionUpdateGuard,
  createSectionRegenerationPlan,
  filterFilesForSectionContext,
  type PromptIntentHint
} from '../ai/project-pipeline/section-regeneration.js';
import { buildRagLightContext, type EditScope as RagEditScope } from '../ai/project-pipeline/context-injector.js';
import { buildFileHashMap, computeSmartDiff } from '../ai/project-pipeline/smart-diff.js';
import { projectSnapshotStore } from '../ai/project-pipeline/snapshot-store.js';
import { buildStyleRetryPrompt, evaluateStylePolicy, isStylePrompt } from '../ai/project-pipeline/style-policy.js';
import { evaluateLibraryQuality } from '../ai/project-pipeline/library-quality-gate.js';
import { editTelemetry } from '../ai/project-pipeline/edit-telemetry.js';
import { generateObservability } from '../ai/project-pipeline/generate-observability.js';
import { getFeatureFlagsForRequest as getRequestFeatureFlags, type FeatureFlags } from '../config/feature-flags.js';
import {
  parseLLMOutput,
  sanitizeGeneratedModuleCode,
  ensureLastResortRenderableOutput,
  type ParsedLLMOutput,
} from '../ai/project-pipeline/llm-response-parser.js';
import { polishGeneratedContent } from '../ai/project-pipeline/content-intelligence.js';
import { applyDeterministicEditActions } from '../ai/project-pipeline/deterministic-edit-actions.js';
import { evaluateQualityGates } from '../ai/project-pipeline/quality-gates.js';
import {
  extractDesignGenomeFromFiles,
  getDesignDiversityAdvice,
  storeDesignGenome
} from '../ai/project-pipeline/design-genome.js';
import { applyAstPatches, type AstPatchOperation } from '../ai/processor-evolution/ast-rewriter.js';
import { composeTemplateProject } from '../ai/template-library/composer.js';
import { getTemplateCatalog } from '../ai/template-library/registry.js';
import { createResolvedProjectPlan } from '../ai/template-library/project-plan.js';
import type { BlockCategory } from '../ai/template-library/types.js';
import { iconValidator } from '../ai/code-pipeline/icon-validator.js';
import { iconRegistry } from '../utils/icon-registry.js';
import { RUNTIME_DEP_VERSION_HINTS } from '../ai/runtime/dependency-registry.js';
import { sanitizeErrorForLog } from '../utils/error-sanitizer.js';
import { resolveDomainPacks } from '../ai/domain-packs/index.js';
import {
  applyDeterministicDomainFallback,
  evaluateDomainCoverage,
} from '../ai/domain-packs/coverage.js';
import {
  EDIT_MODE_READ_ONLY_FILES,
  extractSourceIdFromSelector,
  isEditProtectedRootFile,
  isRuntimeUiSourcePath,
  normalizeGeneratedPath,
  normalizeGeneratedPathSafe,
  resolveSourceFileFromSourceId,
} from './generate-path-utils.js';
import {
  APP_DEFAULT_EXPORT_FALLBACK,
  ensureAppDefaultExportInFileMap,
  ensureAppDefaultExportInFiles,
  hasDefaultExport,
  isAppModulePath,
  looksLikeHtmlDocument,
  tryInjectDefaultExportForApp,
} from './generate-shared.js';
import {
  SupportedProvider,
  isSupportedProvider,
  ProviderErrorCategory,
  ClassifiedProviderError,
  getAlternateProvider,
  extractProviderErrorStatus,
  isMissingRpcError,
  toObservedProvider,
  classifyProviderError,
} from './generate-validation.js';
import {
  buildSupabaseIntegrationPrompt,
  buildVisualAnchorPrompt,
  detectBackendIntent,
  trimAnchorValue,
} from './generate-prompt-utils.js';
import { collectProjectDependencies } from './generate-dependency-utils.js';
import {
  buildEditModeContextPrompt,
  TIMEOUT_MS,
  withTimeout,
} from './generate-edit-mode-utils.js';
import {
  applyEditDiff,
  buildEditTypePrompt,
  buildExistingProjectContextBlock,
  buildProjectContext,
  buildProjectContextSnapshotPrompt,
  classifyEdit,
  type EditHistoryEntry,
  type EditInstructionType,
  type ProjectContextSnapshot,
} from './edit-system.js';
import {
  inferFallbackEditScope,
  normalizeArchitectPath,
  normalizeArchitectPaths,
} from './generate-architect-utils.js';
import { STACK_CONSTRAINT } from '../prompts/designReferences.js';
import { hydratePrompt, inferDatabaseTablesFromPrompt, inferIndustryFromPrompt, type HydratedContext } from './hydration.js';
import { getIndustryFonts } from '../prompts/industryProfiles.js';
import { getGitHubConnectionStatus } from './git/github-integration.js';
import { getUserProviderApiKeys, type UserApiKeyMap } from './user-api-keys.js';

import { inferPromptUnderstandingWithAI, type PromptUnderstandingResult } from './generate-prompt-builder.js';
import {
  type PipelinePath,
  type TokenBudgetDecision,
  type ComplexPromptMode,
  type ComplexPromptRouteProfile,
  isStyleIntentPrompt,
  clampTokens,
  createTokenBudget,
  classifyComplexPromptRoute,
  buildComplexRouteDirective,
} from './generate-token-budget.js';
import {
  executeStructuredRetryLoop,
  coerceToStructuredFilesFallback,
  attemptTsxRescue,
} from './generate-structured-retry.js';
import {
  runStructuredAutoRepairLoop,
  type AutoRepairSummary,
} from './generate-auto-repair.js';
import {
  buildQualitySummary,
  type OrchestratorCritiqueSnapshot,
  type QualitySummary,
} from './generate-quality.js';
import {
  buildGenerateErrorResponse,
  buildGenerateSuccessResponse,
  buildResponseErrors,
  buildResponseWarnings,
} from './generate-response.js';

const router = Router();

function ensureStackConstraintInSystemPrompt(baseSystemPrompt: string): string {
  const normalized = String(baseSystemPrompt || '').trim();
  if (normalized.includes('You generate EXCLUSIVELY:')) {
    return normalized;
  }
  if (!normalized) return STACK_CONSTRAINT;
  return `${STACK_CONSTRAINT}\n\n${normalized}`;
}

function parseImageDataUrl(value: unknown): { mimeType: string; base64: string } | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mimeType, base64] = match;
  if (!mimeType || !base64) return null;
  return { mimeType, base64 };
}

type CreditPlan = 'free' | 'pro' | 'business' | 'enterprise';

interface CreditGateResult {
  allowed: boolean;
  plan?: CreditPlan;
  creditsTotal?: number;
  resetsAt?: string;
  creditsRemaining?: number;
}

const normalizeCreditPlan = (value: unknown): CreditPlan => {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'pro' || plan === 'business' || plan === 'enterprise') return plan;
  return 'free';
};

const getPlanCreditTotal = (plan: CreditPlan): number => {
  if (plan === 'pro') return 100;
  if (plan === 'business') return 500;
  if (plan === 'enterprise') return Number.MAX_SAFE_INTEGER;
  return 5;
};

function getNextResetTime(plan: string): Date {
  const normalizedPlan = normalizeCreditPlan(plan);
  const now = new Date();
  if (normalizedPlan === 'free') {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return next;
}

async function checkAndDeductCredits(userId: string): Promise<CreditGateResult> {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return { allowed: true };
  if (!supabaseAdmin) return { allowed: true };

  const { data: user, error } = await supabaseAdmin
    .from('profiles')
    .select('plan, credits_used, credits_total, credits_reset_at')
    .eq('id', safeUserId)
    .maybeSingle();

  const tableMissing =
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    String(error?.message || '').toLowerCase().includes('does not exist');

  if (error && !tableMissing) {
    console.warn('[Billing] credit check failed:', error.message || error);
    return { allowed: true };
  }
  if (!user) return { allowed: true };

  const plan = normalizeCreditPlan((user as any).plan);
  const planCreditTotal = getPlanCreditTotal(plan);
  const configuredTotal = Number((user as any).credits_total);
  const creditsTotal = Number.isFinite(configuredTotal) && configuredTotal > 0
    ? Math.floor(configuredTotal)
    : planCreditTotal;
  const usedValue = Number((user as any).credits_used);
  let creditsUsed = Number.isFinite(usedValue) && usedValue >= 0 ? Math.floor(usedValue) : 0;
  let resetAtIso = String((user as any).credits_reset_at || '').trim();
  let resetAtDate = resetAtIso ? new Date(resetAtIso) : new Date(0);
  const now = new Date();

  if (!resetAtIso || Number.isNaN(resetAtDate.getTime()) || now > resetAtDate) {
    const nextReset = getNextResetTime(plan);
    await supabaseAdmin.from('profiles').update({
      credits_used: 0,
      credits_total: creditsTotal,
      credits_reset_at: nextReset.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', safeUserId);
    creditsUsed = 0;
    resetAtDate = nextReset;
    resetAtIso = nextReset.toISOString();
  }

  if (plan === 'enterprise') {
    return {
      allowed: true,
      plan,
      creditsTotal,
      resetsAt: resetAtIso,
      creditsRemaining: Number.MAX_SAFE_INTEGER,
    };
  }

  if (creditsUsed >= creditsTotal) {
    return {
      allowed: false,
      plan,
      creditsTotal,
      resetsAt: resetAtIso || resetAtDate.toISOString(),
    };
  }

  const nextUsed = creditsUsed + 1;
  await supabaseAdmin.from('profiles').update({
    credits_used: nextUsed,
    credits_total: creditsTotal,
    credits_reset_at: resetAtIso || resetAtDate.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', safeUserId);

  return {
    allowed: true,
    plan,
    creditsTotal,
    resetsAt: resetAtIso || resetAtDate.toISOString(),
    creditsRemaining: Math.max(0, creditsTotal - nextUsed),
  };
}

function normalizeDatabaseTables(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  value.forEach((entry) => {
    const normalized = String(entry || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 48);
    if (normalized) deduped.add(normalized);
  });
  return [...deduped].slice(0, 8);
}

function buildSupabaseSchemaFallback(tableNames: string[]): string {
  const tables = normalizeDatabaseTables(tableNames).slice(0, 5);
  if (tables.length === 0) return '';

  const statements: string[] = [
    '-- Generated fallback Supabase schema',
    'create extension if not exists "pgcrypto";',
  ];

  tables.forEach((table) => {
    statements.push(
      `create table if not exists public.${table} (`,
      '  id uuid primary key default gen_random_uuid(),',
      '  name text not null,',
      '  status text default \'active\',',
      '  metadata jsonb default \'{}\'::jsonb,',
      '  created_at timestamptz not null default now()',
      ');',
      `alter table public.${table} enable row level security;`,
      `create policy if not exists "${table}_select_authenticated" on public.${table} for select to authenticated using (true);`,
      `create policy if not exists "${table}_insert_authenticated" on public.${table} for insert to authenticated with check (true);`,
      `create policy if not exists "${table}_update_authenticated" on public.${table} for update to authenticated using (true) with check (true);`,
      `create policy if not exists "${table}_delete_authenticated" on public.${table} for delete to authenticated using (true);`,
      `insert into public.${table} (name, status, metadata) values`,
      `  ('Sample ${table} 1', 'active', '{"seed":1}'::jsonb),`,
      `  ('Sample ${table} 2', 'active', '{"seed":2}'::jsonb),`,
      `  ('Sample ${table} 3', 'active', '{"seed":3}'::jsonb)`,
      'on conflict do nothing;',
      ''
    );
  });

  return statements.join('\n').trim();
}

function buildScreenshotSystemPromptAddon(enabled: boolean): string {
  if (!enabled) return '';
  return `You are rebuilding a UI from a screenshot.
Rules:
- Match the layout exactly (grid, flex, positioning)
- Match colors as closely as possible with Tailwind classes
- Match typography sizes and weights
- Preserve all visible text content from the screenshot
- Use shadcn/ui components where appropriate
- Make it fully responsive
- Output complete multi-file structure as always`;
}

function buildVisualEditModePromptBlock(input: {
  targetElement?: {
    tagName?: string;
    className?: string;
    textContent?: string;
  } | null;
  editInstruction?: string | null;
}): string {
  const target = input.targetElement || {};
  const tagName = String(target.tagName || 'element').trim().toLowerCase();
  const className = String(target.className || '').trim();
  const textContent = String(target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const instruction = String(input.editInstruction || '').replace(/\s+/g, ' ').trim();
  return `VISUAL EDIT REQUEST:
Target element: ${tagName} with className='${className || 'n/a'}' containing text='${textContent || 'n/a'}'
Edit instruction: ${instruction || 'apply the requested change exactly'}

Rules:
- Find this EXACT element in the code by its className or text content
- Apply ONLY the requested change to this element
- Do not change anything else
- Return the complete modified file`;
}

type FileMap = Record<string, string>;

function parseLLMOutputWithDebugLogs(
  rawContent: string,
  preferredPath: string,
  existingFiles: Record<string, string>
): ParsedLLMOutput {
  console.log('[RAW_LLM_OUTPUT]', JSON.stringify(rawContent).slice(0, 2000));
  const parsed = parseLLMOutput(rawContent, preferredPath, existingFiles);
  const parsedFiles = Object.fromEntries(
    (parsed.extractedFiles || []).map((file) => {
      const filename = normalizeGeneratedPath(file.path || '') || file.path || 'unknown';
      return [filename, String(file.content || '')];
    })
  ) as Record<string, string>;
  console.log('[PARSED_FILES]', Object.keys(parsedFiles));
  Object.entries(parsedFiles).forEach(([filename, content]) => {
    console.log('[FILE_CONTENT_PREVIEW]', filename, content.slice(0, 200));
  });
  return parsed;
}

function classifyRequest(prompt: string, files: FileMap): PipelinePath {
  const wordCount = String(prompt || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const underWordBudget = wordCount < 120;
  const noExistingFiles = !files || Object.keys(files).length === 0;
  const normalizedPrompt = String(prompt || '');
  const hasComplexSignal = /\b(refactor|redesign|migrate|authentication|database|multi[-\s]?page)\b/i
    .test(normalizedPrompt);

  if (underWordBudget || noExistingFiles || !hasComplexSignal) {
    return 'fast';
  }
  return 'deep';
}

function toSafeComponentIdentifier(path: string, used: Set<string>): string {
  const normalized = normalizeGeneratedPath(path || '');
  const basename = normalized.split('/').pop() || 'Section';
  const stem = basename.replace(/\.[^.]+$/, '');
  const tokens = stem
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  const pascal = tokens.length > 0
    ? tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join('')
    : 'Section';

  let candidate = /^[A-Za-z_$]/.test(pascal) ? pascal : `Section${pascal}`;
  if (!candidate) candidate = 'Section';

  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  let suffix = 2;
  while (used.has(`${candidate}${suffix}`)) {
    suffix += 1;
  }
  const deduped = `${candidate}${suffix}`;
  used.add(deduped);
  return deduped;
}

function inferRecoveredSectionOrder(path: string): number {
  const normalized = normalizeGeneratedPath(path || '');
  const name = (normalized.split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();

  if (/^(navbar|nav|header)/.test(name)) return 0;
  if (/^hero/.test(name)) return 1;
  if (/^(features|benefits|showcase|gallery|highlights)/.test(name)) return 2;
  if (/^(menu|catalog|products|product|cards|pricing)/.test(name)) return 3;
  if (/^(testimonials|reviews|socialproof|proof)/.test(name)) return 4;
  if (/^(faq|questions)/.test(name)) return 5;
  if (/^(cta|contact|booking|form)/.test(name)) return 6;
  if (/^(footer)/.test(name)) return 9;
  return 7;
}

function buildAppFromGeneratedSections(files: Record<string, string>): string | null {
  const sectionPaths = Object.keys(files)
    .map((path) => normalizeGeneratedPath(path))
    .filter((path) =>
      path.startsWith('src/components/sections/') &&
      /\.(tsx|jsx|ts|js)$/.test(path)
    )
    .sort((a, b) => {
      const rankDiff = inferRecoveredSectionOrder(a) - inferRecoveredSectionOrder(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b);
    });

  if (sectionPaths.length === 0) return null;

  const meaningfulSections = sectionPaths.filter((path) => {
    const source = files[path];
    if (typeof source !== 'string') return false;
    if (!/\bexport\s+default\b/.test(source)) return false;
    return /<section|<header|<footer|<nav|className=|aria-|role=/i.test(source);
  });

  const usableSections = meaningfulSections.length > 0 ? meaningfulSections : sectionPaths;
  if (usableSections.length === 0) return null;

  const usedIdentifiers = new Set<string>();
  const sectionEntries = usableSections.map((path) => {
    const identifier = toSafeComponentIdentifier(path, usedIdentifiers);
    const importPath = `./${path.replace(/^src\//, '').replace(/\.(tsx|jsx|ts|js)$/, '')}`;
    return { identifier, importPath };
  });

  const importLines = sectionEntries.map((entry) => `import ${entry.identifier} from '${entry.importPath}';`);
  const renderLines = sectionEntries.map((entry) => `      <${entry.identifier} />`);

  return `${importLines.join('\n')}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
${renderLines.join('\n')}
    </div>
  );
}
`;
}

const POST_GENERATION_MIN_FILES = 5;
const POST_GENERATION_REQUIRED_PATHS = [
  'src/App.tsx',
  'src/pages/HomePage.tsx',
  'src/components/layout/Navbar.tsx',
  'src/components/layout/Footer.tsx',
] as const;

function buildRequiredFileFallback(path: (typeof POST_GENERATION_REQUIRED_PATHS)[number]): string {
  if (path === 'src/App.tsx') {
    return `import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
`;
  }
  if (path === 'src/pages/HomePage.tsx') {
    return `import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight">Welcome</h1>
        <p className="mt-3 text-slate-300">Launch-ready layout with responsive sections and clean content hierarchy.</p>
      </section>
      <Footer />
    </main>
  );
}
`;
  }
  if (path === 'src/components/layout/Navbar.tsx') {
    return `export default function Navbar() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-lg font-semibold text-slate-100">Brand</span>
        <nav className="text-sm text-slate-300">Navigation</nav>
      </div>
    </header>
  );
}
`;
  }
  return `export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-6 py-8 text-slate-400">
      <div className="mx-auto max-w-6xl text-sm">Copyright 2026</div>
    </footer>
  );
}
`;
}

function applyPostGenerationFileGuard(
  files: Array<{ path: string; content: string }>,
  generationMode: 'new' | 'edit'
): {
  files: Array<{ path: string; content: string }>;
  createdPaths: string[];
} {
  const byPath = new Map<string, string>();
  (files || []).forEach((file) => {
    const normalizedPath = normalizeGeneratedPath(file?.path || '');
    if (!normalizedPath) return;
    const content = typeof file?.content === 'string' ? file.content : '';
    byPath.set(normalizedPath, content);
  });

  const createdPaths: string[] = [];
  if (generationMode === 'new') {
    for (const requiredPath of POST_GENERATION_REQUIRED_PATHS) {
      if (!byPath.has(requiredPath)) {
        byPath.set(requiredPath, buildRequiredFileFallback(requiredPath));
        createdPaths.push(requiredPath);
      }
    }
  }

  if (generationMode === 'new' && byPath.size < POST_GENERATION_MIN_FILES) {
    throw new Error(
      `POST_GENERATION_GUARD_MIN_FILES: expected at least ${POST_GENERATION_MIN_FILES} files, got ${byPath.size}`
    );
  }

  const normalizedFiles = [...byPath.entries()].map(([path, content]) => ({ path, content }));
  return {
    files: normalizedFiles,
    createdPaths,
  };
}

const FONT_SYSTEM_MARKER_START = '<!-- AI_BUILDER_FONT_SYSTEM_START -->';
const FONT_SYSTEM_MARKER_END = '<!-- AI_BUILDER_FONT_SYSTEM_END -->';

type ProjectTypographyFonts = {
  heading: string;
  body: string;
};

function toGoogleFontToken(fontFamily: string): string {
  return encodeURIComponent(String(fontFamily || 'Inter')).replace(/%20/g, '+');
}

function buildFontSystemBlock(fonts: ProjectTypographyFonts): string {
  const headingToken = toGoogleFontToken(fonts.heading);
  const bodyToken = toGoogleFontToken(fonts.body);
  const googleFontsHref = `https://fonts.googleapis.com/css2?family=${headingToken}:wght@400;600;700;900&family=${bodyToken}:wght@400;500;600&display=swap`;

  return [
    `  ${FONT_SYSTEM_MARKER_START}`,
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `  <link href="${googleFontsHref}" rel="stylesheet">`,
    '  <style>',
    '    :root {',
    `      --font-heading: '${fonts.heading}', sans-serif;`,
    `      --font-body: '${fonts.body}', sans-serif;`,
    '    }',
    '    body { font-family: var(--font-body); }',
    '    h1,h2,h3,h4 { font-family: var(--font-heading); }',
    '  </style>',
    `  ${FONT_SYSTEM_MARKER_END}`,
  ].join('\n');
}

function injectFontSystemIntoIndexHtml(source: string, fonts: ProjectTypographyFonts): string {
  const html = String(source || '').trim();
  if (!html) return html;

  const escapedStart = FONT_SYSTEM_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = FONT_SYSTEM_MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const managedBlockRegex = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'm');
  const withoutManagedBlock = html.replace(managedBlockRegex, '');
  const block = buildFontSystemBlock(fonts);

  if (withoutManagedBlock.includes('</head>')) {
    return withoutManagedBlock.replace('</head>', `${block}\n</head>`);
  }

  return `${block}\n${withoutManagedBlock}`;
}

function ensureViewportMetaTag(source: string): string {
  const html = String(source || '').trim();
  if (!html) return html;

  const viewportMeta = "  <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=5.0'>";
  const withoutViewport = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>\s*/gi, '');

  if (withoutViewport.includes('</head>')) {
    return withoutViewport.replace('</head>', `${viewportMeta}\n</head>`);
  }

  return `${viewportMeta}\n${withoutViewport}`;
}

function ensureProjectFontSystem(input: {
  files: Record<string, string>;
  prompt: string;
  hydratedContext: HydratedContext | null;
  generationMode: 'new' | 'edit';
}): Record<string, string> {
  const next = { ...input.files };
  const hasIndexHtml = typeof next['index.html'] === 'string';
  if (!hasIndexHtml && input.generationMode !== 'new') {
    return next;
  }

  if (!hasIndexHtml && input.generationMode === 'new') {
    const baseIndex = getBaseTemplateFiles()['index.html'];
    if (typeof baseIndex === 'string' && baseIndex.trim().length > 0) {
      next['index.html'] = baseIndex;
    }
  }

  const indexSource = typeof next['index.html'] === 'string' ? next['index.html'] : '';
  if (!indexSource.trim()) return next;

  const industry = inferIndustryFromPrompt(`${input.prompt} ${input.hydratedContext?.intent || ''}`);
  const fonts = getIndustryFonts(industry);
  const withViewportMeta = ensureViewportMetaTag(indexSource);
  next['index.html'] = injectFontSystemIntoIndexHtml(withViewportMeta, fonts);
  return next;
}

function isFallbackAppPlaceholder(code: string): boolean {
  const normalized = String(code || '');
  return normalized.includes('Generation incomplete');
}

function sanitizeProjectSourceFiles(files: Record<string, string>): Record<string, string> {
  type LucideSpecifier = {
    imported: string;
    local: string;
  };

  const parseLucideSpecifier = (specifier: string): LucideSpecifier | null => {
    const trimmed = specifier.trim();
    if (!trimmed) return null;

    const aliasMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (aliasMatch) {
      return {
        imported: aliasMatch[1],
        local: aliasMatch[2],
      };
    }

    if (!/^[A-Za-z_$][\w$]*$/.test(trimmed)) return null;
    return {
      imported: trimmed,
      local: trimmed,
    };
  };

  const parseLucideSpecifiersDetailed = (specifierList: string[]): LucideSpecifier[] => {
    const deduped = new Map<string, LucideSpecifier>();
    specifierList.forEach((specifier) => {
      const parsed = parseLucideSpecifier(specifier);
      if (!parsed) return;
      const key = `${parsed.imported}::${parsed.local}`;
      if (!deduped.has(key)) {
        deduped.set(key, parsed);
      }
    });
    return [...deduped.values()];
  };

  const parseLucideSpecifiers = (specifierList: string[]): { localBindings: Set<string>; importedNames: Set<string> } => {
    const localBindings = new Set<string>();
    const importedNames = new Set<string>();

    parseLucideSpecifiersDetailed(specifierList).forEach((specifier) => {
      importedNames.add(specifier.imported);
      localBindings.add(specifier.local);
    });

    return { localBindings, importedNames };
  };

  const ensureLucideImportConsistency = (source: string): string => {
    let code = source;
    const lucideImportRegex = /import\s*{([^}]+)}\s*from\s*['"]lucide-react['"];?/g;
    const lucideMatches = Array.from(code.matchAll(lucideImportRegex));

    const strippedBody = code.replace(/^import[^\n]*\n/gm, '\n');

    const globalBindings = new Set<string>();
    const importedBindingRegex = /import\s+(?:[^'"]+)\s+from\s+['"][^'"]+['"]/g;
    for (const match of code.matchAll(importedBindingRegex)) {
      const importPart = match[0].replace(/^import\s+/, '').replace(/\s+from\s+['"][^'"]+['"]$/, '');
      if (importPart.startsWith('{')) {
        const inside = importPart.replace(/^{|}$/g, '');
        inside
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => {
            const alias = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
            globalBindings.add(alias ? alias[2] : item);
          });
      } else {
        const first = importPart.split(',')[0]?.trim();
        if (first && first !== '*') globalBindings.add(first);
      }
    }

    const declarationRegex = /\b(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)\b/g;
    for (const match of strippedBody.matchAll(declarationRegex)) {
      globalBindings.add(match[1]);
    }

    const iconCandidates = new Set<string>();
    const patterns = [
      /<([A-Z][A-Za-z0-9_]*)\b/g,
      /\b(?:jsx|jsxs)\(\s*([A-Z][A-Za-z0-9_]*)\b/g,
      /\bicon\s*:\s*([A-Z][A-Za-z0-9_]*)\b/g,
    ];

    for (const pattern of patterns) {
      for (const match of strippedBody.matchAll(pattern)) {
        iconCandidates.add(match[1]);
      }
    }

    const replacements = new Map<string, string>();
    for (const candidate of iconCandidates) {
      const canonical = iconRegistry.resolveCanonicalName(candidate);
      if (canonical && canonical !== candidate) {
        replacements.set(candidate, canonical);
      }
    }

    for (const [from, to] of replacements.entries()) {
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      code = code.replace(new RegExp(`\\b${escaped}\\b`, 'g'), to);
    }

    const refreshedMatches = Array.from(code.matchAll(lucideImportRegex));
    const refreshedSpecifiers = refreshedMatches
      .flatMap((match) => match[1].split(',').map((part) => part.trim()))
      .filter(Boolean);
    const refreshedDetailedSpecifiers = parseLucideSpecifiersDetailed(refreshedSpecifiers);
    const { localBindings } = parseLucideSpecifiers(refreshedSpecifiers);

    const refreshedBody = code.replace(/^import[^\n]*\n/gm, '\n');
    const missingIcons = new Set<string>();
    for (const pattern of patterns) {
      for (const match of refreshedBody.matchAll(pattern)) {
        const identifier = match[1];
        const canonical = iconRegistry.resolveCanonicalName(identifier);
        if (!canonical) continue;
        if (globalBindings.has(identifier)) continue;
        if (localBindings.has(identifier)) continue;
        missingIcons.add(canonical);
      }
    }

    const nonLucideBindings = new Set<string>();
    const importMatchRegex = /^import\s+([^'"]+)\s+from\s+['"]([^'"]+)['"];?/gm;
    for (const match of code.matchAll(importMatchRegex)) {
      const importClause = (match[1] || '').trim();
      const moduleName = (match[2] || '').trim();
      if (!importClause || moduleName === 'lucide-react') continue;

      const namedMatch = importClause.match(/\{([^}]*)\}/);
      if (namedMatch) {
        namedMatch[1]
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => {
            const alias = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
            nonLucideBindings.add(alias ? alias[2] : item);
          });
      }

      const namespaceMatch = importClause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (namespaceMatch?.[1]) {
        nonLucideBindings.add(namespaceMatch[1]);
      }

      const withoutNamed = importClause.replace(/\{[^}]*\}/g, '').trim();
      const defaultCandidate = withoutNamed
        .split(',')
        .map((item) => item.trim())
        .find((item) => item.length > 0 && item !== '*' && !item.startsWith('*'));
      if (defaultCandidate && /^[A-Za-z_$][\w$]*$/.test(defaultCandidate)) {
        nonLucideBindings.add(defaultCandidate);
      }
    }

    for (const match of refreshedBody.matchAll(/\b(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
      if (match[1]) nonLucideBindings.add(match[1]);
    }

    const takenLocals = new Set<string>();
    const resolvedSpecifiers: LucideSpecifier[] = [];
    const reserveLocal = (base: string): string => {
      const normalizedBase = /^[A-Za-z_$][\w$]*$/.test(base) ? base : 'Icon';
      let candidate = `${normalizedBase}Icon`;
      let suffix = 2;
      while (nonLucideBindings.has(candidate) || takenLocals.has(candidate)) {
        candidate = `${normalizedBase}Icon${suffix}`;
        suffix += 1;
      }
      return candidate;
    };

    refreshedDetailedSpecifiers.forEach((specifier) => {
      let local = specifier.local;
      if (nonLucideBindings.has(local) || takenLocals.has(local)) {
        local = reserveLocal(specifier.imported);
      }
      takenLocals.add(local);
      resolvedSpecifiers.push({
        imported: specifier.imported,
        local,
      });
    });

    if (missingIcons.size > 0) {
      missingIcons.forEach((icon) => {
        if (resolvedSpecifiers.some((specifier) => specifier.imported === icon || specifier.local === icon)) {
          return;
        }
        let local = icon;
        if (nonLucideBindings.has(local) || takenLocals.has(local)) {
          local = reserveLocal(icon);
        }
        takenLocals.add(local);
        resolvedSpecifiers.push({
          imported: icon,
          local,
        });
      });
    }

    if (resolvedSpecifiers.length === 0) {
      return code;
    }

    const mergedByLocal = new Map<string, LucideSpecifier>();
    resolvedSpecifiers.forEach((specifier) => {
      if (!mergedByLocal.has(specifier.local)) {
        mergedByLocal.set(specifier.local, specifier);
      }
    });
    const mergedSpecifiers = [...mergedByLocal.values()]
      .sort((a, b) => a.local.localeCompare(b.local))
      .map((specifier) => (
        specifier.imported === specifier.local
          ? specifier.imported
          : `${specifier.imported} as ${specifier.local}`
      ));
    const mergedLine = `import { ${mergedSpecifiers.join(', ')} } from 'lucide-react';`;

    if (refreshedMatches.length === 0) {
      const firstImportMatch = code.match(/^import[^\n]*\n/m);
      if (!firstImportMatch || typeof firstImportMatch.index !== 'number') {
        return `${mergedLine}\n${code}`;
      }
      const insertAt = firstImportMatch.index + firstImportMatch[0].length;
      return `${code.slice(0, insertAt)}${mergedLine}\n${code.slice(insertAt)}`;
    }

    let rebuilt = code;
    const ranges = refreshedMatches
      .map((match) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        return { start, end };
      })
      .sort((a, b) => b.start - a.start);

    const insertPosition = refreshedMatches[0].index ?? 0;
    for (const range of ranges) {
      rebuilt = `${rebuilt.slice(0, range.start)}${rebuilt.slice(range.end)}`;
    }

    return `${rebuilt.slice(0, insertPosition)}${mergedLine}\n${rebuilt.slice(insertPosition)}`;
  };

  const sanitized: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx|ts|jsx|js)$/.test(path)) {
      sanitized[path] = content;
      continue;
    }

    try {
      const structurallySanitized = sanitizeGeneratedModuleCode(content);
      const validated = iconValidator.validate(structurallySanitized);
      sanitized[path] = ensureLucideImportConsistency(validated);
    } catch (error) {
      console.warn(`[IconValidator] Skipped sanitization for ${path}:`, error);
      sanitized[path] = ensureLucideImportConsistency(sanitizeGeneratedModuleCode(content));
    }
  }

  return sanitized;
}

function toTitleFromSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function summarizeIntentText(value: string, maxLength = 180): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Generated with AI Builder. This project is ready for local development and deployment.';
  }
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(24, maxLength - 3)).trimEnd()}...`;
}

function resolveReadmeProjectTitle(
  files: Record<string, string>,
  prompt: string,
  hydratedContext: HydratedContext | null
): string {
  const pkgRaw = String(files['package.json'] || '').trim();
  if (pkgRaw) {
    try {
      const parsed = JSON.parse(pkgRaw);
      const pkgName = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
      if (pkgName) return toTitleFromSlug(pkgName);
    } catch {
      // ignore invalid package.json for README title inference
    }
  }

  return extractFallbackProductName(prompt, hydratedContext);
}

function ensureGitIgnoreEntries(existingContent: string): string {
  const required = ['node_modules', 'dist', '.env'];
  const kept = new Set<string>();
  const lines: string[] = [];

  String(existingContent || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (!kept.has(line)) {
        kept.add(line);
        lines.push(line);
      }
    });

  required.forEach((entry) => {
    if (!kept.has(entry)) {
      lines.push(entry);
      kept.add(entry);
    }
  });

  return `${lines.join('\n')}\n`;
}

function collectRequiredEnvVars(files: Record<string, string>): string[] {
  const found = new Set<string>();
  const patterns = [
    /import\.meta\.env\.([A-Z0-9_]+)/g,
    /process\.env\.([A-Z0-9_]+)/g,
  ];

  for (const content of Object.values(files || {})) {
    if (typeof content !== 'string' || !content) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const key = String(match[1] || '').trim();
        if (!key) continue;
        found.add(key);
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

function buildEnvExample(envVars: string[]): string {
  const lines = ['# Example environment variables'];
  envVars.forEach((key) => lines.push(`${key}=`));
  return `${lines.join('\n')}\n`;
}

function readmeLooksComplete(content: string): boolean {
  const normalized = String(content || '').toLowerCase();
  if (!normalized) return false;
  const requiredSnippets = ['npm install', 'npm run dev', 'npm run build'];
  if (!requiredSnippets.every((snippet) => normalized.includes(snippet))) return false;
  return normalized.length >= 180;
}

function buildGitHubReadme(input: {
  title: string;
  description: string;
  repoUrl?: string;
  files: Record<string, string>;
}): string {
  let stack = ['React', 'TypeScript', 'Vite'];
  const pkgRaw = String(input.files['package.json'] || '').trim();
  if (pkgRaw) {
    try {
      const parsed = JSON.parse(pkgRaw);
      const deps = Object.keys(parsed?.dependencies || {});
      const devDeps = Object.keys(parsed?.devDependencies || {});
      const combined = [...deps, ...devDeps]
        .filter((name) => typeof name === 'string' && name.trim().length > 0)
        .slice(0, 6);
      if (combined.length > 0) {
        stack = combined;
      }
    } catch {
      // ignore and fallback to default stack
    }
  }

  const repoLine = input.repoUrl ? `\n\nRepository: ${input.repoUrl}` : '';
  return `# ${input.title}

${input.description}${repoLine}

## Tech Stack

- ${stack.join('\n- ')}

## Installation

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`
`;
}

function ensureGitHubConnectedScaffoldFiles(input: {
  files: Record<string, string>;
  prompt: string;
  hydratedContext: HydratedContext | null;
  supabaseConnected: boolean;
  repoUrl?: string | null;
}): Record<string, string> {
  const next = { ...input.files };
  next['.gitignore'] = ensureGitIgnoreEntries(String(next['.gitignore'] || ''));

  const envVars = collectRequiredEnvVars(next);
  if (input.supabaseConnected) {
    envVars.push('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY');
  }
  const dedupedEnvVars = [...new Set(envVars)].sort((a, b) => a.localeCompare(b));
  next['.env.example'] = buildEnvExample(dedupedEnvVars);

  const existingReadme = String(next['README.md'] || '');
  if (!readmeLooksComplete(existingReadme)) {
    const title = resolveReadmeProjectTitle(next, input.prompt, input.hydratedContext);
    const description = summarizeIntentText(input.prompt, 180);
    next['README.md'] = buildGitHubReadme({
      title,
      description,
      repoUrl: input.repoUrl || undefined,
      files: next,
    });
  }

  return next;
}

interface PlannedFileContractResult {
  validPaths: string[];
  discardedPaths: string[];
}

interface GeneratedFileContractValidation {
  accepted: Array<{ path: string; content: string }>;
  rejected: Array<{ path: string; reason: string }>;
  unplanned: string[];
}

function estimateTokensFromText(input: unknown): number {
  if (typeof input !== 'string' || input.length === 0) return 0;
  return Math.max(0, Math.ceil(input.length / 4));
}

function estimateTokensFromFiles(files: Record<string, string> | null | undefined): number {
  if (!files || typeof files !== 'object') return 0;
  try {
    const payload = JSON.stringify(files);
    return estimateTokensFromText(payload);
  } catch {
    return 0;
  }
}

const STRUCTURED_ALLOWED_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'index.html',
  'readme.md',
  'robots.txt',
  'sitemap.xml',
  'src/vite-env.d.ts',
]);

const STRUCTURED_ALLOWED_PREFIXES = [
  'src/',
  'public/',
  'server/',
  'supabase/',
  'scripts/',
  'tests/',
  'migrations/',
  'data/',
  'docs/',
];

const STRUCTURED_ALLOWED_FILE_EXTENSIONS =
  /\.(tsx|ts|jsx|js|css|scss|sass|less|json|html|md|txt|ya?ml|toml|sql)$/i;

const NEW_MODE_CONTRACT_BLOCKLIST = new Set([
  '.gitignore',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'vite.config.ts',
  'vite.config.js',
  'eslint.config.js',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.app.json',
  'components.json',
]);

function normalizeContractPath(input: string): string {
  const raw = String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .trim();
  if (!raw) return '';
  const parts = raw.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

function isStructuredContractPath(path: string): boolean {
  const normalized = normalizeContractPath(path);
  if (!normalized || normalized.endsWith('/')) return false;

  const lower = normalized.toLowerCase();
  if (STRUCTURED_ALLOWED_ROOT_FILES.has(lower)) return true;
  if (normalized.startsWith('.git/')) return false;
  if (/[<>:"|?*]/.test(normalized)) return false;

  const inAllowedPrefix = STRUCTURED_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!inAllowedPrefix) return false;

  if (normalized.endsWith('.d.ts')) return true;
  return STRUCTURED_ALLOWED_FILE_EXTENSIONS.test(normalized);
}

function sanitizePlannedFileContract(paths: string[]): PlannedFileContractResult {
  const valid = new Set<string>();
  const discarded = new Set<string>();

  for (const rawPath of paths || []) {
    const normalized = normalizeContractPath(rawPath || '');
    if (!isStructuredContractPath(normalized)) {
      if (String(rawPath || '').trim().length > 0) discarded.add(String(rawPath));
      continue;
    }
    valid.add(normalized);
  }

  return {
    validPaths: [...valid],
    discardedPaths: [...discarded],
  };
}

function validateGeneratedFilesAgainstContract(input: {
  files: Array<{ path: string; content: string }>;
  generationMode: 'new' | 'edit';
  plannedFileSet: Set<string>;
  templateFileSet: Set<string>;
  isAllowedEditOutputPath: (path: string) => boolean;
}): GeneratedFileContractValidation {
  const acceptedMap = new Map<string, string>();
  const rejected: Array<{ path: string; reason: string }> = [];
  const unplanned = new Set<string>();
  const contractBaseline = new Set<string>([
    'src/App.tsx',
    'src/main.tsx',
    'src/index.css',
    'package.json',
    'index.html',
    ...Array.from(input.plannedFileSet),
    ...Array.from(input.templateFileSet),
  ].map((path) => normalizeContractPath(path)).filter(Boolean));

  for (const file of input.files || []) {
    const normalizedPath = normalizeContractPath(file?.path || '');
    const content = typeof file?.content === 'string' ? file.content : '';

    if (!normalizedPath) {
      rejected.push({ path: String(file?.path || ''), reason: 'empty_path' });
      continue;
    }
    if (!content.trim()) {
      rejected.push({ path: normalizedPath, reason: 'empty_content' });
      continue;
    }
    if (!isStructuredContractPath(normalizedPath)) {
      rejected.push({ path: normalizedPath, reason: 'unsupported_path' });
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(normalizedPath) && looksLikeHtmlDocument(content)) {
      rejected.push({ path: normalizedPath, reason: 'invalid_html_runtime_module' });
      continue;
    }
    if (input.generationMode === 'edit') {
      if (!input.isAllowedEditOutputPath(normalizedPath)) {
        rejected.push({ path: normalizedPath, reason: 'scope_blocked' });
        continue;
      }
      acceptedMap.set(normalizedPath, content);
      continue;
    }

    if (NEW_MODE_CONTRACT_BLOCKLIST.has(normalizedPath)) {
      rejected.push({ path: normalizedPath, reason: 'blocked_root_file' });
      continue;
    }

    if (!contractBaseline.has(normalizedPath) && !normalizedPath.startsWith('src/')) {
      rejected.push({ path: normalizedPath, reason: 'outside_contract' });
      continue;
    }

    if (!contractBaseline.has(normalizedPath) && normalizedPath.startsWith('src/')) {
      unplanned.add(normalizedPath);
    }

    acceptedMap.set(normalizedPath, content);
  }

  return {
    accepted: Array.from(acceptedMap.entries()).map(([path, content]) => ({ path, content })),
    rejected,
    unplanned: Array.from(unplanned),
  };
}


interface ValidationErrorBreakdown {
  total: number;
  byType: {
    import: number;
    icon: number;
    syntax: number;
    type: number;
    runtime: number;
    other: number;
  };
  dominantType: 'import' | 'icon' | 'syntax' | 'type' | 'runtime' | 'other' | 'none';
}

type DetectedIndustry = ReturnType<typeof inferIndustryFromPrompt>;

type FallbackTemplateContext = {
  productName: string;
  industry: DetectedIndustry;
  colorScheme: 'dark' | 'light' | 'colorful';
  intent: string;
};

const FORCE_NEW_PROJECT_PROMPT_REGEX =
  /\b(mach mir|erstelle|baue|neue seite|new page|create|build me|make me)\b/i;

type IntentSignalPattern = {
  label: string;
  pattern: RegExp;
};

type EditIntentDetection = {
  intent: 'edit' | 'new' | 'unknown';
  editScore: number;
  newScore: number;
  matchedEditSignals: string[];
  matchedNewSignals: string[];
  hasExistingFiles: boolean;
};

const EDIT_INTENT_SIGNAL_PATTERNS: IntentSignalPattern[] = [
  { label: 'change', pattern: /\bchange\b/i },
  { label: 'update', pattern: /\bupdate\b/i },
  { label: 'fix', pattern: /\bfix\b/i },
  { label: 'make', pattern: /\bmake\b/i },
  { label: 'add', pattern: /\badd\b/i },
  { label: 'remove', pattern: /\bremove\b/i },
  { label: 'replace', pattern: /\breplace\b/i },
  { label: 'modify', pattern: /\bmodify\b/i },
  { label: 'adjust', pattern: /\badjust\b/i },
  { label: 'set', pattern: /\bset\b/i },
  { label: 'turn', pattern: /\bturn\b/i },
  { label: 'convert', pattern: /\bconvert\b/i },
  { label: 'rename', pattern: /\brename\b/i },
  { label: 'mach', pattern: /\bmach\b/i },
  { label: 'andere', pattern: /\b(?:ändere|aendere)\b/i },
  { label: 'fuege', pattern: /\b(?:füge|fuege)\b/i },
  { label: 'entferne', pattern: /\bentferne\b/i },
  { label: 'ersetze', pattern: /\bersetze\b/i },
  { label: 'setze', pattern: /\bsetze\b/i },
];

const NEW_INTENT_SIGNAL_PATTERNS: IntentSignalPattern[] = [
  { label: 'create', pattern: /\bcreate\b/i },
  { label: 'build', pattern: /\bbuild\b/i },
  { label: 'generate', pattern: /\bgenerate\b/i },
  { label: 'new_project', pattern: /\bnew\s+project\b/i },
  { label: 'from_scratch', pattern: /\bfrom\s+scratch\b/i },
  { label: 'erstelle_neu', pattern: /\berstelle\s+neu\b/i },
  { label: 'neues_projekt', pattern: /\bneues\s+projekt\b/i },
  { label: 'von_vorne', pattern: /\bvon\s+vorne\b/i },
];

const LARGE_REDESIGN_PROMPT_REGEX =
  /\b(redesign|rewrite|overhaul|revamp|rework|full\s+rebuild|complete\s+rebuild|from\s+scratch|new\s+project|komplett\s+neu|von\s+vorne|neu\s+aufbauen|neu\s+gestalten)\b/i;

const SMALL_EDIT_PROMPT_ACTION_REGEX =
  /\b(change|update|fix|make|add|remove|replace|modify|adjust|set|turn|convert|rename|mach|ändere|aendere|füge|fuege|entferne|ersetze|setze)\b/i;

type SelectMostRelevantEditFileInput = {
  prompt: string;
  contextFiles: Record<string, string>;
  ragSelectedPaths: string[];
  impactedFiles?: string[];
  editAnchorSourceId?: string;
};

function collectMatchedIntentSignals(prompt: string, patterns: IntentSignalPattern[]): string[] {
  const normalizedPrompt = String(prompt || '');
  return patterns
    .filter((entry) => entry.pattern.test(normalizedPrompt))
    .map((entry) => entry.label);
}

function detectEditIntent(prompt: string, existingFiles: Record<string, string> | undefined): EditIntentDetection {
  const hasExistingFiles = Boolean(existingFiles && Object.keys(existingFiles).length > 0);
  const matchedEditSignals = collectMatchedIntentSignals(prompt, EDIT_INTENT_SIGNAL_PATTERNS);
  const matchedNewSignals = collectMatchedIntentSignals(prompt, NEW_INTENT_SIGNAL_PATTERNS);
  const editScore = matchedEditSignals.length;
  const newScore = matchedNewSignals.length;

  let intent: EditIntentDetection['intent'] = 'unknown';
  if (hasExistingFiles) {
    if (newScore > editScore && newScore > 0) {
      intent = 'new';
    } else if (editScore > 0) {
      intent = 'edit';
    } else if (newScore > 0) {
      intent = 'new';
    }
  } else if (newScore > 0) {
    intent = 'new';
  }

  return {
    intent,
    editScore,
    newScore,
    matchedEditSignals,
    matchedNewSignals,
    hasExistingFiles,
  };
}

function isLikelyTargetableSourcePath(path: string): boolean {
  const normalized = normalizeGeneratedPath(path || '');
  if (!normalized.startsWith('src/')) return false;
  return /\.(tsx|ts|jsx|js|css|scss|sass|less)$/.test(normalized);
}

function computePromptPathKeywordBoost(promptLower: string, normalizedPath: string): number {
  const hints: Array<{ signal: RegExp; tokens: string[] }> = [
    { signal: /\bbutton|cta\b/i, tokens: ['button', 'cta'] },
    { signal: /\bnav|navbar|menu|header\b/i, tokens: ['nav', 'navbar', 'menu', 'header'] },
    { signal: /\bfooter\b/i, tokens: ['footer'] },
    { signal: /\bhero\b/i, tokens: ['hero'] },
    { signal: /\bform|input|field\b/i, tokens: ['form', 'input'] },
    { signal: /\bcard\b/i, tokens: ['card'] },
    { signal: /\bcolor|theme|style|blue|red|green|background\b/i, tokens: ['style', 'theme', 'color', '.css'] },
  ];

  let boost = 0;
  hints.forEach((hint) => {
    if (!hint.signal.test(promptLower)) return;
    if (hint.tokens.some((token) => normalizedPath.includes(token))) {
      boost += 180;
    }
  });
  return boost;
}

function selectMostRelevantEditFile(input: SelectMostRelevantEditFileInput): string | null {
  const contextEntries = Object.entries(input.contextFiles || {});
  if (contextEntries.length === 0) return null;
  const normalizedContextMap = new Map<string, string>();
  contextEntries.forEach(([path, content]) => {
    const normalized = normalizeGeneratedPath(path);
    if (!normalized) return;
    normalizedContextMap.set(normalized, content);
  });
  if (normalizedContextMap.size === 0) return null;

  const rankedPaths = (input.ragSelectedPaths || [])
    .map((path) => normalizeGeneratedPath(path))
    .filter(Boolean);
  const rankedIndex = new Map<string, number>();
  rankedPaths.forEach((path, index) => {
    if (!rankedIndex.has(path)) rankedIndex.set(path, index);
  });

  const impactedSet = new Set(
    (input.impactedFiles || [])
      .map((path) => normalizeGeneratedPath(path))
      .filter(Boolean)
  );
  const anchorPath = resolveSourceFileFromSourceId(String(input.editAnchorSourceId || ''));
  const normalizedAnchorPath = normalizeGeneratedPath(anchorPath || '');
  const promptLower = String(input.prompt || '').toLowerCase();

  const candidateSet = new Set<string>();
  if (normalizedAnchorPath) candidateSet.add(normalizedAnchorPath);
  impactedSet.forEach((path) => candidateSet.add(path));
  rankedPaths.forEach((path) => candidateSet.add(path));
  normalizedContextMap.forEach((_content, path) => candidateSet.add(path));

  let bestPath: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  candidateSet.forEach((candidate) => {
    if (!normalizedContextMap.has(candidate)) return;
    const rankingScore = rankedIndex.has(candidate)
      ? Math.max(0, 500 - (rankedIndex.get(candidate) || 0))
      : 0;
    const impactedScore = impactedSet.has(candidate) ? 1200 : 0;
    const anchorScore = normalizedAnchorPath && candidate === normalizedAnchorPath ? 1600 : 0;
    const sourcePathScore = isLikelyTargetableSourcePath(candidate) ? 120 : -220;
    const appPenalty = candidate === 'src/App.tsx' ? -80 : 0;
    const promptBoost = computePromptPathKeywordBoost(promptLower, candidate);
    const score = rankingScore + impactedScore + anchorScore + sourcePathScore + appPenalty + promptBoost;
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidate;
    }
  });

  if (bestPath) return bestPath;
  if (normalizedContextMap.has('src/App.tsx')) return 'src/App.tsx';
  return normalizedContextMap.keys().next().value || null;
}

function enforceTargetedEditBoundary(input: {
  candidateFiles: Record<string, string>;
  existingFiles: Record<string, string>;
  targetPath: string;
}): { files: Record<string, string>; revertedPaths: string[] } {
  const normalizedTargetPath = normalizeGeneratedPath(input.targetPath || '');
  if (!normalizedTargetPath) {
    return { files: input.candidateFiles, revertedPaths: [] };
  }

  const existingNormalized: Record<string, string> = {};
  Object.entries(input.existingFiles || {}).forEach(([path, content]) => {
    const normalized = normalizeGeneratedPath(path);
    if (!normalized || typeof content !== 'string') return;
    existingNormalized[normalized] = content;
  });

  const next: Record<string, string> = {};
  Object.entries(input.candidateFiles || {}).forEach(([path, content]) => {
    const normalized = normalizeGeneratedPath(path);
    if (!normalized || typeof content !== 'string') return;
    next[normalized] = content;
  });

  const reverted = new Set<string>();

  Object.keys(next).forEach((path) => {
    if (path === normalizedTargetPath) return;
    const existing = existingNormalized[path];
    if (typeof existing === 'string') {
      if (next[path] !== existing) {
        next[path] = existing;
        reverted.add(path);
      }
      return;
    }
    delete next[path];
    reverted.add(path);
  });

  Object.entries(existingNormalized).forEach(([path, content]) => {
    if (path === normalizedTargetPath) return;
    if (typeof next[path] !== 'string') {
      next[path] = content;
      reverted.add(path);
    }
  });

  return {
    files: next,
    revertedPaths: [...reverted].sort((a, b) => a.localeCompare(b)),
  };
}

function isLargeRedesignPrompt(prompt: string): boolean {
  return LARGE_REDESIGN_PROMPT_REGEX.test(String(prompt || ''));
}

function isSmallEditPrompt(prompt: string): boolean {
  const normalized = String(prompt || '');
  const wordCount = normalized
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount === 0 || wordCount > 60) return false;
  if (isLargeRedesignPrompt(normalized)) return false;
  return SMALL_EDIT_PROMPT_ACTION_REGEX.test(normalized);
}

const INDUSTRY_SIGNAL_PATTERNS: Record<DetectedIndustry, RegExp[]> = {
  restaurant: [/\b(restaurant|pizza|cafe|bistro|food|menu|delivery)\b/g],
  saas: [/\b(saas|platform|software|cloud|automation|b2b)\b/g],
  portfolio: [/\b(portfolio|agency|studio|showcase|creative)\b/g],
  ecommerce: [/\b(e-?commerce|shop|store|checkout|cart|product)\b/g],
  wedding: [/\b(wedding|marriage|ceremony|bride|groom)\b/g],
  photography: [/\b(photography|photographer|photos|shots|gallery)\b/g],
  fitness: [/\b(fitness|gym|workout|trainer|nutrition|health)\b/g],
  medical: [/\b(medical|clinic|doctor|healthcare|dental|patient)\b/g],
  realestate: [/\b(real estate|property|apartment|house|realtor)\b/g],
  music: [/\b(music|band|artist|concert|album|tour)\b/g],
  education: [/\b(education|course|learning|tutorial|academy|student)\b/g],
  legal: [/\b(legal|lawyer|attorney|law firm|case)\b/g],
  nonprofit: [/\b(nonprofit|charity|donation|fundraising|ngo)\b/g],
  startup: [/\b(startup|launch|waitlist|mvp|founder)\b/g],
};

function detectIndustrySignals(text: string): { industry: DetectedIndustry | null; score: number } {
  const normalized = String(text || '').toLowerCase();
  let bestIndustry: DetectedIndustry | null = null;
  let bestScore = 0;

  (Object.keys(INDUSTRY_SIGNAL_PATTERNS) as DetectedIndustry[]).forEach((industry) => {
    const patterns = INDUSTRY_SIGNAL_PATTERNS[industry] || [];
    const score = patterns.reduce((acc, pattern) => {
      const matches = normalized.match(pattern);
      return acc + (matches ? matches.length : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndustry = industry;
    }
  });

  return {
    industry: bestScore > 0 ? bestIndustry : null,
    score: bestScore,
  };
}

function detectExistingProjectIndustry(files: Record<string, string> | undefined): { industry: DetectedIndustry | null; score: number } {
  const entries = Object.entries(files || {});
  if (entries.length === 0) {
    return { industry: null, score: 0 };
  }

  const sampled = entries
    .slice(0, 28)
    .map(([path, content]) => `${path}\n${String(content || '').slice(0, 820)}`)
    .join('\n');

  return detectIndustrySignals(sampled);
}

function normalizeColorScheme(value: string): 'dark' | 'light' | 'colorful' {
  const lower = String(value || '').toLowerCase();
  if (/\b(light|white|clean|minimal|hell)\b/.test(lower)) return 'light';
  if (/\b(colorful|vibrant|bold|bunt)\b/.test(lower)) return 'colorful';
  return 'dark';
}

function extractFallbackProductName(prompt: string, hydratedContext: HydratedContext | null): string {
  const source = String(prompt || '').trim();
  const matches = [
    source.match(/(?:for|f(?:u|ue|\u00fc)r|named|called)\s+([a-z0-9][a-z0-9&\-\s]{2,40})/i),
    source.match(/([a-z0-9][a-z0-9&\-\s]{2,40})\s+(?:website|webseite|landing page|landing|shop|store|dashboard)/i),
  ];

  for (const match of matches) {
    const candidate = String(match?.[1] || '')
      .replace(/\b(website|webseite|landing|page|seite|app|shop|store|dashboard)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate.length >= 2) {
      return candidate
        .split(' ')
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
    }
  }

  const fromIntent = String(hydratedContext?.intent || '').trim().split(/\s+/).slice(0, 2).join(' ');
  if (fromIntent) {
    return fromIntent
      .split(' ')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  return 'Northstar Studio';
}

function buildFallbackTemplateContext(prompt: string, hydratedContext: HydratedContext | null): FallbackTemplateContext {
  const intent = String(hydratedContext?.intent || prompt).trim().replace(/\s+/g, ' ');
  return {
    productName: extractFallbackProductName(prompt, hydratedContext),
    industry: inferIndustryFromPrompt(`${prompt} ${hydratedContext?.intent || ''}`),
    colorScheme: normalizeColorScheme(hydratedContext?.colorScheme || prompt),
    intent: intent.length > 140 ? `${intent.slice(0, 137).trimEnd()}...` : intent,
  };
}

function personalizeFallbackFiles(
  files: Record<string, string>,
  context: FallbackTemplateContext
): Record<string, string> {
  const next: Record<string, string> = {};
  const replacements: Array<[RegExp, string]> = [
    [/\bAcme Cloud\b/g, context.productName],
    [/\bAcme\b/g, context.productName],
    [/\bNorthstar (Studio|Shop|Analytics|Journal)\b/g, context.productName],
    [/Build something amazing/gi, context.intent],
    [/Your subtitle goes here\. Keep it short and compelling\./gi, context.intent],
  ];

  Object.entries(files || {}).forEach(([path, content]) => {
    const normalizedPath = normalizeGeneratedPath(path || '');
    const isRuntimeText = /\.(tsx|ts|jsx|js|html)$/i.test(normalizedPath);
    let nextContent = String(content || '');
    if (isRuntimeText) {
      replacements.forEach(([pattern, value]) => {
        nextContent = nextContent.replace(pattern, value);
      });
      if (context.colorScheme === 'light') {
        nextContent = nextContent.replace(
          /bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900/g,
          'bg-gradient-to-br from-white via-slate-100 to-purple-100'
        );
      } else if (context.colorScheme === 'colorful') {
        nextContent = nextContent.replace(
          /bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900/g,
          'bg-gradient-to-br from-fuchsia-950 via-purple-900 to-indigo-950'
        );
      }
    }
    next[path] = nextContent;
  });

  return next;
}

const STYLE_ANCHOR_REGEX = /\b(?:bg|text|border|from|to|via|shadow|rounded|font)-[a-z0-9:/%.[\]-]+|--[a-z0-9-]+|linear-gradient|radial-gradient|backdrop-blur|transition-[a-z-]+|animate-[a-z-]+/gi;

function extractStyleAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  if (!content || typeof content !== 'string') return anchors;
  const matches = content.match(STYLE_ANCHOR_REGEX) || [];
  matches.forEach((token) => anchors.add(token.toLowerCase()));
  return anchors;
}

function countStyleAnchorDelta(beforeContent: string, afterContent: string): number {
  const before = extractStyleAnchors(beforeContent);
  const after = extractStyleAnchors(afterContent);
  let delta = 0;
  after.forEach((token) => {
    if (!before.has(token)) delta += 1;
  });
  before.forEach((token) => {
    if (!after.has(token)) delta += 1;
  });
  return delta;
}

function computeStyleAnchorDelta(
  previousFiles: Record<string, string>,
  nextFiles: Record<string, string>,
  changedPaths: string[]
): number {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return 0;
  return changedPaths.reduce((sum, path) => {
    const normalized = normalizeGeneratedPath(path);
    const beforeContent = previousFiles[normalized] || previousFiles[path] || '';
    const afterContent = nextFiles[normalized] || nextFiles[path] || '';
    if (typeof beforeContent !== 'string' || typeof afterContent !== 'string') return sum;
    return sum + countStyleAnchorDelta(beforeContent, afterContent);
  }, 0);
}



function truncateForPrompt(input: string, maxLength: number): string {
  if (!input || input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}\n/* truncated */`;
}


function classifyValidationErrors(errors: string[]): ValidationErrorBreakdown {
  const byType = {
    import: 0,
    icon: 0,
    syntax: 0,
    type: 0,
    runtime: 0,
    other: 0,
  };

  for (const rawError of errors) {
    const error = rawError.toLowerCase();
    if (
      /does not provide an export|cannot find module|module .* has no exported member|failed to resolve module specifier/.test(error)
    ) {
      byType.import += 1;
      continue;
    }
    if (/lucide-react|icon|cupsoda|helpcircle|sparkles|trash2|circlealert/.test(error)) {
      byType.icon += 1;
      continue;
    }
    if (/declaration expected|unexpected token|unterminated|parsing error|syntaxerror/.test(error)) {
      byType.syntax += 1;
      continue;
    }
    if (/cannot find name|type .* is not assignable|duplicate identifier|cannot redeclare|property .* does not exist/.test(error)) {
      byType.type += 1;
      continue;
    }
    if (/referenceerror|is not defined|cannot read properties of undefined|runtime/.test(error)) {
      byType.runtime += 1;
      continue;
    }
    byType.other += 1;
  }

  const entries = Object.entries(byType) as Array<[keyof typeof byType, number]>;
  const dominant = entries.reduce<[keyof typeof byType | null, number]>(
    (acc, entry) => (entry[1] > acc[1] ? [entry[0], entry[1]] : acc),
    [null, 0]
  );

  return {
    total: errors.length,
    byType,
    dominantType: (dominant[0] || 'none') as ValidationErrorBreakdown['dominantType'],
  };
}

const SHADCN_STUB_EXPORTS = [
  'Button',
  'Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter',
  'Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose',
  'Input', 'Textarea', 'Label', 'Select', 'SelectTrigger', 'SelectContent', 'SelectItem', 'SelectValue',
  'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent',
  'Badge', 'Avatar', 'AvatarImage', 'AvatarFallback',
  'Separator', 'Switch', 'Checkbox', 'RadioGroup', 'RadioGroupItem',
  'Tooltip', 'TooltipTrigger', 'TooltipContent', 'TooltipProvider',
  'Popover', 'PopoverTrigger', 'PopoverContent',
  'Sheet', 'SheetTrigger', 'SheetContent', 'SheetHeader', 'SheetTitle', 'SheetDescription', 'SheetFooter', 'SheetClose',
  'Table', 'TableHeader', 'TableBody', 'TableFooter', 'TableHead', 'TableRow', 'TableCell', 'TableCaption',
  'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent',
  'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuSeparator',
  'Alert', 'AlertTitle', 'AlertDescription',
  'Progress', 'Skeleton', 'ScrollArea',
  'cn',
];

function normalizeValidationErrorText(error: string): string {
  return String(error || '').trim().toLowerCase();
}

function isShadcnMissingModuleError(error: string): boolean {
  return /cannot find module ['"]@\/components\/ui\//i.test(String(error || ''));
}

function isHardBlockingValidationError(error: string): boolean {
  const text = normalizeValidationErrorText(error);
  if (!text) return false;
  if (
    /declaration expected|unexpected token|unterminated|parsing error|syntaxerror|expression expected|identifier expected|expected .* but found/i.test(text)
  ) {
    return true;
  }
  if (
    /no valid jsx|keinen ausführbaren code|no executable code|expected a react module|invalid html document output|full html document/i.test(text)
  ) {
    return true;
  }
  return false;
}

function isBundlingFailureMessage(message: string): boolean {
  const text = normalizeValidationErrorText(message);
  if (!text) return false;
  return (
    text.includes('bundle warning:') ||
    text.includes('esbuild error') ||
    text.includes('bundling error') ||
    text.includes('build failed')
  );
}

function didBundlingCompletelyFail(errors: string[], warnings: string[]): boolean {
  return [...errors, ...warnings].some((message) => isBundlingFailureMessage(message));
}

function partitionValidationErrorsForStability(errors: string[]): {
  blocking: string[];
  warnings: string[];
} {
  const blocking: string[] = [];
  const warnings: string[] = [];

  for (const error of errors) {
    if (!String(error || '').trim()) continue;
    if (isHardBlockingValidationError(error)) {
      blocking.push(error);
      continue;
    }

    // TypeScript/import/runtime mismatches are warning-only for generation stability.
    warnings.push(error);
  }

  return { blocking, warnings };
}

function extractMissingShadcnSpecifiers(errors: string[]): string[] {
  const specifiers = new Set<string>();
  const regex = /cannot find module ['"]([^'"]+)['"]/ig;

  errors.forEach((error) => {
    const source = String(error || '');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const specifier = String(match[1] || '').trim();
      if (specifier.startsWith('@/components/ui/')) {
        specifiers.add(specifier);
      }
    }
  });

  return Array.from(specifiers);
}

function toPascalCaseStable(value: string): string {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'UiComponent';
}

function buildShadcnAutoStub(specifier: string): string {
  const moduleName = specifier.split('/').pop() || 'component';
  const primaryExport = toPascalCaseStable(moduleName);
  const exports = Array.from(new Set([primaryExport, ...SHADCN_STUB_EXPORTS]));
  const lines: string[] = [
    `export default function Stub() { return null; }`,
    `const __stub = () => null;`,
  ];
  exports.forEach((name) => {
    if (name === 'cn') {
      lines.push(`export const cn = (...parts: Array<string | undefined | null | false>) => parts.filter(Boolean).join(' ');`);
      return;
    }
    lines.push(`export const [${name}] = [__stub];`);
  });
  return `${lines.join('\n')}\n`;
}

function applyShadcnAutoStubsFromValidationErrors(
  files: Record<string, string>,
  errors: string[]
): { files: Record<string, string>; addedPaths: string[] } {
  const next = { ...files };
  const addedPaths: string[] = [];

  const specifiers = extractMissingShadcnSpecifiers(errors);
  specifiers.forEach((specifier) => {
    const normalizedPath = normalizeGeneratedPath(`src/${specifier.slice(2)}.tsx`);
    if (!normalizedPath) return;
    if (typeof next[normalizedPath] === 'string' && next[normalizedPath].trim().length > 0) return;
    next[normalizedPath] = buildShadcnAutoStub(specifier);
    addedPaths.push(normalizedPath);
  });

  return {
    files: next,
    addedPaths,
  };
}

function hasValidAppEntryPointFromCode(code: string): boolean {
  const normalized = String(code || '').trim();
  if (!normalized) return false;
  if (looksLikeHtmlDocument(normalized)) return false;
  return hasDefaultExport(normalized);
}

function hasValidGeneratedEntryPoint(input: {
  validationTargetPath: string;
  codeToProcess: string;
  normalizedGeneratedCode: string;
  orchestrationFiles: Array<{ path: string; content: string }>;
  contextualFiles?: Record<string, string>;
}): boolean {
  const appFromFiles = (input.orchestrationFiles || []).find((file) => {
    const normalized = normalizeGeneratedPath(file.path || '');
    return normalized === 'src/App.tsx';
  })?.content;

  if (hasValidAppEntryPointFromCode(String(appFromFiles || ''))) return true;
  const appFromContext = input.contextualFiles?.['src/App.tsx'] || input.contextualFiles?.['App.tsx'] || '';
  if (hasValidAppEntryPointFromCode(String(appFromContext || ''))) return true;
  if (normalizeGeneratedPath(input.validationTargetPath || '') === 'src/App.tsx') {
    if (hasValidAppEntryPointFromCode(input.codeToProcess)) return true;
    if (hasValidAppEntryPointFromCode(input.normalizedGeneratedCode)) return true;
  }
  return false;
}

function hasValidAssembledEntryPoint(fileMap: Record<string, string>, fallbackCode: string): boolean {
  const appCode = fileMap['src/App.tsx'] || fileMap['App.tsx'] || '';
  if (hasValidAppEntryPointFromCode(appCode)) return true;
  return hasValidAppEntryPointFromCode(fallbackCode);
}

function shouldRollbackForValidationOutcome(
  breakdown: ValidationErrorBreakdown,
  noValidEntryPoint: boolean,
  bundlingFailed: boolean
): boolean {
  const criticalErrors = breakdown.byType.syntax;
  return criticalErrors > 3 && noValidEntryPoint && bundlingFailed;
}

function isMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code || '').trim();
  if (code === 'PGRST205' || code === '42P01') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || (message.includes('relation') && message.includes('not found'));
}

async function getRecentEdits(projectId: string, limit = 5): Promise<EditHistoryEntry[]> {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) return [];
  const readLimit = Math.max(1, Math.min(20, Math.floor(limit || 5)));
  const client = supabaseAdmin || supabase;

  try {
    const { data, error } = await client
      .from('edit_history')
      .select('instruction, edit_type, files_changed, created_at')
      .eq('project_id', safeProjectId)
      .order('created_at', { ascending: false })
      .limit(readLimit);

    if (error) {
      if (isMissingTableError(error)) return [];
      console.warn('[EditHistory] Failed to fetch recent edits:', error.message || error);
      return [];
    }

    return (data || []).map((row: any) => ({
      instruction: String(row?.instruction || '').trim(),
      editType: String(row?.edit_type || '').trim(),
      filesChanged: Array.isArray(row?.files_changed)
        ? row.files_changed.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : [],
      createdAt: typeof row?.created_at === 'string' ? row.created_at : undefined,
    }));
  } catch (error: any) {
    console.warn('[EditHistory] Unexpected fetch error:', error?.message || error);
    return [];
  }
}

type EditValidationOutcome = {
  files: Record<string, string>;
  revertedPaths: string[];
  retriedPaths: string[];
  retryFailedPaths: string[];
};

async function getBlockingValidationErrorCount(content: string, path: string): Promise<number> {
  const source = String(content || '');
  if (!source.trim()) return 1;
  const targetPath = normalizeGeneratedPath(path || '') || path || 'src/App.tsx';
  if (!/\.(tsx|ts|jsx|js)$/.test(targetPath)) return 0;

  try {
    const result = await codeProcessor.process(source, targetPath, {
      validate: true,
      bundle: false,
    });
    const partitioned = partitionValidationErrorsForStability(result.errors || []);
    return partitioned.blocking.length;
  } catch {
    return 1;
  }
}

async function validateAndRepairEditedFiles(input: {
  candidateFiles: Record<string, string>;
  baselineFiles: Record<string, string>;
  changedPaths: string[];
  editInstruction: string;
  provider: SupportedProvider;
  systemPrompt: string;
  maxTokens: number;
  userProviderApiKeys: UserApiKeyMap;
  image?: string;
  screenshotBase64?: string;
  screenshotMimeType?: string;
  knowledgeBase?: Array<{ path: string; content: string }>;
}): Promise<EditValidationOutcome> {
  const candidateFiles = { ...(input.candidateFiles || {}) };
  const baselineFiles = input.baselineFiles || {};
  const runtimePaths = Array.from(
    new Set(
      (input.changedPaths || [])
        .map((entry) => normalizeGeneratedPath(entry))
        .filter((entry) => Boolean(entry && /\.(tsx|ts|jsx|js)$/.test(entry)))
    )
  );

  if (runtimePaths.length === 0) {
    return {
      files: candidateFiles,
      revertedPaths: [],
      retriedPaths: [],
      retryFailedPaths: [],
    };
  }

  const revertedPaths: string[] = [];
  for (const path of runtimePaths) {
    const nextContent = candidateFiles[path];
    if (typeof nextContent !== 'string') continue;
    const baselineContent = typeof baselineFiles[path] === 'string' ? baselineFiles[path] : '';
    const baselineBlocking = await getBlockingValidationErrorCount(baselineContent, path);
    const nextBlocking = await getBlockingValidationErrorCount(nextContent, path);
    if (nextBlocking > baselineBlocking) {
      if (typeof baselineFiles[path] === 'string') {
        candidateFiles[path] = baselineFiles[path];
      } else {
        delete candidateFiles[path];
      }
      revertedPaths.push(path);
    }
  }

  if (revertedPaths.length === 0) {
    return {
      files: candidateFiles,
      revertedPaths,
      retriedPaths: [],
      retryFailedPaths: [],
    };
  }

  const retryFailedPaths = [...revertedPaths];
  const retriedPaths: string[] = [];
  const strictContextFiles: Record<string, string> = {};
  revertedPaths.forEach((path) => {
    if (typeof baselineFiles[path] === 'string') {
      strictContextFiles[path] = baselineFiles[path];
    }
  });

  if (Object.keys(strictContextFiles).length === 0) {
    return {
      files: candidateFiles,
      revertedPaths,
      retriedPaths,
      retryFailedPaths,
    };
  }

  const strictPrompt = `EDIT INSTRUCTION:
${input.editInstruction}

STRICT FILE-LEVEL RETRY:
- Retry only these files:
${revertedPaths.map((path) => `  - ${path}`).join('\n')}
- Preserve all existing imports and logic.
- Return complete file content for changed files only.
- Do not touch any other file.`;

  const strictSystemPrompt = `${String(input.systemPrompt || '').trim()}

STRICT RETRY GUARD:
- You are repairing a previous edit that introduced validation issues.
- Keep all previously working behavior intact.
- Make the smallest possible change that satisfies the instruction.
- Return complete file content, not snippets.`;

  try {
    const retryResult = await withTimeout(
      llmManager.generate({
        provider: input.provider,
        generationMode: 'edit',
        prompt: strictPrompt,
        systemPrompt: strictSystemPrompt,
        temperature: 0.2,
        maxTokens: Math.max(900, Math.min(input.maxTokens || 1800, 2200)),
        stream: false,
        currentFiles: strictContextFiles,
        image: input.image,
        screenshotBase64: input.screenshotBase64,
        screenshotMimeType: input.screenshotMimeType,
        knowledgeBase: input.knowledgeBase,
        providerApiKeys: input.userProviderApiKeys,
      }),
      Math.min(TIMEOUT_MS, 45000)
    );

    const retryRaw = typeof retryResult === 'string'
      ? retryResult
      : String((retryResult as any)?.content || '');
    if (retryRaw.trim().length === 0) {
      return { files: candidateFiles, revertedPaths, retriedPaths, retryFailedPaths };
    }

    const parsedRetry = parseLLMOutputWithDebugLogs(retryRaw, revertedPaths[0], strictContextFiles);
    const parsedByPath: Record<string, string> = {};
    (parsedRetry.extractedFiles || []).forEach((file) => {
      const normalizedPath = normalizeGeneratedPath(file.path || '');
      if (!normalizedPath) return;
      parsedByPath[normalizedPath] = String(file.content || '');
    });

    if (
      revertedPaths.length === 1 &&
      Object.keys(parsedByPath).length === 0 &&
      String(parsedRetry.primaryCode || '').trim().length > 0
    ) {
      parsedByPath[revertedPaths[0]] = String(parsedRetry.primaryCode || '');
    }

    for (const path of revertedPaths) {
      const candidate = parsedByPath[path];
      if (typeof candidate !== 'string' || candidate.trim().length === 0) continue;
      const baselineContent = typeof baselineFiles[path] === 'string' ? baselineFiles[path] : '';
      const baselineBlocking = await getBlockingValidationErrorCount(baselineContent, path);
      const retryBlocking = await getBlockingValidationErrorCount(candidate, path);
      if (retryBlocking <= baselineBlocking) {
        candidateFiles[path] = candidate;
        retriedPaths.push(path);
      }
    }
  } catch (error: any) {
    console.warn('[EditValidation] Strict retry failed:', error?.message || error);
  }

  const retriedSet = new Set(retriedPaths);
  return {
    files: candidateFiles,
    revertedPaths,
    retriedPaths,
    retryFailedPaths: retryFailedPaths.filter((path) => !retriedSet.has(path)),
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /api/generate
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

type SupabaseIntegrationContext = {
  connected?: boolean;
  environment?: 'test' | 'live' | null;
  projectRef?: string | null;
  projectUrl?: string | null;
  hasTestConnection?: boolean;
  hasLiveConnection?: boolean;
};

type GitHubIntegrationContext = {
  connected?: boolean;
  username?: string | null;
  repoUrl?: string | null;
  lastSync?: string | null;
};

type RequestIntegrations = {
  supabase?: SupabaseIntegrationContext | null;
  github?: GitHubIntegrationContext | null;
};

interface GenerateRequest {
  provider: SupportedProvider;
  prompt: string;
  mode?: 'generate' | 'repair' | 'visual-edit';
  errorContext?: string;
  generationMode?: 'new' | 'edit';
  templateId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  validate?: boolean;
  bundle?: boolean;
  files?: Record<string, string>;
  image?: string; // Base64 encoded image
  screenshotBase64?: string;
  screenshotMimeType?: string;
  knowledgeBase?: Array<{ path: string, content: string }>; // Context files
  featureFlags?: Partial<FeatureFlags>;
  userId?: string;
  projectId?: string;
  integrations?: RequestIntegrations;
  targetElement?: {
    tagName?: string;
    className?: string;
    textContent?: string;
  };
  editInstruction?: string;
  editAnchor?: {
    nodeId?: string;
    tagName?: string;
    className?: string;
    id?: string;
    innerText?: string;
    selector?: string;
    domPath?: string;
    sectionId?: string;
    routePath?: string;
    href?: string;
    role?: string;
    sourceId?: string;
  };
}

interface ProcessedFile {
  path: string;
  content: string;
  type: string;
  size?: number;
}

type EditOutcomeStatus =
  | 'applied'
  | 'noop'
  | 'blocked_scope'
  | 'rolled_back_validation'
  | 'rolled_back_final_validation'
  | 'rolled_back_quality';

interface GenerateResponse {
  success: boolean;
  code?: string;
  files?: ProcessedFile[];
  dependencies?: Record<string, string>;
  components?: string[];
  errors?: string[];
  warnings?: string[];
  provider: string;
  timestamp: string;
  duration: number;
  processingTime?: number;
  noOp?: {
    detected: boolean;
    reason: string;
  };
  repairStatus?: 'skipped' | 'succeeded' | 'failed';
  repairError?: string;
  pipelinePath?: PipelinePath;
  latencyMs?: number;
  routing?: {
    pipeline: PipelinePath;
    latencyMs: number;
  };
  metadata?: {
    hydratedContext?: HydratedContext | null;
  };
  supabaseSchema?: string;
  databaseTables?: string[];
  rateLimit?: {
    remaining?: number;
    limit?: number;
    reset?: number;
    provider?: string;
  };
  pipeline?: {
    mode: 'template+plan+assemble';
    path?: PipelinePath;
    latencyMs?: number;
    generationMode?: 'new' | 'edit';
    templateId?: string;
    selectedBlocks?: string[];
    plan?: {
      projectType: string;
      features: string[];
      pages: string[];
      repairs: string[];
      dependencyExpansion: string[];
      valid: boolean;
      warnings: string[];
      errors: string[];
    };
    sectionDiff?: {
      mode: 'full-project' | 'section-isolated';
      structuralChange: boolean;
      targetedCategories: string[];
      semantic: {
        intent: string;
        scope: string;
        intensity: string;
        confidence: number;
        touchesStructure: boolean;
        reasons: string[];
      };
      added: string[];
      removed: string[];
      unchanged: string[];
      allowAppUpdate: boolean;
      allowedUpdatePaths: string[];
      validationTargetPath?: string;
    };
    operations?: {
      total: number;
      applied: number;
      unresolved: number;
      unresolvedPreview?: Array<{
        index: number;
        path?: string;
        reason: string;
      }>;
    };
    smartDiff?: {
      added: string[];
      removed: string[];
      updated: string[];
      unchangedCount: number;
      changedCount: number;
      changeRatio: number;
      structuralChange: boolean;
      contentOnlyChange: boolean;
      configChange: boolean;
      styleIntentDetected?: boolean;
      styleAnchorDelta?: number;
      styleRecoveryApplied?: boolean;
    };
    snapshot?: {
      currentId: string;
      previousId?: string;
      createdAt: string;
      projectId?: string;
      fileCount: number;
    };
    validation?: ValidationErrorBreakdown;
    rollback?: {
      applied: boolean;
      reason?: string;
      source: 'none' | 'context-files' | 'snapshot';
      snapshotId?: string;
    };
    editOutcome?: {
      status: EditOutcomeStatus;
      message: string;
      blockedFileCount?: number;
    };
    tokenBudget?: {
      provider: string;
      requestedMaxTokens?: number;
      generationMaxTokens: number;
      repairMaxTokens: number;
      repairAttempts: number;
      reason: string;
    };
    autoRepair?: AutoRepairSummary;
    qualityGate?: {
      pass: boolean;
      overall: number;
      visualScore: number;
      accessibilityScore: number;
      performanceScore: number;
      criticalCount: number;
      warningCount: number;
      findings: Array<{
        id: string;
        severity: 'critical' | 'warning' | 'info';
        message: string;
        suggestion: string;
      }>;
    };
    qualitySummary?: QualitySummary;
    deterministicActions?: string[];
    contentPolish?: {
      domain: string;
      changes: string[];
    };
    designGenome?: {
      similarityToRecent: number;
      avoidTraits: string[];
      directive: string;
    };
    promptUnderstanding?: {
      source: 'ai' | 'fallback';
      confidence: number;
      scope: 'section' | 'global';
      editScope: RagEditScope;
      styleRequest: boolean;
      targetedCategories: string[];
      impactedFiles: string[];
      forbiddenFiles: string[];
      forceAppUpdate: boolean;
      reasoning: string;
    };
    contextInjection?: {
      selectedPaths: string[];
      skippedPaths: string[];
      truncatedPaths: string[];
      totalChars: number;
    };
    visualAnchor?: {
      provided: boolean;
      nodeId?: string;
      selector?: string;
      domPath?: string;
      routePath?: string;
      sectionId?: string;
      sourceId?: string;
    };
    timingsMs?: Record<string, number>;
    plannedCreate: number;
    plannedUpdate: number;
    templateFiles: number;
    llmContextFiles: number;
    integrations?: {
      supabase: {
        backendIntentDetected: boolean;
        connected: boolean;
        environment: 'test' | 'live' | null;
        projectRef: string | null;
        projectUrl?: string | null;
        hasTestConnection: boolean;
        hasLiveConnection: boolean;
      };
    };
  };
}

type VisualApplyOperation =
  | {
    op: 'replace_text';
    file?: string;
    selector: string;
    sourceId?: string;
    text: string;
  }
  | {
    op: 'add_class' | 'remove_class';
    file?: string;
    selector: string;
    sourceId?: string;
    classes: string[];
  }
  | {
    op: 'set_prop';
    file?: string;
    selector: string;
    sourceId?: string;
    prop: string;
    value: string;
  }
  | {
    op: 'remove_prop';
    file?: string;
    selector: string;
    sourceId?: string;
    prop: string;
  };

router.post('/generate', validateRequest(generateSchema), async (req, res) => {
  const startTime = Date.now();
  const stageTimings: Record<string, number> = {};

  try {
    const activeFeatureFlags = getRequestFeatureFlags(req.body.featureFlags);
    if (req.body.files && Object.keys(req.body.files).length > 0) {
      editTelemetry.record('edit_attempt', { projectId: req.body.projectId });
    }
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 1. VALIDATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    const requestBody = req.body as GenerateRequest;
    const {
      provider,
      prompt,
      mode,
      errorContext,
      templateId,
      systemPrompt,
      temperature,
      maxTokens,
      validate = true,
      bundle = true,
      files,
      image,
      screenshotBase64,
      screenshotMimeType,
      knowledgeBase,
      userId,
      integrations,
      targetElement,
      editInstruction,
      editAnchor,
    } = requestBody;

    if (!isSupportedProvider(provider)) {
      return res.status(400).json({
        success: false,
        error: provider ? 'Invalid provider. Must be "gemini", "groq", "openai" or "nvidia"' : 'Missing required field: provider',
        code: provider ? 'INVALID_PROVIDER' : 'MISSING_PROVIDER',
        provider: provider || 'unknown',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
        code: 'MISSING_PROMPT',
        provider,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }

    const authReq = req as AuthenticatedRequest;
    const effectiveUserId = String(authReq.authUser?.id || userId || '').trim();
    const creditGate = await checkAndDeductCredits(effectiveUserId);
    if (!creditGate.allowed) {
      return res.status(402).json({
        error: 'NO_CREDITS',
        message: 'No credits remaining',
        plan: creditGate.plan || 'free',
        resetsAt: creditGate.resetsAt || null,
      });
    }

    let userProviderApiKeys: UserApiKeyMap = {};
    if (effectiveUserId) {
      try {
        userProviderApiKeys = await getUserProviderApiKeys(effectiveUserId);
      } catch (apiKeyLoadError: any) {
        console.warn('[Generate] Failed to load user API keys:', apiKeyLoadError?.message || apiKeyLoadError);
      }
    }

    let executionProviderHint = llmManager.getExecutionProviderHint(provider, userProviderApiKeys);
    const normalizedScreenshotBase64 = typeof screenshotBase64 === 'string' ? screenshotBase64.trim() : '';
    const screenshotMimeFromImage = parseImageDataUrl(image)?.mimeType || '';
    const normalizedScreenshotMimeType = typeof screenshotMimeType === 'string' && /^image\/[a-zA-Z0-9.+-]+$/.test(screenshotMimeType.trim())
      ? screenshotMimeType.trim()
      : (screenshotMimeFromImage || 'image/png');
    const hasScreenshotInput = normalizedScreenshotBase64.length > 0;
    const screenshotImageDataUrl = hasScreenshotInput
      ? `data:${normalizedScreenshotMimeType};base64,${normalizedScreenshotBase64}`
      : '';
    const effectiveImagePayload = hasScreenshotInput
      ? (image || screenshotImageDataUrl)
      : image;

    const requestMode: 'generate' | 'repair' | 'visual-edit' =
      mode === 'repair'
        ? 'repair'
        : mode === 'visual-edit'
          ? 'visual-edit'
          : 'generate';
    const normalizedErrorContext = typeof errorContext === 'string' ? errorContext.trim() : '';
    const hasEditableFiles = Boolean(files && Object.keys(files).length > 0);
    const requestedGenerationMode = requestBody.generationMode === 'new' || requestBody.generationMode === 'edit'
      ? requestBody.generationMode
      : null;
    const intentDetection = detectEditIntent(prompt, files);
    if (requestMode === 'repair' && !hasEditableFiles) {
      return res.status(400).json({
        success: false,
        error: 'Repair mode requires current project files.',
        code: 'REPAIR_FILES_REQUIRED',
        provider,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });
    }
    if (requestMode === 'visual-edit' && !hasEditableFiles) {
      return res.status(400).json({
        success: false,
        error: 'Visual edit mode requires current project files.',
        code: 'VISUAL_EDIT_FILES_REQUIRED',
        provider,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });
    }

    const promptSignals = detectIndustrySignals(prompt);
    const existingSignals = detectExistingProjectIndustry(files);
    const hasIndustryMismatch =
      Boolean(promptSignals.industry) &&
      Boolean(existingSignals.industry) &&
      promptSignals.industry !== existingSignals.industry;
    const forceNewIntentDetected = intentDetection.intent === 'new';
    const forceNewProject =
      requestMode === 'generate' &&
      hasEditableFiles &&
      (
        forceNewIntentDetected ||
        (FORCE_NEW_PROJECT_PROMPT_REGEX.test(prompt) && hasIndustryMismatch)
      );

    if (forceNewProject) {
      console.log(
        `[ModeSwitch] Forced generationMode=new (intent=${intentDetection.intent}; existing=${existingSignals.industry || 'n/a'} -> prompt=${promptSignals.industry || 'n/a'}).`
      );
    }

    const effectiveGenerationMode: 'new' | 'edit' = (() => {
      if (requestMode === 'repair') return 'edit';
      if (requestMode === 'visual-edit') return 'edit';
      if (requestedGenerationMode === 'new') return 'new';
      if (requestedGenerationMode === 'edit') return hasEditableFiles ? 'edit' : 'new';
      if (!hasEditableFiles) return 'new';
      if (forceNewProject) return 'new';
      if (intentDetection.intent === 'edit') return 'edit';
      if (intentDetection.intent === 'new') return 'new';
      return 'edit';
    })();
    console.log(
      `[IntentDetection] requested=${requestedGenerationMode || 'auto'} detected=${intentDetection.intent} ` +
      `editScore=${intentDetection.editScore} newScore=${intentDetection.newScore} ` +
      `editSignals=${intentDetection.matchedEditSignals.join('|') || 'none'} ` +
      `newSignals=${intentDetection.matchedNewSignals.join('|') || 'none'}`
    );
    const hasVisualAnchorInput = Boolean(
      editAnchor &&
      Object.values(editAnchor).some((value) => typeof value === 'string' && value.trim().length > 0)
    );
    const visualAnchorPrompt = effectiveGenerationMode === 'edit' ? buildVisualAnchorPrompt(editAnchor) : '';
    const visualEditPromptBlock = requestMode === 'visual-edit'
      ? buildVisualEditModePromptBlock({
        targetElement,
        editInstruction,
      })
      : '';
    const repairContextSuffix = requestMode === 'repair'
      ? `\n\nREPAIR_REQUEST:
- mode: repair
- errorContext: ${normalizedErrorContext || 'unknown runtime/build error'}
- Task: Fix runtime/build issues with minimal changes and keep the existing design/content.`
      : '';
    const promptForPlanningBase = `${prompt}${repairContextSuffix}`;
    const promptForPlanningWithAnchor = visualAnchorPrompt
      ? `${promptForPlanningBase}\n\n${visualAnchorPrompt}`
      : promptForPlanningBase;
    const promptForPlanning = visualEditPromptBlock
      ? `${promptForPlanningWithAnchor}\n\n${visualEditPromptBlock}`
      : promptForPlanningWithAnchor;
    const supabaseIntegration = integrations?.supabase || null;
    const authUserId = (() => {
      const authReq = req as AuthenticatedRequest;
      const fromAuth = typeof authReq.authUser?.id === 'string' ? authReq.authUser.id.trim() : '';
      if (fromAuth) return fromAuth;
      return typeof requestBody.userId === 'string' ? requestBody.userId.trim() : '';
    })();
    let githubIntegration: GitHubIntegrationContext | null = integrations?.github || null;
    if (authUserId && requestBody.projectId) {
      try {
        const githubStatus = await getGitHubConnectionStatus(authUserId, requestBody.projectId);
        githubIntegration = {
          connected: githubStatus.connected,
          username: githubStatus.username || null,
          repoUrl: githubStatus.repoUrl || null,
          lastSync: githubStatus.lastSync || null,
        };
      } catch (githubStatusError: any) {
        console.warn(`[GitHub Sync] Failed to resolve project GitHub status: ${githubStatusError?.message || 'unknown error'}`);
      }
    }
    const githubConnected = Boolean(githubIntegration?.connected);
    const backendIntentDetected = detectBackendIntent(promptForPlanning);
    const supabaseIntegrationContextPrompt = buildSupabaseIntegrationPrompt(supabaseIntegration, backendIntentDetected);
    const integrationWarnings: string[] = [];
    if (backendIntentDetected && !supabaseIntegration?.connected) {
      integrationWarnings.push(
        'Backend/fullstack intent erkannt, aber Supabase ist nicht verbunden. Es wurde nur connection-ready Scaffold-Code erzeugt.'
      );
    }

    const contextualFiles = effectiveGenerationMode === 'edit' && files ? files : {};
    const editInstructionForContext = String(editInstruction || prompt || '').trim();
    const detectedEditType: EditInstructionType | null = effectiveGenerationMode === 'edit'
      ? classifyEdit(editInstructionForContext)
      : null;
    const projectContextSnapshot: ProjectContextSnapshot | null = effectiveGenerationMode === 'edit'
      ? await buildProjectContext(
        String(requestBody.projectId || '').trim(),
        contextualFiles,
        editInstructionForContext
      )
      : null;
    const recentEditHistory: EditHistoryEntry[] = effectiveGenerationMode === 'edit'
      ? await getRecentEdits(String(requestBody.projectId || '').trim(), 5)
      : [];
    const editTypePromptBlock = effectiveGenerationMode === 'edit' && detectedEditType
      ? buildEditTypePrompt(detectedEditType)
      : '';
    const existingProjectContextBlock = effectiveGenerationMode === 'edit'
      ? buildExistingProjectContextBlock({
        projectContext: projectContextSnapshot,
        instruction: editInstructionForContext || prompt,
        editType: detectedEditType,
        recentEdits: recentEditHistory,
      })
      : '';
    const projectContextSnapshotPrompt = effectiveGenerationMode === 'edit'
      ? buildProjectContextSnapshotPrompt(projectContextSnapshot)
      : '';

    // -------------------------------------------------------------------------
    // Start Prompt Understanding Early (Parallel)
    // -------------------------------------------------------------------------
    const promptUnderstandingStartedAt = Date.now();
    const promptUnderstandingPromise = inferPromptUnderstandingWithAI({
      provider: executionProviderHint,
      generationMode: effectiveGenerationMode,
      prompt: promptForPlanning,
      currentFiles: contextualFiles,
      requestedMaxTokens: maxTokens,
    });

    const normalizedTemplateId = typeof templateId === 'string' ? templateId : undefined;
    const resolvedProjectPlan = createResolvedProjectPlan({
      prompt: promptForPlanning,
      templateId: normalizedTemplateId,
      existingFiles: contextualFiles,
      generationMode: effectiveGenerationMode,
      projectId: requestBody.projectId || undefined,
    });
    const domainPack = resolveDomainPacks({
      prompt: promptForPlanning,
      features: resolvedProjectPlan.finalPlan.features,
      projectType: resolvedProjectPlan.finalPlan.projectType,
    });
    if (!resolvedProjectPlan.validation.valid) {
      return res.status(422).json({
        success: false,
        error: 'Project plan validation failed after repair cycles.',
        code: 'PLAN_VALIDATION_FAILED',
        provider,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        plan: {
          errors: resolvedProjectPlan.validation.errors,
          warnings: resolvedProjectPlan.validation.warnings,
          repairs: resolvedProjectPlan.repairLog,
        },
      });
    }
    const composedTemplate = composeTemplateProject({
      templateId: resolvedProjectPlan.finalPlan.templateId || normalizedTemplateId,
      prompt: promptForPlanning,
      forceBlockIds: resolvedProjectPlan.resolvedBlockIds,
      projectName: resolvedProjectPlan.finalPlan.brand,
      planContextPrompt: resolvedProjectPlan.planContextPrompt,
      pagePaths: resolvedProjectPlan.finalPlan.pages.map((page) => page.path),
    });
    const templateFiles = effectiveGenerationMode === 'new'
      ? { ...getBaseTemplateFiles(), ...composedTemplate.files }
      : { ...getBaseTemplateFiles() };
    const seededFiles = effectiveGenerationMode === 'new'
      ? { ...composedTemplate.files, ...contextualFiles }
      : { ...contextualFiles };
    const filePlan = createFilePlan({
      prompt: promptForPlanning,
      currentFiles: seededFiles,
      requiredFiles: resolvedProjectPlan.requiredFiles,
    });
    const templatePlannedFiles = effectiveGenerationMode === 'new' ? Object.keys(composedTemplate.files) : [];
    const plannedFileContract = sanitizePlannedFileContract([
      ...new Set([...filePlan.create, ...filePlan.update, ...templatePlannedFiles]),
    ]);
    const plannedFiles = plannedFileContract.validPaths;

    const promptUnderstanding = await promptUnderstandingPromise;
    executionProviderHint = llmManager.getExecutionProviderHint(provider, userProviderApiKeys);
    stageTimings.promptUnderstanding = Date.now() - promptUnderstandingStartedAt;
    const aiHint: PromptIntentHint = {
      targetedCategories: promptUnderstanding.targetedCategories,
      scope: promptUnderstanding.scope,
      forceAppUpdate: promptUnderstanding.forceAppUpdate,
      confidence: promptUnderstanding.confidence,
      reasoning: promptUnderstanding.reasoning,
      impactedFiles: promptUnderstanding.impactedFiles,
      forbiddenFiles: promptUnderstanding.forbiddenFiles,
      editScope: promptUnderstanding.editScope,
    };
    const sectionPlan = createSectionRegenerationPlan({
      generationMode: effectiveGenerationMode,
      prompt: promptForPlanning,
      existingFiles: contextualFiles,
      resolvedBlockIds: resolvedProjectPlan.resolvedBlockIds,
      aiHint,
    });
    const llmContextFiles = filterFilesForLLMContext(contextualFiles);
    const sectionScopedContextFiles = filterFilesForSectionContext(llmContextFiles, sectionPlan);
    const ragContextResult = buildRagLightContext({
      files: sectionScopedContextFiles,
      impactedFiles: promptUnderstanding.impactedFiles,
      allowedUpdatePaths: sectionPlan.allowedUpdatePaths,
      editScope: promptUnderstanding.editScope,
      maxChars: sectionPlan.semantic.intensity === 'high' ? 42000 : 26000,
    });
    const selectedEditTargetPath = effectiveGenerationMode === 'edit'
      ? selectMostRelevantEditFile({
        prompt: promptForPlanning,
        contextFiles: contextualFiles,
        ragSelectedPaths: ragContextResult.selectedPaths,
        impactedFiles: promptUnderstanding.impactedFiles,
        editAnchorSourceId: editAnchor?.sourceId,
      })
      : null;
    const scopedContextFiles = (() => {
      if (effectiveGenerationMode !== 'edit' || !selectedEditTargetPath) {
        return ragContextResult.contextFiles;
      }
      const normalizedTargetPath = normalizeGeneratedPath(selectedEditTargetPath);
      const targetContent =
        contextualFiles[normalizedTargetPath] ??
        ragContextResult.contextFiles[normalizedTargetPath];
      if (typeof targetContent !== 'string' || targetContent.trim().length === 0) {
        return ragContextResult.contextFiles;
      }
      return { [normalizedTargetPath]: targetContent };
    })();
    const genomeSeedFiles = effectiveGenerationMode === 'edit' && Object.keys(contextualFiles).length > 0
      ? contextualFiles
      : composedTemplate.files;
    const genomeCandidate = extractDesignGenomeFromFiles(genomeSeedFiles);
    const diversityAdvice = getDesignDiversityAdvice(requestBody.projectId, genomeCandidate);
    const editQualityContext = `${resolvedProjectPlan.planContextPrompt}\n\n${composedTemplate.compositionPrompt}`;
    const diversityContext = `\n\nDesign diversity guidance:\n${diversityAdvice.directive}`;
    const integrationContextSuffix = supabaseIntegrationContextPrompt
      ? `\n\n${supabaseIntegrationContextPrompt}`
      : '';
    const contractAllowedPaths = (effectiveGenerationMode === 'edit' && selectedEditTargetPath)
      ? [normalizeGeneratedPath(selectedEditTargetPath)]
      : Array.from(new Set([
        ...sectionPlan.allowedUpdatePaths.map(normalizeGeneratedPath),
        ...ragContextResult.selectedPaths.map(normalizeGeneratedPath),
      ])).slice(0, 60);
    const contractReadOnlyFiles = Array.from(new Set([
      ...Array.from(EDIT_MODE_READ_ONLY_FILES),
      ...(promptUnderstanding.forbiddenFiles || []).map(normalizeGeneratedPath),
    ])).slice(0, 80);
    const contractContextSuffix = `\n\nGeneration contracts:
- editScope: ${promptUnderstanding.editScope}
- allowedWritePaths:
${contractAllowedPaths.length > 0 ? contractAllowedPaths.map((path) => `  - ${path}`).join('\n') : '  - src/App.tsx'}
- readOnlyFiles:
${contractReadOnlyFiles.map((path) => `  - ${path}`).join('\n')}
- Never modify readOnlyFiles.
- In edit mode, apply minimal diffs only to allowedWritePaths.
- If a change would require writing readOnlyFiles, return an alternative within allowed files.`;
    const domainPackSuffix = domainPack.instruction
      ? `\n\nDomain constraints:\n${domainPack.instruction}`
      : '';
    const complexRouteProfile = classifyComplexPromptRoute({
      generationMode: effectiveGenerationMode,
      prompt: promptForPlanning,
      semantic: {
        intent: sectionPlan.semantic.intent,
        intensity: sectionPlan.semantic.intensity,
        touchesStructure: sectionPlan.semantic.touchesStructure,
      },
      projectType: resolvedProjectPlan.finalPlan.projectType,
      pageCount: resolvedProjectPlan.finalPlan.pages.length,
      features: resolvedProjectPlan.finalPlan.features,
      domainPackIds: domainPack.packIds,
      backendIntentDetected,
      plannedCreates: filePlan.create.length,
      plannedUpdates: filePlan.update.length,
    });
    const complexRouteSuffix = complexRouteProfile.enabled
      ? `\n\n${buildComplexRouteDirective({
        profile: complexRouteProfile,
        filePlan,
        sectionPlan,
      })}`
      : '';
    const promptForGeneration = effectiveGenerationMode === 'new'
      ? `${promptForPlanning}\n\n${resolvedProjectPlan.planContextPrompt}\n\n${composedTemplate.compositionPrompt}${domainPackSuffix}${diversityContext}${integrationContextSuffix}${contractContextSuffix}${sectionPlan.instructionSuffix}${complexRouteSuffix}`
      : `${promptForPlanning}\n\n${buildEditModeContextPrompt(
        contextualFiles,
        resolvedProjectPlan.finalPlan.brand,
        resolvedProjectPlan.finalPlan.language
      )}\n\n${editQualityContext}${domainPackSuffix}${diversityContext}${integrationContextSuffix}${contractContextSuffix}${sectionPlan.instructionSuffix}${complexRouteSuffix}${projectContextSnapshotPrompt ? `\n\n${projectContextSnapshotPrompt}` : ''}`;
    const classifiedPipelinePath = hasScreenshotInput
      ? 'deep'
      : classifyRequest(prompt, contextualFiles);

    const tokenBudget = createTokenBudget({
      provider: executionProviderHint,
      requestedMaxTokens: maxTokens,
      generationMode: effectiveGenerationMode,
      pipelinePath: classifiedPipelinePath,
      prompt: promptForPlanning,
      semantic: {
        intent: sectionPlan.semantic.intent,
        intensity: sectionPlan.semantic.intensity,
        touchesStructure: sectionPlan.semantic.touchesStructure,
      },
    });
    console.log(
      `ðŸŽ¯ Token budget: gen=${tokenBudget.generationMaxTokens} repair=${tokenBudget.repairMaxTokens} ` +
      `attempts=${tokenBudget.repairAttempts} (${tokenBudget.reason})`
    );
    const lowTokenMode = tokenBudget.generationMaxTokens <= 800;
    const generationPrompt = truncateForPrompt(
      promptForGeneration,
      lowTokenMode ? 5000 : complexRouteProfile.promptLimit
    );
    const screenshotSystemPromptAddon = buildScreenshotSystemPromptAddon(hasScreenshotInput);
    const editSystemPromptAddon = effectiveGenerationMode === 'edit'
      ? [existingProjectContextBlock, editTypePromptBlock].filter(Boolean).join('\n\n')
      : '';
    const generationSystemPrompt = truncateForPrompt(
      `${ensureStackConstraintInSystemPrompt(systemPrompt || '')}${screenshotSystemPromptAddon ? `\n\n${screenshotSystemPromptAddon}` : ''}${editSystemPromptAddon ? `\n\n${editSystemPromptAddon}` : ''}`,
      lowTokenMode ? 7000 : complexRouteProfile.systemLimit
    );

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 2. LLM GENERATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log(`ðŸ¤– Generating code with ${executionProviderHint} (requested: ${provider})...`);
    console.log(`ðŸ“ Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`ðŸ§± Template preset: ${composedTemplate.preset.id} (${composedTemplate.selectedBlocks.length} blocks)`);
    console.log(`ðŸ—ºï¸ Resolved plan: ${resolvedProjectPlan.finalPlan.projectType} | pages=${resolvedProjectPlan.finalPlan.pages.length} | features=${resolvedProjectPlan.finalPlan.features.join(', ') || 'none'}`);
    if (domainPack.packIds.length > 0) {
      console.log(`ðŸ§© Domain packs: ${domainPack.packIds.join(', ')}`);
    }
    if (resolvedProjectPlan.repairLog.length > 0) {
      console.log(`ðŸ› ï¸ Plan repairs: ${resolvedProjectPlan.repairLog.join(' | ')}`);
    }
    console.log(`ðŸ§¬ Section mode: ${sectionPlan.mode} | structural=${sectionPlan.diff.structuralChange} | intent=${sectionPlan.semantic.intent} | scoped updates=${sectionPlan.allowedUpdatePaths.length}`);
    console.log(`ðŸ§  Prompt understanding: source=${promptUnderstanding.source} scope=${promptUnderstanding.scope} forceApp=${promptUnderstanding.forceAppUpdate} categories=${promptUnderstanding.targetedCategories.join(',') || 'none'} conf=${promptUnderstanding.confidence.toFixed(2)}`);
    console.log(`ðŸ“š Context injector: selected=${ragContextResult.selectedPaths.length} skipped=${ragContextResult.skippedPaths.length} chars=${ragContextResult.totalChars}`);
    console.log(`ðŸ§­ Generation mode: ${effectiveGenerationMode}`);
    if (complexRouteProfile.enabled) {
      console.log(`ðŸ§ª Complex route: ${complexRouteProfile.reason}`);
    }
    if (effectiveGenerationMode === 'edit' && Object.keys(contextualFiles).length > 0) {
      console.log(`ðŸ“‚ Context: ${Object.keys(contextualFiles).length} files provided for iterative editing`);
      console.log(`ðŸ§  LLM context after filtering: ${Object.keys(scopedContextFiles).length} files`);
      if (selectedEditTargetPath) {
        console.log(`[EditTarget] Selected most relevant file: ${selectedEditTargetPath}`);
      }
    }
    console.log(`ðŸ§© File plan ready: +${filePlan.create.length} create, ~${filePlan.update.length} update`);

    // LLMManager will automatically use Enhanced System Prompt if systemPrompt is undefined
    // This includes CRITICAL NO-ROUTER and ICON LIBRARY rules + Intent Enhancement

    let rawCode: string = '';
    let requestRateLimit: { remaining?: number; limit?: number; reset?: number; provider?: string } | undefined;
    let orchestrationFiles: Array<{ path: string; content: string }> = [];
    let orchestrationCritique: OrchestratorCritiqueSnapshot | null = null;
    const llmGenerationStartedAt = Date.now();

    // -------------------------------------------------------------------------
    // Enterprise / Intelligence Layer Discovery
    // -------------------------------------------------------------------------

    // 1. Feature Flags (env/request) + internal routing policy
    const baseFeatureFlags = activeFeatureFlags;

    const hasHighComplexityPromptSignal = /kanban|trello|drag-and-drop|drag and drop|dijkstra|pathfinding|inventory|invoice|split-bill|split bill|calculator|dashboard|chart|crypto|router|multi[-\s]?page|backend|api|supabase|fullstack|auth/.test(
      promptForPlanning.toLowerCase()
    );
    const shouldAutoElevatePipeline =
      (effectiveGenerationMode === 'edit' && (
        sectionPlan.semantic.intent === 'feature-addition' ||
        sectionPlan.semantic.intent === 'layout-change' ||
        sectionPlan.semantic.touchesStructure ||
        sectionPlan.semantic.intensity === 'high'
      )) ||
      (effectiveGenerationMode === 'new' && (
        complexRouteProfile.enabled ||
        sectionPlan.semantic.touchesStructure ||
        sectionPlan.semantic.intensity === 'high' ||
        hasHighComplexityPromptSignal
      ));

    const shouldRunHeavyPostProcessing =
      effectiveGenerationMode === 'edit' &&
      sectionPlan.semantic.intent === 'layout-change' &&
      sectionPlan.semantic.intensity === 'high';

    const requestPhase3Flags = (req.body as any)?.featureFlags?.phase3 || {};
    const requestPhase1Flags = (req.body as any)?.featureFlags?.phase1 || {};
    const hasExplicitIntentAgentFlag = typeof requestPhase3Flags.intentAgent === 'boolean';
    const hasExplicitPromptConditioningFlag = typeof requestPhase3Flags.dynamicPromptConditioning === 'boolean';
    const hasExplicitSpecPassFlag = typeof requestPhase1Flags.specPass === 'boolean';
    const hasExplicitArchitecturePassFlag = typeof requestPhase1Flags.architecturePass === 'boolean';
    const hasExplicitSelfCritiqueFlag = typeof requestPhase1Flags.selfCritique === 'boolean';
    const hasExplicitRepairLoopFlag = typeof requestPhase1Flags.repairLoop === 'boolean';
    const autoEnablePhase3 = shouldAutoElevatePipeline;
    const autoEnablePhase1 = shouldAutoElevatePipeline || complexRouteProfile.forcePhase1;

    const effectiveFeatureFlags = {
      ...baseFeatureFlags,
      phase1: {
        ...baseFeatureFlags.phase1,
        specPass: hasExplicitSpecPassFlag
          ? baseFeatureFlags.phase1.specPass
          : (baseFeatureFlags.phase1.specPass || autoEnablePhase1),
        architecturePass: hasExplicitArchitecturePassFlag
          ? baseFeatureFlags.phase1.architecturePass
          : (baseFeatureFlags.phase1.architecturePass || autoEnablePhase1),
        selfCritique: hasExplicitSelfCritiqueFlag
          ? baseFeatureFlags.phase1.selfCritique
          : (baseFeatureFlags.phase1.selfCritique || autoEnablePhase1),
        repairLoop: hasExplicitRepairLoopFlag
          ? baseFeatureFlags.phase1.repairLoop
          : (baseFeatureFlags.phase1.repairLoop || autoEnablePhase1),
      },
      phase2: {
        ...baseFeatureFlags.phase2,
        astRewrite: baseFeatureFlags.phase2.astRewrite || shouldRunHeavyPostProcessing,
        qualityScoring: baseFeatureFlags.phase2.qualityScoring || shouldRunHeavyPostProcessing,
        multiFileGeneration: baseFeatureFlags.phase2.multiFileGeneration || shouldRunHeavyPostProcessing || complexRouteProfile.forceMultiFile,
      },
      phase3: {
        ...baseFeatureFlags.phase3,
        intentAgent: hasExplicitIntentAgentFlag
          ? baseFeatureFlags.phase3.intentAgent
          : autoEnablePhase3,
        dependencyIntelligence: baseFeatureFlags.phase3.dependencyIntelligence || complexRouteProfile.forceDependencyAnalysis,
        dynamicPromptConditioning: hasExplicitPromptConditioningFlag
          ? baseFeatureFlags.phase3.dynamicPromptConditioning
          : (baseFeatureFlags.phase3.dynamicPromptConditioning || autoEnablePhase3),
      },
    };

    const multiAgentEnabled = process.env.FEATURE_MULTI_AGENT === 'true';
    const useMultiAgent =
      multiAgentEnabled &&
      effectiveGenerationMode === 'edit' &&
      sectionPlan.semantic.intent === 'layout-change' &&
      sectionPlan.semantic.intensity === 'high' &&
      sectionPlan.semantic.touchesStructure;

    const usePhase1 = effectiveFeatureFlags.phase1.specPass ||
      effectiveFeatureFlags.phase1.architecturePass ||
      effectiveFeatureFlags.phase1.selfCritique ||
      effectiveFeatureFlags.phase1.repairLoop;
    const usePhase2 = effectiveFeatureFlags.phase2.astRewrite ||
      effectiveFeatureFlags.phase2.qualityScoring ||
      effectiveFeatureFlags.phase2.multiFileGeneration;
    const usePhase3 = effectiveFeatureFlags.phase3.intentAgent ||
      effectiveFeatureFlags.phase3.dynamicPromptConditioning ||
      effectiveFeatureFlags.phase3.dependencyIntelligence ||
      effectiveFeatureFlags.phase3.styleDNA ||
      effectiveFeatureFlags.phase3.componentMemory;
    const useNodeGraphRouter = !useMultiAgent;
    let hydratedContextForResponse: HydratedContext | null = null;
    let supabaseSchemaForResponse = '';
    let databaseTablesForResponse: string[] = [];
    let routedPipelinePath: PipelinePath = useNodeGraphRouter ? classifiedPipelinePath : 'deep';
    if (hasScreenshotInput) {
      routedPipelinePath = 'deep';
      hydratedContextForResponse = null;
      console.log('[ScreenshotMode] Screenshot provided -> skipping hydration and forcing DEEP pipeline');
    } else if (useNodeGraphRouter && routedPipelinePath === 'fast') {
      try {
        hydratedContextForResponse = await hydratePrompt(promptForPlanning, contextualFiles);
        if (hydratedContextForResponse.complexity === 'complex') {
          routedPipelinePath = 'deep';
          console.log('[Hydration] override: complexity=complex -> forcing DEEP pipeline');
        }
      } catch (hydrationError: any) {
        console.warn(`[Hydration] Pre-routing hydration failed: ${hydrationError?.message || 'unknown error'}`);
      }
    }

    console.log(
      `ðŸ§­ Pipeline routing: mode=${effectiveGenerationMode} ` +
      `intent=${sectionPlan.semantic.intent}/${sectionPlan.semantic.intensity} ` +
      `phase1=${usePhase1} phase2=${usePhase2} phase3=${usePhase3} ` +
      `nodeGraph=${useNodeGraphRouter} classified=${classifiedPipelinePath} selected=${routedPipelinePath} ` +
      `hydrationComplexity=${hydratedContextForResponse?.complexity || 'n/a'} ` +
      `multiAgent=${useMultiAgent} autoElevate=${shouldAutoElevatePipeline}`
    );

    // -------------------------------------------------------------------------
    // NodeGraph Request Router (fast vs deep)
    if (useNodeGraphRouter) {
      const isFastPath = routedPipelinePath === 'fast';
      console.log(`ðŸ§  Using ${isFastPath ? 'FAST' : 'DEEP'} node-graph pipeline...`);
      const orchestratorTimeoutMs = isFastPath
        ? 8000
        : (complexRouteProfile.enabled ? 180000 : 120000);
      const orchestratorAbortController = new AbortController();
      try {
        const { runNodeGraph, createDefaultNodes, createFastPathNodes } = await import('../ai/node-graph-executor.js');
        const selectedNodes = isFastPath ? createFastPathNodes() : createDefaultNodes();
        const orchestrationResult = await withTimeout(
          runNodeGraph(selectedNodes, {
            provider: executionProviderHint,
            generationMode: effectiveGenerationMode,
            requestMode,
            prompt: generationPrompt,
            systemPrompt: generationSystemPrompt,
            temperature: temperature || 0.7,
            maxTokens: tokenBudget.generationMaxTokens,
            currentFiles: scopedContextFiles,
            image: effectiveImagePayload,
            screenshotBase64: normalizedScreenshotBase64 || undefined,
            screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
            knowledgeBase,
            featureFlags: effectiveFeatureFlags,
            signal: orchestratorAbortController.signal,
            hydratedContext: hydratedContextForResponse,
            supabaseIntegration,
            githubIntegration,
            projectContext: projectContextSnapshot,
            editType: detectedEditType || undefined,
            recentEdits: recentEditHistory,
            editInstruction: editInstructionForContext,
            visualEditContext: requestMode === 'visual-edit'
              ? {
                targetElement: {
                  tagName: String(targetElement?.tagName || '').trim(),
                  className: String(targetElement?.className || '').trim(),
                  textContent: String(targetElement?.textContent || '').trim(),
                },
                editInstruction: String(editInstruction || '').trim(),
              }
              : undefined,
          }),
          orchestratorTimeoutMs,
          () => orchestratorAbortController.abort()
        );

        rawCode = orchestrationResult.code;
        orchestrationFiles = orchestrationResult.files || [];
        requestRateLimit = orchestrationResult.rateLimit || requestRateLimit;
        hydratedContextForResponse = (orchestrationResult as any)?.metadata?.hydratedContext || hydratedContextForResponse;
        const orchestrationSupabaseSchema = String((orchestrationResult as any)?.metadata?.supabaseSchema || '').trim();
        if (orchestrationSupabaseSchema) {
          supabaseSchemaForResponse = orchestrationSupabaseSchema;
        }
        const orchestrationDatabaseTables = normalizeDatabaseTables((orchestrationResult as any)?.metadata?.databaseTables);
        if (orchestrationDatabaseTables.length > 0) {
          databaseTablesForResponse = orchestrationDatabaseTables;
        }
        const nodeGraphQuality = (orchestrationResult as any)?.metadata?.qualityScore;
        if (nodeGraphQuality && typeof nodeGraphQuality.overall === 'number') {
          const mappedIssues = Array.isArray(nodeGraphQuality.recommendations)
            ? nodeGraphQuality.recommendations.map((recommendation: any) => ({
              severity: recommendation?.priority === 'high'
                ? 'critical'
                : recommendation?.priority === 'medium'
                  ? 'major'
                  : 'minor',
            }))
            : [];
          orchestrationCritique = {
            score: nodeGraphQuality.overall,
            needsRepair: nodeGraphQuality.overall < 70,
            issues: mappedIssues,
          };
        } else {
          orchestrationCritique = null;
        }
        console.log(`âœ… ${isFastPath ? 'FAST' : 'DEEP'} node-graph pipeline completed`);
        stageTimings.llmGeneration = Date.now() - llmGenerationStartedAt;
      } catch (orchestratorError: any) {
        console.error(`âŒ ${routedPipelinePath.toUpperCase()} node-graph pipeline failed:`, orchestratorError);
        const isOrchestratorTimeout = Boolean(
          orchestratorError?.message &&
          String(orchestratorError.message).toLowerCase().includes('timeout')
        );
        let resolvedViaDeterministicFallback = false;
        if (isOrchestratorTimeout) {
          console.warn(`Orchestrator timeout after ${orchestratorTimeoutMs / 1000}s. Falling back to standard generation...`);
          const timeoutFallbackContext = buildFallbackTemplateContext(prompt, hydratedContextForResponse);
          const deterministicTimeoutFallback = applyDeterministicDomainFallback({
            packIds: domainPack.packIds,
            files: scopedContextFiles,
            generationMode: effectiveGenerationMode,
            report: {
              issues: [],
              hasCriticalIssues: false,
            },
            forcePacks: effectiveGenerationMode === 'new' ? domainPack.packIds : [],
          });
          if (effectiveGenerationMode === 'new' && deterministicTimeoutFallback.applied.length > 0) {
            console.warn(`[Orchestrator] Timeout fallback resolved via deterministic domain packs: ${deterministicTimeoutFallback.applied.join(', ')}`);
            const personalizedTimeoutFallbackFiles = personalizeFallbackFiles(
              deterministicTimeoutFallback.files,
              timeoutFallbackContext
            );
            const fallbackEntries = Object.entries(personalizedTimeoutFallbackFiles);
            rawCode =
              personalizedTimeoutFallbackFiles['src/App.tsx'] ||
              fallbackEntries.find(([path]) => /\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(path)))?.[1] ||
              '';
            orchestrationFiles = fallbackEntries.map(([path, content]) => ({
              path,
              content,
            }));
            stageTimings.llmGeneration = Date.now() - llmGenerationStartedAt;
            resolvedViaDeterministicFallback = true;
          }
        } else {
          console.log('ðŸ”„ Falling back to standard generation...');
        }
        if (!resolvedViaDeterministicFallback) {
          const result = await withTimeout(
            llmManager.generate({
              provider: executionProviderHint,
              generationMode: effectiveGenerationMode,
              prompt: generationPrompt,
              systemPrompt: generationSystemPrompt,
              temperature: temperature || 0.7,
              maxTokens: tokenBudget.generationMaxTokens,
              stream: false,
              currentFiles: scopedContextFiles,
              image: effectiveImagePayload,
              screenshotBase64: normalizedScreenshotBase64 || undefined,
              screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
              knowledgeBase,
              providerApiKeys: userProviderApiKeys,
            }),
            TIMEOUT_MS
          );
          rawCode = typeof result === 'string'
            ? result
            : (result as any)?.content || '';
          requestRateLimit = (result as any).rateLimit;
          stageTimings.llmGeneration = Date.now() - llmGenerationStartedAt;
        }
      }
    } else if (useMultiAgent) {
      console.log('ðŸš€ Using Enterprise Multi-Agent System...');
      try {
        const { multiAgentManager } = await import('./llm/multi-agent-manager.js');
        const { selfCorrectionManager } = await import('./llm/self-correction-manager.js');

        // 1. Initial Generation (with timeout)
        try {
          rawCode = await withTimeout(
            multiAgentManager.generate({
              provider: executionProviderHint,
              generationMode: effectiveGenerationMode,
              prompt: generationPrompt,
              systemPrompt: generationSystemPrompt,
              temperature: temperature || 0.7,
              maxTokens: tokenBudget.generationMaxTokens,
              stream: false,
              currentFiles: scopedContextFiles,
              image,
              knowledgeBase,
              providerApiKeys: userProviderApiKeys,
            }),
            TIMEOUT_MS
          );
        } catch (genError: any) {
          console.error('âŒ Multi-Agent generation failed:', genError);
          if (genError.message?.includes('timeout')) {
            throw new Error(`Generation timeout: Request took longer than ${TIMEOUT_MS / 1000}s`);
          }
          throw new Error(`Multi-Agent generation failed: ${genError.message || 'Unknown error'}`);
        }

        // 2. Validate Initial Code
        const parsedInitial = parseLLMOutputWithDebugLogs(rawCode, 'src/App.tsx', scopedContextFiles);
        if (parsedInitial.parseError) {
          throw new Error('MALFORMED_STRUCTURED_OUTPUT: multi-agent returned malformed files/operations JSON');
        }
        let initialValidation;
        try {
          initialValidation = await codeProcessor.process(parsedInitial.primaryCode, 'App.tsx', { validate: true, bundle: true });
        } catch (validationError: any) {
          console.error('âŒ Initial validation failed:', validationError);
          initialValidation = { errors: [], warnings: [] };
        }

        if (initialValidation.errors.length > 0) {
          console.log(`âš ï¸ Initial generation had ${initialValidation.errors.length} errors. Triggering Self-Correction...`);
          try {
            const correctionResult = await withTimeout(
              selfCorrectionManager.attemptFix(
                parsedInitial.primaryCode,
                initialValidation.errors,
                {
                  provider: executionProviderHint,
                  generationMode: effectiveGenerationMode,
                  prompt: generationPrompt,
                  systemPrompt: generationSystemPrompt,
                  temperature,
                  maxTokens: tokenBudget.repairMaxTokens,
                  stream: false,
                  currentFiles: scopedContextFiles
                },
                "Project Context: (Injected via Manager)"
              ),
              TIMEOUT_MS / 2
            );

            if (correctionResult.success) {
              console.log('âœ… Self-Correction resolved the issues!');
              rawCode = correctionResult.code;
            } else {
              console.warn('âŒ Self-Correction failed to resolve all issues. Returning best effort.');
              rawCode = correctionResult.code;
            }
          } catch (correctionError: any) {
            console.error('âŒ Self-Correction threw error:', correctionError);
            console.warn('âš ï¸ Using original code despite correction failure');
          }
        }
      } catch (multiAgentError: any) {
        console.error('âŒ Multi-Agent system error:', multiAgentError);
        console.log('ðŸ”„ Falling back to standard generation...');
        const result = await withTimeout(
          llmManager.generate({
            provider: executionProviderHint,
            generationMode: effectiveGenerationMode,
            prompt: generationPrompt,
            systemPrompt: generationSystemPrompt,
            temperature: temperature || 0.7,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image: effectiveImagePayload,
            screenshotBase64: normalizedScreenshotBase64 || undefined,
            screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
            knowledgeBase,
            providerApiKeys: userProviderApiKeys,
          }),
          TIMEOUT_MS
        );

        if (typeof result === 'object' && 'content' in result && !('getReader' in result)) {
          rawCode = (result as any).content;
          requestRateLimit = (result as any).rateLimit;
        } else {
          throw new Error('LLM returned unexpected response format');
        }
      }
    } else {
      // Standard generation (no Phase 1 or Multi-Agent)
      const result = await withTimeout(
        llmManager.generate({
          provider: executionProviderHint,
          generationMode: effectiveGenerationMode,
          prompt: generationPrompt,
          systemPrompt: generationSystemPrompt,
          temperature: temperature || 0.7,
          maxTokens: tokenBudget.generationMaxTokens,
          stream: false,
          currentFiles: scopedContextFiles,
          image: effectiveImagePayload,
          screenshotBase64: normalizedScreenshotBase64 || undefined,
          screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
          knowledgeBase,
          providerApiKeys: userProviderApiKeys,
        }),
        TIMEOUT_MS
      );

      if (typeof result === 'object' && 'content' in result && !('getReader' in result)) {
        rawCode = (result as any).content;
        requestRateLimit = (result as any).rateLimit;
      } else {
        console.error('âŒ Unexpected LLM response format:', result);
        throw new Error('LLM returned unexpected response format (Stream or Unknown)');
      }
    }

    if (typeof stageTimings.llmGeneration !== 'number') {
      stageTimings.llmGeneration = Date.now() - llmGenerationStartedAt;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 3. CODE PROCESSING & VALIDATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log(`ðŸ”§ Processing generated code...`);

    let parsedOutput = parseLLMOutputWithDebugLogs(rawCode, 'src/App.tsx', scopedContextFiles);
    const enforceStructuredMultiFile = effectiveGenerationMode === 'new' && (
      complexRouteProfile.forceMultiFile ||
      domainPack.packIds.length > 0 ||
      resolvedProjectPlan.requiredFiles.length >= 6 ||
      sectionPlan.semantic.touchesStructure ||
      /checkout|cart|konfigurator|configurator|modal|sidebar|localstorage|framer\s*motion|confetti|wizard|step/i.test(promptForPlanning)
    );
    const structuredPreferredPaths = Array.from(new Set([
      'src/App.tsx',
      ...resolvedProjectPlan.requiredFiles.map((path) => normalizeGeneratedPath(path)),
    ]));
    const structuredOutputFormats = new Set(['json', 'operations']);
    const hasOrchestratedFiles = Array.isArray(orchestrationFiles) && orchestrationFiles.length > 0;
    const requiresEditStructuredOutput = effectiveGenerationMode === 'edit';
    const requiresStructuredOutput = !hasOrchestratedFiles && (
      complexRouteProfile.enabled ||
      enforceStructuredMultiFile ||
      (
        requiresEditStructuredOutput &&
        promptUnderstanding.editScope === 'refactor'
      )
    );
    const hasValidStructuredOutput = structuredOutputFormats.has(parsedOutput.detectedFormat);
    const hasRuntimeModulePayload = Boolean(
      (typeof parsedOutput.primaryCode === 'string' && parsedOutput.primaryCode.trim().length > 0) ||
      parsedOutput.extractedFiles.some((file) => /\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(file.path))) ||
      (parsedOutput.astPatches && parsedOutput.astPatches.length > 0)
    );
    const missingRuntimePayloadInNew = !hasOrchestratedFiles && effectiveGenerationMode === 'new' && !hasRuntimeModulePayload;
    const needsStructuredRetry = !hasOrchestratedFiles && (Boolean(parsedOutput.parseError)
      || (requiresStructuredOutput && !hasValidStructuredOutput)
      || missingRuntimePayloadInNew);
    if (needsStructuredRetry) {
      const retryResult = await executeStructuredRetryLoop({
        rawCode,
        parsedOutput,
        executionProviderHint,
        effectiveGenerationMode,
        tokenBudget,
        scopedContextFiles,
        image,
        knowledgeBase,
        requiresEditStructuredOutput,
        generationSystemPrompt,
        generationPrompt,
        enforceStructuredMultiFile,
        structuredPreferredPaths,
        requestRateLimit,
        structuredOutputFormats,
        parseOutputWithLogsFunc: parseLLMOutputWithDebugLogs,
      });
      rawCode = retryResult.rawCode;
      parsedOutput = retryResult.parsedOutput;
      requestRateLimit = retryResult.requestRateLimit || requestRateLimit;

      const finalStructuredOk = structuredOutputFormats.has(parsedOutput.detectedFormat);
      const finalHasRuntimeModulePayload = Boolean(
        (typeof parsedOutput.primaryCode === 'string' && parsedOutput.primaryCode.trim().length > 0) ||
        parsedOutput.extractedFiles.some((file) => /\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(file.path))) ||
        (parsedOutput.astPatches && parsedOutput.astPatches.length > 0)
      );
      const finalMissingRuntimeInNew = effectiveGenerationMode === 'new' && !finalHasRuntimeModulePayload;
      const finalStructuredInvalid = (requiresStructuredOutput && !finalStructuredOk) || finalMissingRuntimeInNew;
      if (parsedOutput.parseError || finalStructuredInvalid) {
        const coercedFinal = coerceToStructuredFilesFallback({
          parsedOutput,
          generationMode: effectiveGenerationMode,
          fallbackPath: 'src/App.tsx',
          existingFiles: scopedContextFiles,
          rawOutput: rawCode,
          allowSingleFileWrap: !enforceStructuredMultiFile,
          preferredPaths: structuredPreferredPaths,
        });
        if (coercedFinal) {
          parsedOutput = coercedFinal.parsedOutput;
          console.warn(`[Parser] Final structured fallback recovery applied via ${coercedFinal.reason}.`);
        } else {
          if (effectiveGenerationMode === 'new') {
            const rescueResult = await attemptTsxRescue({
              executionProviderHint,
              effectiveGenerationMode,
              tokenBudget,
              scopedContextFiles,
              image,
              knowledgeBase,
              generationSystemPrompt,
              generationPrompt,
              enforceStructuredMultiFile,
              structuredPreferredPaths,
              requestRateLimit,
              parseOutputWithLogsFunc: parseLLMOutputWithDebugLogs,
            });
            if (rescueResult.success) {
              parsedOutput = rescueResult.parsedOutput;
              rawCode = rescueResult.rawCode;
              requestRateLimit = rescueResult.requestRateLimit || requestRateLimit;
            } else {
              throw new Error('MALFORMED_STRUCTURED_OUTPUT: LLM returned invalid files/operations JSON after retries');
            }
          } else {
            throw new Error('MALFORMED_STRUCTURED_OUTPUT: LLM returned invalid files/operations JSON after retries');
          }
        }
      }
    }
    if (effectiveGenerationMode === 'new') {
      parsedOutput = ensureLastResortRenderableOutput(parsedOutput, 'src/App.tsx');
    }
    const parsedAppGuard = ensureAppDefaultExportInFiles(parsedOutput.extractedFiles || []);
    if (parsedAppGuard.hasAppFile) {
      const ensuredAppFile = parsedAppGuard.files.find((file) => isAppModulePath(file.path));
      const shouldReplacePrimaryWithAppFallback =
        !hasDefaultExport(parsedOutput.primaryCode || '') &&
        Boolean(ensuredAppFile?.content);
      parsedOutput = {
        ...parsedOutput,
        extractedFiles: parsedAppGuard.files,
        primaryCode: shouldReplacePrimaryWithAppFallback
          ? (ensuredAppFile?.content || parsedOutput.primaryCode)
          : parsedOutput.primaryCode,
      };
      if (parsedAppGuard.patched) {
        console.warn('[Parser] src/App.tsx missing default export. Injected fallback App wrapper.');
      }
    }
    let parsedOperationsReport = parsedOutput.operationsReport;
    if (
      effectiveGenerationMode === 'edit' &&
      parsedOperationsReport &&
      parsedOperationsReport.unresolvedOperations > 0
    ) {
      editTelemetry.record('unapplied_op', {
        projectId: requestBody.projectId,
        count: parsedOperationsReport.unresolvedOperations,
      });
    }
    if (parsedOutput.extractedFiles.length > 0) {
      const parsedByPath = new Map<string, string>();
      parsedOutput.extractedFiles.forEach((file) => {
        parsedByPath.set(file.path, file.content);
      });
      orchestrationFiles = [
        ...orchestrationFiles.filter((file) => !parsedByPath.has(file.path)),
        ...parsedOutput.extractedFiles
      ];
      console.log(`[Parser] Parsed ${parsedOutput.extractedFiles.length} file(s) from LLM ${parsedOutput.detectedFormat} output`);
    }

    const postGenerationGuardResult = applyPostGenerationFileGuard(
      orchestrationFiles,
      effectiveGenerationMode
    );
    orchestrationFiles = postGenerationGuardResult.files;
    if (effectiveGenerationMode === 'new' && postGenerationGuardResult.createdPaths.length > 0) {
      console.warn(
        `[PostGenerationGuard] Auto-created missing required files: ${postGenerationGuardResult.createdPaths.join(', ')}`
      );
    }

    const orchestratedAppFile = orchestrationFiles.find((file) => {
      const normalized = normalizeGeneratedPath(file.path);
      return normalized === 'App.tsx' || normalized === 'src/App.tsx';
    });
    let normalizedGeneratedCode = parsedOutput.primaryCode;
    let validationTargetPath = 'src/App.tsx';
    let codeToProcess = orchestratedAppFile?.content || normalizedGeneratedCode;


    // ── AST Patch Executor (Enterprise Feature 2) ───────────────────
    let astPatchStats;
    if (parsedOutput.astPatches && parsedOutput.astPatches.length > 0) {
      try {
        const { runAstPatchPipeline } = await import('../ai/processor-evolution/apply-ast-pipeline.js');
        const patchResult = runAstPatchPipeline({
          astPatches: parsedOutput.astPatches,
          codeToProcess,
          normalizedGeneratedCode,
          orchestrationFiles,
          scopedContextFiles,
          validationTargetPath,
          normalizeGeneratedPath,
        });
        codeToProcess = patchResult.codeToProcess;
        normalizedGeneratedCode = patchResult.normalizedGeneratedCode;
        orchestrationFiles = patchResult.orchestrationFiles;
        astPatchStats = patchResult.stats;
      } catch (astErr: any) {
        console.warn('[AST Patch] Error:', astErr.message);
      }
    }
    if (effectiveGenerationMode === 'edit' && astPatchStats) {
      const appliedCount = Math.max(0, Number(astPatchStats.applied || 0));
      const failedCount = Math.max(0, Number(astPatchStats.failed || 0));
      if (appliedCount > 0) {
        editTelemetry.record('ast_patch_applied', { projectId: requestBody.projectId, count: appliedCount });
      }
      if (failedCount > 0) {
        editTelemetry.record('ast_patch_failed', { projectId: requestBody.projectId, count: failedCount });
      }
    }
    if (sectionPlan.mode === 'section-isolated' && !sectionPlan.allowAppUpdate) {
      const allowedSet = new Set(sectionPlan.allowedUpdatePaths.map(normalizeGeneratedPath));
      const generatedScopedFile = orchestrationFiles.find((file) => {
        const normalizedPath = normalizeGeneratedPath(file.path);
        return allowedSet.has(normalizedPath) && /\.(tsx|ts|jsx|js)$/.test(normalizedPath);
      });

      if (generatedScopedFile) {
        validationTargetPath = normalizeGeneratedPath(generatedScopedFile.path);
        codeToProcess = generatedScopedFile.content;
      } else {
        const existingScopedPath = sectionPlan.allowedUpdatePaths.find((path) => {
          const normalizedPath = normalizeGeneratedPath(path);
          return /\.(tsx|ts|jsx|js)$/.test(normalizedPath) && typeof contextualFiles[normalizedPath] === 'string';
        });
        if (existingScopedPath) {
          const normalizedPath = normalizeGeneratedPath(existingScopedPath);
          validationTargetPath = normalizedPath;
          codeToProcess = contextualFiles[normalizedPath];
        }
      }
    }

    if (normalizeGeneratedPath(validationTargetPath) === 'src/App.tsx' && !hasDefaultExport(codeToProcess || '')) {
      const injected = tryInjectDefaultExportForApp(codeToProcess || '');
      if (injected) {
        console.warn('[Parser] src/App.tsx had no default export. Injected "export default App;" before processing.');
        codeToProcess = injected;
        normalizedGeneratedCode = injected;
        parsedOutput.primaryCode = injected;
      } else {
        console.warn('[Parser] src/App.tsx has no default export before processing. Applying emergency fallback component.');
        codeToProcess = APP_DEFAULT_EXPORT_FALLBACK;
        normalizedGeneratedCode = APP_DEFAULT_EXPORT_FALLBACK;
        parsedOutput.primaryCode = APP_DEFAULT_EXPORT_FALLBACK;
      }

      let appFileUpdated = false;
      orchestrationFiles = orchestrationFiles.map((file) => {
        if (!isAppModulePath(file.path)) return file;
        appFileUpdated = true;
        return {
          ...file,
          path: 'src/App.tsx',
          content: codeToProcess,
        };
      });
      if (!appFileUpdated) {
        orchestrationFiles.push({
          path: 'src/App.tsx',
          content: codeToProcess,
        });
      }
    }

    const normalizedValidationPathForSanitize = normalizeGeneratedPath(validationTargetPath);
    if (/\.(tsx|ts|jsx|js)$/.test(normalizedValidationPathForSanitize || '')) {
      const sanitizedValidationCode = sanitizeGeneratedModuleCode(codeToProcess || '');
      if (sanitizedValidationCode && sanitizedValidationCode !== codeToProcess) {
        codeToProcess = sanitizedValidationCode;
        if (normalizedValidationPathForSanitize === 'src/App.tsx') {
          normalizedGeneratedCode = sanitizedValidationCode;
          parsedOutput.primaryCode = sanitizedValidationCode;
        }
        orchestrationFiles = orchestrationFiles.map((file) => {
          const normalizedPath = normalizeGeneratedPath(file.path);
          if (normalizedPath === normalizedValidationPathForSanitize) {
            return { ...file, content: sanitizedValidationCode };
          }
          return file;
        });
      }
    }

    const stylePolicyPrompt = typeof prompt === 'string' ? prompt : '';
    let preProcessStyleWarning: string | null = null;
    if (
      effectiveGenerationMode === 'edit' &&
      activeFeatureFlags.enterprise.stylePolicy &&
      isStylePrompt(stylePolicyPrompt)
    ) {
      const styleBaselinePath = normalizeGeneratedPath(validationTargetPath);
      const canRunPreStylePolicy = isRuntimeUiSourcePath(styleBaselinePath);
      const styleBaselineCode = canRunPreStylePolicy
        ? (
          contextualFiles[styleBaselinePath] ||
          contextualFiles['src/App.tsx'] ||
          ''
        )
        : '';
      let stylePolicyCheck = canRunPreStylePolicy
        ? evaluateStylePolicy(stylePolicyPrompt, styleBaselineCode, codeToProcess)
        : ({ compliant: true, violations: [] } as ReturnType<typeof evaluateStylePolicy>);
      let styleRetryAttempts = 0;

      while (!stylePolicyCheck.compliant && styleRetryAttempts < 2) {
        styleRetryAttempts += 1;
        console.warn(`[StylePolicy] Non-compliant style edit detected. Retrying (${styleRetryAttempts}/2)...`);

        const styleRetryPrompt = buildStyleRetryPrompt(stylePolicyPrompt, stylePolicyCheck.violations);
        const styleRetrySystemPrompt = `${generationSystemPrompt || ''}

CRITICAL STYLE ENFORCEMENT:
- Return strict valid JSON only (no markdown).
- Edit mode: return operations/files only.
- Produce concrete class/token/CSS diffs (not purely narrative changes).`;

        try {
          const styleRetryResult = await withTimeout(
            llmManager.generate({
              provider: executionProviderHint,
              generationMode: effectiveGenerationMode,
              prompt: styleRetryPrompt,
              systemPrompt: styleRetrySystemPrompt,
              temperature: 0.2,
              maxTokens: tokenBudget.generationMaxTokens,
              stream: false,
              currentFiles: scopedContextFiles,
              image: effectiveImagePayload,
              screenshotBase64: normalizedScreenshotBase64 || undefined,
              screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
              knowledgeBase,
              providerApiKeys: userProviderApiKeys,
            }),
            TIMEOUT_MS
          );

          const styleRetryRaw = typeof styleRetryResult === 'object' && 'content' in styleRetryResult && !('getReader' in styleRetryResult)
            ? (styleRetryResult as any).content || ''
            : '';
          if (!styleRetryRaw) {
            continue;
          }

          const styleRetryParsed = parseLLMOutputWithDebugLogs(styleRetryRaw, validationTargetPath, scopedContextFiles);
          if (styleRetryParsed.parseError) {
            continue;
          }

          if (styleRetryParsed.operationsReport) {
            parsedOperationsReport = styleRetryParsed.operationsReport;
            if (styleRetryParsed.operationsReport.unresolvedOperations > 0) {
              for (let i = 0; i < styleRetryParsed.operationsReport.unresolvedOperations; i += 1) {
                editTelemetry.record('unapplied_op', {
                  projectId: requestBody.projectId,
                  unresolved: styleRetryParsed.operationsReport.unresolvedOperations,
                  source: 'style_retry'
                });
              }
            }
          }

          if (styleRetryParsed.extractedFiles.length > 0) {
            const parsedByPath = new Map<string, string>();
            styleRetryParsed.extractedFiles.forEach((file) => {
              parsedByPath.set(normalizeGeneratedPath(file.path), file.content);
            });
            orchestrationFiles = [
              ...orchestrationFiles.filter((file) => !parsedByPath.has(normalizeGeneratedPath(file.path))),
              ...Array.from(parsedByPath.entries()).map(([path, content]) => ({ path, content })),
            ];
          }

          const retryTargetPath = normalizeGeneratedPath(validationTargetPath);
          const retryTargetFile = orchestrationFiles.find((file) => normalizeGeneratedPath(file.path) === retryTargetPath);
          if (retryTargetFile) {
            codeToProcess = retryTargetFile.content;
          } else if (styleRetryParsed.primaryCode && styleRetryParsed.primaryCode.trim().length > 0) {
            codeToProcess = styleRetryParsed.primaryCode;
          }

          if (retryTargetPath === 'src/App.tsx') {
            normalizedGeneratedCode = codeToProcess;
          } else {
            let updated = false;
            orchestrationFiles = orchestrationFiles.map((file) => {
              if (normalizeGeneratedPath(file.path) === retryTargetPath) {
                updated = true;
                return { ...file, content: codeToProcess };
              }
              return file;
            });
            if (!updated) {
              orchestrationFiles.push({
                path: retryTargetPath,
                content: codeToProcess,
              });
            }
          }

          if (styleRetryParsed.astPatches && styleRetryParsed.astPatches.length > 0) {
            try {
              const { runAstPatchPipeline } = await import('../ai/processor-evolution/apply-ast-pipeline.js');
              const retryPatchResult = runAstPatchPipeline({
                astPatches: styleRetryParsed.astPatches,
                codeToProcess,
                normalizedGeneratedCode,
                orchestrationFiles,
                scopedContextFiles,
                validationTargetPath,
                normalizeGeneratedPath,
              });
              codeToProcess = retryPatchResult.codeToProcess;
              normalizedGeneratedCode = retryPatchResult.normalizedGeneratedCode;
              orchestrationFiles = retryPatchResult.orchestrationFiles;
              for (let i = 0; i < Math.max(0, Number(retryPatchResult.stats.applied || 0)); i += 1) {
                editTelemetry.record('ast_patch_applied', { projectId: requestBody.projectId, source: 'style_retry' });
              }
              for (let i = 0; i < Math.max(0, Number(retryPatchResult.stats.failed || 0)); i += 1) {
                editTelemetry.record('ast_patch_failed', { projectId: requestBody.projectId, source: 'style_retry' });
              }
            } catch (styleAstError: any) {
              console.warn('[StylePolicy] AST retry patch failed:', styleAstError.message);
            }
          }

          stylePolicyCheck = evaluateStylePolicy(stylePolicyPrompt, styleBaselineCode, codeToProcess);
        } catch (styleRetryError: any) {
          console.warn('[StylePolicy] Retry request failed:', styleRetryError.message);
          break;
        }
      }

      if (!stylePolicyCheck.compliant) {
        preProcessStyleWarning = `Style policy retry exhausted after ${styleRetryAttempts} attempt(s) without a concrete style token/class diff.`;
      }
    }

    let processed = await codeProcessor.process(codeToProcess, validationTargetPath, {
      validate,
      bundle
    });
    if (preProcessStyleWarning) {
      processed.warnings.push(preProcessStyleWarning);
    }
    const autoRepairMaxAttempts = 1;
    const autoRepairResult = await runStructuredAutoRepairLoop({
      enabled: Boolean(validate && processed.errors.length > 0),
      provider: executionProviderHint,
      generationMode: effectiveGenerationMode,
      baseSystemPrompt: generationSystemPrompt,
      userPrompt: generationPrompt,
      currentFiles: scopedContextFiles,
      filePath: validationTargetPath,
      initialCode: codeToProcess,
      initialProcessed: processed,
      validate,
      bundle,
      maxAttempts: autoRepairMaxAttempts,
      repairMaxTokens: tokenBudget.repairMaxTokens,
      parseOutputWithLogs: parseLLMOutputWithDebugLogs,
    });
    const autoRepair = autoRepairResult.summary;
    let repairStatus: 'skipped' | 'succeeded' | 'failed' = 'skipped';
    let repairError: string | undefined;
    let repairLastAttemptFiles: ProcessedFile[] | undefined;
    if (autoRepair.attempted) {
      repairStatus = autoRepair.applied || autoRepair.finalErrorCount === 0 ? 'succeeded' : 'failed';
      if (repairStatus === 'failed') {
        const latestRepairLog = [...(autoRepair.logs || [])]
          .reverse()
          .find((entry) => entry.status === 'failed' || entry.status === 'aborted');
        repairError = latestRepairLog?.reason || autoRepair.abortedReason || autoRepairResult.processed.errors[0];

        const lastAttemptFileMap: Record<string, string> = { ...scopedContextFiles };
        orchestrationFiles.forEach((file) => {
          const normalizedPath = normalizeGeneratedPath(file.path);
          if (!normalizedPath) return;
          lastAttemptFileMap[normalizedPath] = file.content;
        });
        const targetPath = normalizeGeneratedPath(validationTargetPath);
        lastAttemptFileMap[targetPath] = autoRepairResult.code;
        repairLastAttemptFiles = toProcessedFiles(sanitizeProjectSourceFiles(lastAttemptFileMap)) as ProcessedFile[];
      }
    }
    if (autoRepair.applied) {
      codeToProcess = autoRepairResult.code;
      processed = autoRepairResult.processed;
      if (normalizeGeneratedPath(validationTargetPath) === 'src/App.tsx') {
        normalizedGeneratedCode = codeToProcess;
      } else {
        const targetNormalizedPath = normalizeGeneratedPath(validationTargetPath);
        let updated = false;
        orchestrationFiles = orchestrationFiles.map((file) => {
          const normalizedPath = normalizeGeneratedPath(file.path);
          if (normalizedPath === targetNormalizedPath) {
            updated = true;
            return { ...file, content: codeToProcess };
          }
          return file;
        });
        if (!updated) {
          orchestrationFiles.push({
            path: targetNormalizedPath,
            content: codeToProcess,
          });
        }
      }
      console.log(
        `ðŸ› ï¸ Auto-repair applied: ${autoRepair.initialErrorCount} -> ${autoRepair.finalErrorCount} ` +
        `(${autoRepair.attemptsExecuted}/${autoRepair.maxAttempts} attempts)`
      );
    } else if (autoRepair.attempted) {
      console.log(
        `ðŸ›‘ Auto-repair stopped without improvement: errors=${autoRepair.initialErrorCount}, ` +
        `reason=${autoRepair.abortedReason || 'max attempts reached'}`
      );
    }
    const validationBeforeRollback = classifyValidationErrors(processed.errors);
    let rollbackApplied = false;
    let rollbackSource: 'none' | 'context-files' | 'snapshot' = 'none';
    let rollbackReason: string | undefined;
    let rollbackTrigger: 'none' | 'validation' | 'final_validation' | 'quality' = 'none';
    let rollbackSnapshotId: string | undefined;
    let rollbackFileMap: Record<string, string> | null = null;

    const rollbackErrorBreakdown = classifyValidationErrors(processed.errors);
    const initialNoValidEntryPoint = !hasValidGeneratedEntryPoint({
      validationTargetPath,
      codeToProcess,
      normalizedGeneratedCode,
      orchestrationFiles,
      contextualFiles,
    });
    const initialBundlingFailed = didBundlingCompletelyFail(processed.errors, processed.warnings);
    const shouldRollbackInitialValidation = shouldRollbackForValidationOutcome(
      rollbackErrorBreakdown,
      initialNoValidEntryPoint,
      initialBundlingFailed
    );
    if (effectiveGenerationMode === 'edit' && shouldRollbackInitialValidation) {
      const hasContextFiles = Object.keys(contextualFiles).length > 0;
      if (hasContextFiles) {
        rollbackApplied = true;
        rollbackTrigger = 'validation';
        rollbackSource = 'context-files';
        rollbackReason = `Validation failed critically (${rollbackErrorBreakdown.total} errors, invalid entry-point); keeping previous project state.`;
        rollbackFileMap = { ...contextualFiles };
      } else {
        const latestSnapshot = projectSnapshotStore.getLatest(requestBody.projectId);
        if (latestSnapshot?.files && Object.keys(latestSnapshot.files).length > 0) {
          rollbackApplied = true;
          rollbackTrigger = 'validation';
          rollbackSource = 'snapshot';
          rollbackSnapshotId = latestSnapshot.id;
          rollbackReason = `Validation failed critically (${rollbackErrorBreakdown.total} errors, invalid entry-point); restored latest snapshot.`;
          rollbackFileMap = { ...latestSnapshot.files };
        }
      }
    }
    const allowedUpdateSet = new Set(sectionPlan.allowedUpdatePaths.map(normalizeGeneratedPath));
    const architectForbiddenSet = new Set(
      (promptUnderstanding.forbiddenFiles || []).map((file) => normalizeGeneratedPath(file))
    );
    const validationPathNormalized = normalizeGeneratedPath(validationTargetPath);
    const isAllowedEditOutputPath = (rawPath: string): boolean => {
      const normalizedPath = normalizeGeneratedPath(rawPath || '');
      if (!normalizedPath) return false;
      if (effectiveGenerationMode !== 'edit') return true;
      if (isEditProtectedRootFile(normalizedPath)) return false;
      if (architectForbiddenSet.has(normalizedPath)) return false;
      if (sectionPlan.mode !== 'section-isolated') return true;
      if (normalizedPath === 'src/App.tsx') {
        return sectionPlan.allowAppUpdate;
      }
      if (allowedUpdateSet.has(normalizedPath)) return true;
      if (normalizedPath === validationPathNormalized) return true;
      return false;
    };

    const contractValidationStartedAt = Date.now();
    const filteredProcessedFiles = (processed.files as any[]).filter((file) => {
      const normalizedPath = normalizeGeneratedPath(file.path || '');
      if (!normalizedPath) return false;
      if (!isStructuredContractPath(normalizedPath)) return false;
      return isAllowedEditOutputPath(normalizedPath);
    });
    const generatedFileContract = validateGeneratedFilesAgainstContract({
      files: orchestrationFiles,
      generationMode: effectiveGenerationMode,
      plannedFileSet: new Set(plannedFiles.map((path) => normalizeContractPath(path))),
      templateFileSet: new Set(Object.keys(templateFiles).map((path) => normalizeContractPath(path))),
      isAllowedEditOutputPath,
    });
    const filteredOrchestrationFiles = generatedFileContract.accepted;
    const blockedByScopeCount = generatedFileContract.rejected.filter((entry) => entry.reason === 'scope_blocked').length;
    if (plannedFileContract.discardedPaths.length > 0) {
      processed.warnings = [
        ...processed.warnings,
        `[Contract] Dropped ${plannedFileContract.discardedPaths.length} invalid planned path(s): ${plannedFileContract.discardedPaths.slice(0, 4).join(', ')}${plannedFileContract.discardedPaths.length > 4 ? ', ...' : ''}`,
      ];
    }
    if (generatedFileContract.rejected.length > 0) {
      const rejectedPreview = generatedFileContract.rejected
        .slice(0, 4)
        .map((entry) => `${entry.path} (${entry.reason})`)
        .join(', ');
      processed.warnings = [
        ...processed.warnings,
        `[Contract] Rejected ${generatedFileContract.rejected.length} generated file update(s): ${rejectedPreview}${generatedFileContract.rejected.length > 4 ? ', ...' : ''}`,
      ];
    }
    if (effectiveGenerationMode === 'new' && generatedFileContract.unplanned.length > 0) {
      processed.warnings = [
        ...processed.warnings,
        `[Contract] Accepted ${generatedFileContract.unplanned.length} unplanned src path(s): ${generatedFileContract.unplanned.slice(0, 5).join(', ')}${generatedFileContract.unplanned.length > 5 ? ', ...' : ''}`,
      ];
    }
    stageTimings.contractValidation = Date.now() - contractValidationStartedAt;

    const duration = Date.now() - startTime;
    stageTimings.total = duration;
    const fallbackTemplateContext = buildFallbackTemplateContext(prompt, hydratedContextForResponse);
    const assemblyStartedAt = Date.now();
    let assembledFileMap = assembleProjectFiles({
      templateFiles,
      existingFiles: contextualFiles,
      plannedFiles,
      generatedCode: normalizedGeneratedCode,
      generatedFiles: filteredOrchestrationFiles,
      processedFiles: filteredProcessedFiles as any,
      dependencies: processed.dependencies,
      fallbackContext: fallbackTemplateContext,
    });
    stageTimings.assembly = Date.now() - assemblyStartedAt;
    if (rollbackApplied && rollbackFileMap) {
      assembledFileMap = { ...rollbackFileMap };
    }
    const sectionGuardedFileMap = rollbackApplied
      ? assembledFileMap
      : applySectionUpdateGuard(assembledFileMap, contextualFiles, sectionPlan);
    let sanitizedFileMap = sanitizeProjectSourceFiles(sectionGuardedFileMap);
    if (!rollbackApplied && effectiveGenerationMode === 'edit' && selectedEditTargetPath) {
      const targetedBoundary = enforceTargetedEditBoundary({
        candidateFiles: sanitizedFileMap,
        existingFiles: contextualFiles,
        targetPath: selectedEditTargetPath,
      });
      sanitizedFileMap = sanitizeProjectSourceFiles(targetedBoundary.files);
      if (targetedBoundary.revertedPaths.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[EditTarget] Reverted ${targetedBoundary.revertedPaths.length} out-of-target file change(s): ${targetedBoundary.revertedPaths.slice(0, 5).join(', ')}${targetedBoundary.revertedPaths.length > 5 ? ' ...' : ''}`,
        ];
      }
    }
    if (rollbackApplied && rollbackFileMap) {
      sanitizedFileMap = sanitizeProjectSourceFiles(rollbackFileMap);
      const rollbackTargetPath = normalizeGeneratedPath(validationTargetPath);
      codeToProcess =
        sanitizedFileMap[rollbackTargetPath] ||
        sanitizedFileMap['src/App.tsx'] ||
        codeToProcess;
      if (rollbackReason) {
        processed.warnings = [...processed.warnings, rollbackReason];
      }
      processed.errors = [];
      processed.metadata.hasErrors = false;
      console.warn(`â†©ï¸ Rollback applied (${rollbackSource})${rollbackSnapshotId ? ` snapshot=${rollbackSnapshotId}` : ''}`);
    }

    const postAssemblyAppGuard = ensureAppDefaultExportInFileMap(sanitizedFileMap);
    if (postAssemblyAppGuard.patched) {
      let patchedFiles = postAssemblyAppGuard.files;
      let reasonLabel = postAssemblyAppGuard.reason || 'normalized';

      if (postAssemblyAppGuard.reason === 'missing' || postAssemblyAppGuard.reason === 'invalid_html') {
        const recoveredApp = buildAppFromGeneratedSections(patchedFiles);
        if (recoveredApp) {
          patchedFiles = {
            ...patchedFiles,
            'src/App.tsx': recoveredApp,
          };
          const verifiedRecovery = ensureAppDefaultExportInFileMap(patchedFiles);
          patchedFiles = verifiedRecovery.files;
          reasonLabel = `recovered_from_sections:${postAssemblyAppGuard.reason}`;
        }
      }

      sanitizedFileMap = sanitizeProjectSourceFiles(patchedFiles);
      processed.warnings = [
        ...processed.warnings,
        `[Contract] Normalized src/App.tsx after assemble (${reasonLabel}).`,
      ];
      if (normalizeGeneratedPath(validationTargetPath) === 'src/App.tsx') {
        codeToProcess = sanitizedFileMap['src/App.tsx'] || APP_DEFAULT_EXPORT_FALLBACK;
        normalizedGeneratedCode = codeToProcess;
      }
    }

    let contentPolishSummary: { domain: string; changes: string[] } = {
      domain: 'default',
      changes: [],
    };
    let deterministicActions: string[] = [];
    let suspiciousEditRedoTriggered = false;
    let suspiciousEditRedoRecovered = false;

    if (!rollbackApplied) {
      const polished = polishGeneratedContent({
        files: sanitizedFileMap,
        prompt: generationPrompt,
        brand: resolvedProjectPlan.finalPlan.brand,
        injectMotion: true,
      });
      sanitizedFileMap = sanitizeProjectSourceFiles(polished.files);
      contentPolishSummary = {
        domain: polished.domain,
        changes: polished.changes,
      };

      const deterministicResult = applyDeterministicEditActions({
        prompt,
        files: sanitizedFileMap,
      });
      deterministicActions = deterministicResult.actions;
      if (deterministicResult.applied) {
        sanitizedFileMap = sanitizeProjectSourceFiles(deterministicResult.files);
      }
    }

    if (!rollbackApplied) {
      const hydration = hydrateMissingLocalImports({ ...sanitizedFileMap }, fallbackTemplateContext);
      sanitizedFileMap = sanitizeProjectSourceFiles(hydration.files);
      if (hydration.addedPaths.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[ImportGraph] Added ${hydration.addedPaths.length} missing local module placeholder(s): ${hydration.addedPaths.slice(0, 5).join(', ')}${hydration.addedPaths.length > 5 ? ' ...' : ''}`,
        ];
      }
    }

    const domainCoverageBeforeFallback = evaluateDomainCoverage({
      packIds: domainPack.packIds,
      files: sanitizedFileMap,
    });
    let domainFallbackApplied = false;
    const shouldForceKanbanFallback = Boolean(
      !rollbackApplied &&
      domainPack.packIds.includes('kanban') &&
      processed.errors.length > 0
    );
    if (!rollbackApplied && (domainCoverageBeforeFallback.hasCriticalIssues || shouldForceKanbanFallback)) {
      const fallbackResult = applyDeterministicDomainFallback({
        packIds: domainPack.packIds,
        files: sanitizedFileMap,
        generationMode: effectiveGenerationMode,
        report: domainCoverageBeforeFallback,
        forcePacks: shouldForceKanbanFallback ? ['kanban'] : [],
      });
      if (fallbackResult.applied.length > 0) {
        sanitizedFileMap = sanitizeProjectSourceFiles(
          personalizeFallbackFiles(fallbackResult.files, fallbackTemplateContext)
        );
        domainFallbackApplied = true;
        processed.warnings = [
          ...processed.warnings,
          `[DomainFallback] Applied: ${fallbackResult.applied.join(', ')}`,
        ];
      }
    }

    if (!rollbackApplied && domainFallbackApplied) {
      const hydration = hydrateMissingLocalImports({ ...sanitizedFileMap }, fallbackTemplateContext);
      sanitizedFileMap = sanitizeProjectSourceFiles(hydration.files);
    }

    if (
      effectiveGenerationMode === 'edit' &&
      !rollbackApplied &&
      selectedEditTargetPath &&
      isSmallEditPrompt(promptForPlanning) &&
      !isLargeRedesignPrompt(promptForPlanning)
    ) {
      const preValidationSmartDiff = computeSmartDiff(contextualFiles, sanitizedFileMap);
      if (preValidationSmartDiff.changeRatio > 0.8) {
        suspiciousEditRedoTriggered = true;
        const normalizedTargetPath = normalizeGeneratedPath(selectedEditTargetPath);
        console.warn(
          `[EditDiffGuard] Suspicious large diff (${preValidationSmartDiff.changeRatio.toFixed(2)}) for small edit. Retrying targeted file ${normalizedTargetPath}.`
        );
        const baselineTargetContent =
          contextualFiles[normalizedTargetPath] ||
          scopedContextFiles[normalizedTargetPath] ||
          sanitizedFileMap[normalizedTargetPath] ||
          '';

        if (baselineTargetContent.trim().length > 0) {
          const redoPrompt = `${promptForPlanning}

EDIT MODE REDO:
- Previous output changed too much code for this small edit request.
- ONLY modify ${normalizedTargetPath}.
- Keep all other files exactly unchanged.
- Return the COMPLETE modified file ${normalizedTargetPath}.`;

          try {
            const redoResult = await withTimeout(
              llmManager.generate({
                provider: executionProviderHint,
                generationMode: effectiveGenerationMode,
                prompt: redoPrompt,
                systemPrompt: generationSystemPrompt,
                temperature: Math.min(0.5, temperature || 0.7),
                maxTokens: Math.min(tokenBudget.generationMaxTokens, 1800),
                stream: false,
                currentFiles: {
                  [normalizedTargetPath]: baselineTargetContent,
                },
                image: effectiveImagePayload,
                screenshotBase64: normalizedScreenshotBase64 || undefined,
                screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
                knowledgeBase,
                providerApiKeys: userProviderApiKeys,
              }),
              Math.min(TIMEOUT_MS, 45000)
            );
            const redoRawCode = typeof redoResult === 'string'
              ? redoResult
              : (redoResult as any)?.content || '';
            const redoParsed = parseLLMOutputWithDebugLogs(redoRawCode, normalizedTargetPath, {
              [normalizedTargetPath]: baselineTargetContent,
            });
            const parsedTargetFile = (redoParsed.extractedFiles || []).find((file) => {
              const candidatePath = normalizeGeneratedPath(file.path || '');
              return candidatePath === normalizedTargetPath && String(file.content || '').trim().length > 0;
            });
            const fallbackParsedFile = (redoParsed.extractedFiles || []).find((file) => {
              const candidatePath = normalizeGeneratedPath(file.path || '');
              return /\.(tsx|ts|jsx|js|css|scss|sass|less)$/.test(candidatePath) && String(file.content || '').trim().length > 0;
            });
            const redoContentCandidate =
              String(parsedTargetFile?.content || fallbackParsedFile?.content || '').trim().length > 0
                ? String(parsedTargetFile?.content || fallbackParsedFile?.content || '')
                : String(redoParsed.primaryCode || '');

            if (redoContentCandidate.trim().length > 0) {
              const sanitizedRedoTarget = sanitizeProjectSourceFiles({
                [normalizedTargetPath]: redoContentCandidate,
              });
              sanitizedFileMap = sanitizeProjectSourceFiles({
                ...sanitizedFileMap,
                [normalizedTargetPath]: sanitizedRedoTarget[normalizedTargetPath] || redoContentCandidate,
              });
              const postRedoSmartDiff = computeSmartDiff(contextualFiles, sanitizedFileMap);
              suspiciousEditRedoRecovered = postRedoSmartDiff.changeRatio <= 0.8;
              if (suspiciousEditRedoRecovered) {
                processed.warnings = [
                  ...processed.warnings,
                  `[EditDiffGuard] Suspicious diff corrected via targeted redo (${preValidationSmartDiff.changeRatio.toFixed(2)} -> ${postRedoSmartDiff.changeRatio.toFixed(2)}).`,
                ];
              } else {
                processed.warnings = [
                  ...processed.warnings,
                  `[EditDiffGuard] Suspicious diff persisted after targeted redo (${postRedoSmartDiff.changeRatio.toFixed(2)}).`,
                ];
              }
            } else {
              processed.warnings = [
                ...processed.warnings,
                '[EditDiffGuard] Suspicious diff detected, but targeted redo returned no usable file.',
              ];
            }
          } catch (redoError: any) {
            processed.warnings = [
              ...processed.warnings,
              `[EditDiffGuard] Targeted redo failed: ${redoError?.message || 'unknown error'}`,
            ];
          }
        } else {
          processed.warnings = [
            ...processed.warnings,
            `[EditDiffGuard] Suspicious diff detected for ${normalizedTargetPath}, but baseline file content was empty.`,
          ];
        }
      }
    }

    let forcedCriticalErrors: string[] = [];

    const preValidationAppGuard = ensureAppDefaultExportInFileMap(sanitizedFileMap);
    if (preValidationAppGuard.patched) {
      let patchedFiles = preValidationAppGuard.files;
      let reasonLabel = preValidationAppGuard.reason || 'normalized';

      if (preValidationAppGuard.reason === 'missing' || preValidationAppGuard.reason === 'invalid_html') {
        const recoveredApp = buildAppFromGeneratedSections(patchedFiles);
        if (recoveredApp) {
          patchedFiles = {
            ...patchedFiles,
            'src/App.tsx': recoveredApp,
          };
          const verifiedRecovery = ensureAppDefaultExportInFileMap(patchedFiles);
          patchedFiles = verifiedRecovery.files;
          reasonLabel = `recovered_from_sections:${preValidationAppGuard.reason}`;
        }
      }

      sanitizedFileMap = sanitizeProjectSourceFiles(patchedFiles);
      processed.warnings = [
        ...processed.warnings,
        `[Contract] Normalized src/App.tsx before final validation (${reasonLabel}).`,
      ];
      if (normalizeGeneratedPath(validationTargetPath) === 'src/App.tsx') {
        codeToProcess = sanitizedFileMap['src/App.tsx'] || APP_DEFAULT_EXPORT_FALLBACK;
        normalizedGeneratedCode = codeToProcess;
      }
    }

    if (!rollbackApplied && isFallbackAppPlaceholder(sanitizedFileMap['src/App.tsx'])) {
      const recoveredApp = buildAppFromGeneratedSections(sanitizedFileMap);
      if (recoveredApp) {
        sanitizedFileMap = sanitizeProjectSourceFiles({
          ...sanitizedFileMap,
          'src/App.tsx': recoveredApp,
        });
        if (normalizeGeneratedPath(validationTargetPath) === 'src/App.tsx') {
          codeToProcess = sanitizedFileMap['src/App.tsx'] || codeToProcess;
          normalizedGeneratedCode = codeToProcess;
        }
        processed.warnings = [
          ...processed.warnings,
          '[Contract] Recovered src/App.tsx from generated section components.',
        ];
      }
    }

    const appFallbackPlaceholderDetected = isFallbackAppPlaceholder(sanitizedFileMap['src/App.tsx']);

    if (!rollbackApplied && appFallbackPlaceholderDetected) {
      const fallbackErrorMessage = 'Generation incomplete: App scaffold fallback placeholder was produced.';
      const hasContextFiles = Object.keys(contextualFiles).length > 0;
      const placeholderBundlingFailed = didBundlingCompletelyFail(processed.errors, processed.warnings);
      const shouldRollbackPlaceholder = shouldRollbackForValidationOutcome(
        classifyValidationErrors(processed.errors),
        true,
        placeholderBundlingFailed
      );
      if (effectiveGenerationMode === 'edit' && hasContextFiles && shouldRollbackPlaceholder) {
        rollbackApplied = true;
        rollbackTrigger = 'validation';
        rollbackSource = 'context-files';
        rollbackReason = `${fallbackErrorMessage} Keeping previous project state.`;
        sanitizedFileMap = sanitizeProjectSourceFiles({ ...contextualFiles });
        const rollbackTargetPath = normalizeGeneratedPath(validationTargetPath);
        codeToProcess =
          sanitizedFileMap[rollbackTargetPath] ||
          sanitizedFileMap['src/App.tsx'] ||
          codeToProcess;
        normalizedGeneratedCode = codeToProcess;
        processed.errors = [];
        processed.metadata.hasErrors = false;
      } else {
        processed.warnings = [...processed.warnings, fallbackErrorMessage];
      }

      processed.warnings = [
        ...processed.warnings,
        '[Contract] Blocked fallback placeholder App from being returned as successful output.',
      ];
    }

    const domainCoverage = evaluateDomainCoverage({
      packIds: domainPack.packIds,
      files: sanitizedFileMap,
    });

    const finalValidationPathCandidate = normalizeGeneratedPath(validationTargetPath);
    const finalValidationPath = /\.(tsx|ts|jsx|js)$/.test(finalValidationPathCandidate)
      ? finalValidationPathCandidate
      : 'src/App.tsx';
    const finalValidationCode =
      sanitizedFileMap[finalValidationPath] ||
      sanitizedFileMap['src/App.tsx'] ||
      codeToProcess;

    if (!rollbackApplied && validate) {
      let effectiveFinalValidationCode = finalValidationCode;
      let finalProcessed = await codeProcessor.process(effectiveFinalValidationCode, finalValidationPath, {
        validate,
        bundle,
      });

      const shadcnStubOutcome = applyShadcnAutoStubsFromValidationErrors(
        sanitizedFileMap,
        finalProcessed.errors
      );
      if (shadcnStubOutcome.addedPaths.length > 0) {
        const shadcnAutoStubWarning = `[AutoStub] Added missing shadcn/ui stub module(s): ${shadcnStubOutcome.addedPaths.slice(0, 5).join(', ')}${shadcnStubOutcome.addedPaths.length > 5 ? ' ...' : ''}`;
        sanitizedFileMap = sanitizeProjectSourceFiles(shadcnStubOutcome.files);
        effectiveFinalValidationCode =
          sanitizedFileMap[finalValidationPath] ||
          sanitizedFileMap['src/App.tsx'] ||
          finalValidationCode;
        finalProcessed = await codeProcessor.process(effectiveFinalValidationCode, finalValidationPath, {
          validate,
          bundle,
        });
        finalProcessed.warnings = [...finalProcessed.warnings, shadcnAutoStubWarning];
      }

      const partitionedFinalErrors = partitionValidationErrorsForStability(finalProcessed.errors);
      const nonBlockingWarnings = partitionedFinalErrors.warnings.map((error) => `[Validation/warn-only] ${error}`);
      finalProcessed.errors = partitionedFinalErrors.blocking;
      if (nonBlockingWarnings.length > 0) {
        finalProcessed.warnings = [...finalProcessed.warnings, ...nonBlockingWarnings];
      }

      if (finalProcessed.errors.length > 0) {
        const finalErrorBreakdown = classifyValidationErrors(finalProcessed.errors);
        const finalNoValidEntryPoint = !hasValidAssembledEntryPoint(sanitizedFileMap, effectiveFinalValidationCode);
        const finalBundlingFailed = didBundlingCompletelyFail(finalProcessed.errors, finalProcessed.warnings);
        const shouldRollbackFinalValidation = shouldRollbackForValidationOutcome(
          finalErrorBreakdown,
          finalNoValidEntryPoint,
          finalBundlingFailed
        );
        const hasContextFiles = Object.keys(contextualFiles).length > 0;
        if (effectiveGenerationMode === 'edit' && hasContextFiles && shouldRollbackFinalValidation) {
          rollbackApplied = true;
          rollbackTrigger = 'final_validation';
          rollbackSource = 'context-files';
          rollbackReason = `Final validation failed critically (${finalErrorBreakdown.total} errors, invalid entry-point); keeping previous project state.`;
          sanitizedFileMap = sanitizeProjectSourceFiles({ ...contextualFiles });
          const rollbackTargetPath = normalizeGeneratedPath(validationTargetPath);
          codeToProcess =
            sanitizedFileMap[rollbackTargetPath] ||
            sanitizedFileMap['src/App.tsx'] ||
            codeToProcess;
          processed.warnings = [...processed.warnings, rollbackReason];
          processed.errors = [];
          processed.metadata.hasErrors = false;
          console.warn('â†©ï¸ Rollback applied after final validation failure (context-files)');
        } else {
          processed = finalProcessed;
          codeToProcess = effectiveFinalValidationCode;
          processed.warnings = [
            ...processed.warnings,
            `Final validation failed after post-processing (${finalProcessed.errors.length} errors).`,
          ];
        }
      } else {
        processed = finalProcessed;
        codeToProcess = effectiveFinalValidationCode;
      }
    } else {
      codeToProcess = finalValidationCode;
    }

    let qualityGate = await evaluateQualityGates({
      files: sanitizedFileMap,
      primaryPath: finalValidationPath,
      prompt: stylePolicyPrompt,
    });
    const minimumQualityScore = 60;
    if (
      effectiveGenerationMode === 'new' &&
      qualityGate.overall < minimumQualityScore &&
      !rollbackApplied
    ) {
      const qualityFeedback = qualityGate.findings
        .slice(0, 6)
        .map((finding, index) => `${index + 1}. ${finding.message} Fix: ${finding.suggestion}`)
        .join('\n');
      const retryPrompt = `${generationPrompt}

QUALITY IMPROVEMENT REQUIRED:
The previous output scored ${qualityGate.overall}/100. Minimum required score is ${minimumQualityScore}/100.
Improve visual quality and production readiness before returning files.
Address these issues first:
${qualityFeedback || '- Improve visual hierarchy, interactions, and responsive polish.'}`;

      try {
        const retryResult = await withTimeout(
          llmManager.generate({
            provider: executionProviderHint,
            generationMode: effectiveGenerationMode,
            prompt: retryPrompt,
            systemPrompt: generationSystemPrompt,
            temperature: 0.35,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image: effectiveImagePayload,
            screenshotBase64: normalizedScreenshotBase64 || undefined,
            screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
            knowledgeBase,
            providerApiKeys: userProviderApiKeys,
          }),
          TIMEOUT_MS
        );

        if (typeof retryResult === 'object' && retryResult && 'rateLimit' in retryResult) {
          requestRateLimit = (retryResult as any).rateLimit || requestRateLimit;
        }
        const retryRawCode = typeof retryResult === 'object' && retryResult && 'content' in retryResult && !('getReader' in retryResult)
          ? String((retryResult as any).content || '')
          : (typeof retryResult === 'string' ? retryResult : '');
        if (retryRawCode.trim().length > 0) {
          const retryParsed = parseLLMOutputWithDebugLogs(retryRawCode, finalValidationPath, scopedContextFiles);
          if (!retryParsed.parseError) {
            const retryEntries = retryParsed.extractedFiles
              .map((file) => ({
                path: normalizeGeneratedPath(file.path || ''),
                content: String(file.content || ''),
              }))
              .filter((file) => Boolean(file.path && file.content));
            const candidateFileMapRaw: Record<string, string> = { ...sanitizedFileMap };

            if (retryEntries.length > 0) {
              retryEntries.forEach((file) => {
                candidateFileMapRaw[file.path] = file.content;
              });
            } else if (retryParsed.primaryCode && retryParsed.primaryCode.trim().length > 0) {
              candidateFileMapRaw[finalValidationPath] = retryParsed.primaryCode;
            }

            const candidateFileMap = sanitizeProjectSourceFiles(candidateFileMapRaw);
            const candidateCode =
              candidateFileMap[finalValidationPath] ||
              candidateFileMap['src/App.tsx'] ||
              codeToProcess;
            const candidateProcessed = await codeProcessor.process(candidateCode, finalValidationPath, {
              validate,
              bundle,
            });
            if (candidateProcessed.errors.length === 0) {
              const candidateQualityGate = await evaluateQualityGates({
                files: candidateFileMap,
                primaryPath: finalValidationPath,
                prompt: stylePolicyPrompt,
              });
              if (candidateQualityGate.overall > qualityGate.overall) {
                sanitizedFileMap = candidateFileMap;
                codeToProcess = candidateCode;
                processed = candidateProcessed;
                processed.warnings = [
                  ...processed.warnings,
                  `Quality regeneration improved score from ${qualityGate.overall} to ${candidateQualityGate.overall}.`,
                ];
                qualityGate = candidateQualityGate;
              } else {
                processed.warnings = [
                  ...processed.warnings,
                  `Quality regeneration attempted but score did not improve (current ${qualityGate.overall}, retry ${candidateQualityGate.overall}).`,
                ];
              }
            } else {
              processed.warnings = [
                ...processed.warnings,
                'Quality regeneration attempt produced validation errors and was discarded.',
              ];
            }
          }
        }
      } catch (qualityRetryError: any) {
        processed.warnings = [
          ...processed.warnings,
          `Quality regeneration attempt failed: ${qualityRetryError?.message || 'unknown error'}.`,
        ];
      }
    }
    if (domainCoverage.issues.length > 0) {
      qualityGate.findings.push(
        ...domainCoverage.issues.map((issue, index) => ({
          id: `domain-${issue.packId}-${issue.id}-${index}`,
          severity: issue.severity,
          message: `[Domain/${issue.packId}] ${issue.message}`,
          suggestion: issue.severity === 'critical'
            ? 'Complete missing domain requirements before returning generated project files.'
            : 'Improve domain-specific behavior coverage for this prompt.',
        }))
      );
    }

    // ── ENTERPRISE QUALITY GATES (Features 3 & 4) ───────────────────
    if (activeFeatureFlags.enterprise.stylePolicy && isStylePrompt(stylePolicyPrompt)) {
      const runtimeUiPaths = Object.entries(sanitizedFileMap)
        .filter(([candidate, content]) => isRuntimeUiSourcePath(candidate) && typeof content === 'string')
        .map(([candidate]) => normalizeGeneratedPath(candidate));
      const changedRuntimeUiPaths = runtimeUiPaths.filter((candidate) => {
        if (effectiveGenerationMode !== 'edit') return true;
        const previous = contextualFiles[candidate];
        const next = sanitizedFileMap[candidate];
        return typeof previous !== 'string' || previous !== next;
      });
      const stylePathsToCheck = changedRuntimeUiPaths.length > 0 ? changedRuntimeUiPaths : runtimeUiPaths;

      if (stylePathsToCheck.length > 0) {
        const styleOldCode = stylePathsToCheck
          .map((path) => (typeof contextualFiles[path] === 'string' ? contextualFiles[path] : ''))
          .join('\n');
        const styleNewCode = stylePathsToCheck
          .map((path) => (typeof sanitizedFileMap[path] === 'string' ? sanitizedFileMap[path] : ''))
          .join('\n');
        const stylePolicy = evaluateStylePolicy(stylePolicyPrompt, styleOldCode, styleNewCode);
        if (!stylePolicy.compliant) {
          editTelemetry.record('style_violation', { projectId: requestBody.projectId, prompt: stylePolicyPrompt });
          qualityGate.findings.push(...stylePolicy.violations.map((v, i) => ({
            id: `style-violation-${i}-${Date.now()}`,
            type: 'style' as any,
            severity: v.severity === 'error' ? 'critical' as const : 'warning' as const,
            message: `[StylePolicy] ${v.message}`,
            category: 'style',
            suggestion: stylePolicy.suggestion || 'Review the style changes and ensure they follow the project design system.'
          } as any)));
        }
      }
    }

    if (activeFeatureFlags.enterprise.libraryQuality) {
      const qualityTargets = Object.entries(sanitizedFileMap)
        .filter(([path, content]) => {
          if (!isRuntimeUiSourcePath(path) || typeof content !== 'string') return false;
          if (effectiveGenerationMode !== 'edit') return true;
          const previous = contextualFiles[path];
          return typeof previous !== 'string' || previous !== content;
        });
      const blockedLibraries: Array<{ name: string; suggestion?: string; path: string }> = [];
      const scaffoldWarnings: Array<{ message: string; location: string; path: string }> = [];

      qualityTargets.forEach(([path, content]) => {
        const result = evaluateLibraryQuality(content, true);
        result.blockedLibraries.forEach((lib) => {
          blockedLibraries.push({
            name: lib.name,
            suggestion: lib.suggestion,
            path,
          });
        });
        result.scaffoldWarnings.forEach((warning) => {
          scaffoldWarnings.push({
            message: warning.message,
            location: warning.location,
            path,
          });
        });
      });

      if (blockedLibraries.length > 0 || scaffoldWarnings.length > 0) {
        if (blockedLibraries.length > 0) editTelemetry.record('library_block', { projectId: requestBody.projectId, blocked: blockedLibraries.length });
        qualityGate.findings.push(...blockedLibraries.map((l, i) => ({
          id: `lib-block-${i}-${Date.now()}`,
          type: 'security' as any,
          severity: 'warning' as const,
          message: `[LibraryQuality] Blocked library: ${l.name} in ${l.path}. ${l.suggestion || ''}`,
          category: 'security',
          suggestion: l.suggestion || 'Remove the blocked library and use an approved alternative.'
        } as any)));
        qualityGate.findings.push(...scaffoldWarnings.map((w, i) => ({
          id: `scaffold-warn-${i}-${Date.now()}`,
          type: 'quality' as any,
          severity: 'warning' as const,
          message: `[Scaffold] ${w.message} at ${w.path}:${w.location}`,
          category: 'quality',
          suggestion: 'Scaffold/placeholder text detected; replace with domain-specific production copy.'
        } as any)));
      }
    }
    let qualityCriticalCount = qualityGate.findings.filter((finding) => finding.severity === 'critical').length;
    if (qualityGate.findings.length > 0) {
      processed.warnings = [
        ...processed.warnings,
        ...qualityGate.findings
          .filter((finding) => finding.severity !== 'critical')
          .map((finding) => `[Quality/${finding.severity}] ${finding.message}`),
      ];
    }

    if (qualityCriticalCount > 0) {
      processed.warnings = [
        ...processed.warnings,
        'Quality gate detected critical findings. No automatic post-quality repair/rollback was applied.',
      ];
    }

    if (effectiveGenerationMode === 'new') {
      sanitizedFileMap = sanitizeProjectSourceFiles(
        ensureProjectFontSystem({
          files: sanitizedFileMap,
          prompt,
          hydratedContext: hydratedContextForResponse,
          generationMode: effectiveGenerationMode,
        })
      );
    }

    if (githubConnected) {
      sanitizedFileMap = sanitizeProjectSourceFiles(
        ensureGitHubConnectedScaffoldFiles({
          files: sanitizedFileMap,
          prompt,
          hydratedContext: hydratedContextForResponse,
          supabaseConnected: Boolean(supabaseIntegration?.connected),
          repoUrl: githubIntegration?.repoUrl || null,
        })
      );
    }

    let editDiffChangedPaths: string[] = [];
    let editValidationRevertedPaths: string[] = [];
    let editRetryRecoveredPaths: string[] = [];
    if (effectiveGenerationMode === 'edit' && !rollbackApplied) {
      const diffResult = applyEditDiff(
        contextualFiles,
        sanitizedFileMap,
        detectedEditType || 'feature-modify'
      );
      sanitizedFileMap = sanitizeProjectSourceFiles(diffResult.files);
      editDiffChangedPaths = diffResult.changedPaths;

      if (diffResult.revertedByChangeRatio.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[EditDiff] Reverted ${diffResult.revertedByChangeRatio.length} suspicious file change(s) by ratio guard: ${diffResult.revertedByChangeRatio.slice(0, 5).join(', ')}${diffResult.revertedByChangeRatio.length > 5 ? ' ...' : ''}`,
        ];
      }

      const validationOutcome = await validateAndRepairEditedFiles({
        candidateFiles: sanitizedFileMap,
        baselineFiles: contextualFiles,
        changedPaths: diffResult.changedPaths,
        editInstruction: editInstructionForContext || prompt,
        provider: executionProviderHint,
        systemPrompt: generationSystemPrompt,
        maxTokens: tokenBudget.generationMaxTokens,
        userProviderApiKeys,
        image: effectiveImagePayload,
        screenshotBase64: normalizedScreenshotBase64 || undefined,
        screenshotMimeType: hasScreenshotInput ? normalizedScreenshotMimeType : undefined,
        knowledgeBase,
      });

      sanitizedFileMap = sanitizeProjectSourceFiles(validationOutcome.files);
      editValidationRevertedPaths = validationOutcome.revertedPaths;
      editRetryRecoveredPaths = validationOutcome.retriedPaths;

      if (validationOutcome.revertedPaths.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[EditValidation] Reverted ${validationOutcome.revertedPaths.length} file(s) due to introduced validation errors: ${validationOutcome.revertedPaths.slice(0, 5).join(', ')}${validationOutcome.revertedPaths.length > 5 ? ' ...' : ''}`,
        ];
      }
      if (validationOutcome.retriedPaths.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[EditValidation] Strict retry recovered ${validationOutcome.retriedPaths.length} file(s): ${validationOutcome.retriedPaths.slice(0, 5).join(', ')}${validationOutcome.retriedPaths.length > 5 ? ' ...' : ''}`,
        ];
      }
      if (validationOutcome.retryFailedPaths.length > 0) {
        processed.warnings = [
          ...processed.warnings,
          `[EditValidation] Strict retry could not recover ${validationOutcome.retryFailedPaths.length} file(s): ${validationOutcome.retryFailedPaths.slice(0, 5).join(', ')}${validationOutcome.retryFailedPaths.length > 5 ? ' ...' : ''}`,
        ];
      }
    }

    storeDesignGenome(requestBody.projectId, extractDesignGenomeFromFiles(sanitizedFileMap));

    let responseFiles = toProcessedFiles(sanitizedFileMap) as ProcessedFile[];
    const styleIntentDetected =
      promptUnderstanding.styleRequest ||
      isStyleIntentPrompt(prompt) ||
      sectionPlan.semantic.intent === 'styling-only' ||
      (sectionPlan.semantic.intent === 'mixed' && sectionPlan.semantic.scope === 'global');
    let smartDiff = computeSmartDiff(contextualFiles, sanitizedFileMap);
    let styleAnchorDelta = computeStyleAnchorDelta(
      contextualFiles,
      sanitizedFileMap,
      [...smartDiff.added, ...smartDiff.updated]
    );
    if (effectiveGenerationMode === 'edit' && hasVisualAnchorInput) {
      if (smartDiff.changedCount > 0 || styleAnchorDelta > 0) {
        editTelemetry.record('anchor_hit', { projectId: requestBody.projectId });
      } else {
        editTelemetry.record('anchor_miss', { projectId: requestBody.projectId });
      }
    }
    let styleRecoveryApplied = false;
    if (
      effectiveGenerationMode === 'edit' &&
      styleIntentDetected &&
      (smartDiff.changedCount === 0 || styleAnchorDelta === 0)
    ) {
      const styleRecovery = applyDeterministicEditActions({
        prompt,
        files: sanitizedFileMap,
        forceStyleFallback: true,
      });
      if (styleRecovery.applied) {
        deterministicActions = [...new Set([...deterministicActions, ...styleRecovery.actions])];
        sanitizedFileMap = sanitizeProjectSourceFiles(styleRecovery.files);
        smartDiff = computeSmartDiff(contextualFiles, sanitizedFileMap);
        styleAnchorDelta = computeStyleAnchorDelta(
          contextualFiles,
          sanitizedFileMap,
          [...smartDiff.added, ...smartDiff.updated]
        );
        styleRecoveryApplied = smartDiff.changedCount > 0 && styleAnchorDelta > 0;
      }
    }
    if (suspiciousEditRedoTriggered) {
      const stillSuspiciousLargeDiff =
        smartDiff.changeRatio > 0.8 &&
        isSmallEditPrompt(promptForPlanning) &&
        !isLargeRedesignPrompt(promptForPlanning);
      console.log(
        `[EditDiffGuard] retryTriggered=true recovered=${suspiciousEditRedoRecovered} finalRatio=${smartDiff.changeRatio.toFixed(2)}`
      );
      if (stillSuspiciousLargeDiff) {
        processed.warnings = [
          ...processed.warnings,
          `[EditDiffGuard] Small edit still produced a large diff (${smartDiff.changeRatio.toFixed(2)}).`,
        ];
      }
    }
    const styleIntentWithoutAnchors = effectiveGenerationMode === 'edit' && !rollbackApplied && styleIntentDetected && styleAnchorDelta === 0;
    const blockedByScopeOnly =
      effectiveGenerationMode === 'edit' &&
      !rollbackApplied &&
      blockedByScopeCount > 0 &&
      smartDiff.changedCount === 0;
    const isNoOpGeneration =
      effectiveGenerationMode === 'edit' &&
      !rollbackApplied &&
      !blockedByScopeOnly &&
      (smartDiff.changedCount === 0 || styleIntentWithoutAnchors);
    const noOpReason = styleIntentWithoutAnchors
      ? 'Style-focused request did not produce concrete style token/class changes.'
      : 'No effective file changes were detected for this edit request.';

    let editOutcomeStatus: EditOutcomeStatus = 'applied';
    let editOutcomeMessage = styleRecoveryApplied
      ? 'Style-anchor recovery applied and persisted.'
      : 'Changes detected and applied.';
    if (effectiveGenerationMode === 'edit') {
      if (rollbackApplied) {
        if ((rollbackTrigger as string) === 'quality') {
          editOutcomeStatus = 'rolled_back_quality';
        } else if (rollbackTrigger === 'final_validation') {
          editOutcomeStatus = 'rolled_back_final_validation';
        } else {
          editOutcomeStatus = 'rolled_back_validation';
        }
        editOutcomeMessage = rollbackReason || 'Edit was rolled back to the previous stable project state.';
      } else if (blockedByScopeOnly) {
        editOutcomeStatus = 'blocked_scope';
        editOutcomeMessage = `Scope guard blocked ${blockedByScopeCount} generated file update(s) outside the allowed edit paths.`;
      } else if (isNoOpGeneration) {
        editOutcomeStatus = 'noop';
        editOutcomeMessage = noOpReason;
      }
    }
    if (effectiveGenerationMode === 'edit' && rollbackApplied) {
      editTelemetry.record('rollback', {
        projectId: requestBody.projectId,
        reason: rollbackTrigger || 'unknown',
        source: rollbackSource,
      });
    }
    if (effectiveGenerationMode === 'edit') {
      const changedCount = Number(smartDiff.changedCount || 0);
      const changedBase = Math.max(1, Object.keys(contextualFiles).length);
      const normalizedChange = Math.min(1, changedCount / changedBase);
      const anchorBonus = hasVisualAnchorInput && styleAnchorDelta > 0 ? 0.2 : 0;
      const rollbackPenalty = rollbackApplied ? 0.4 : 0;
      const noOpPenalty = isNoOpGeneration ? 0.4 : 0;
      const qualityScore = Math.max(0, Math.min(1, normalizedChange + anchorBonus - rollbackPenalty - noOpPenalty));
      editTelemetry.record('prompt_diff_quality', {
        projectId: requestBody.projectId,
        score: qualityScore,
        changedCount,
        styleAnchorDelta,
        rollbackApplied,
      });
    }
    responseFiles = toProcessedFiles(sanitizedFileMap) as ProcessedFile[];
    const snapshotWrite = projectSnapshotStore.write(
      requestBody.projectId,
      buildFileHashMap(sanitizedFileMap),
      sanitizedFileMap
    );
    console.log(
      `ðŸ“ˆ Smart diff: +${smartDiff.added.length} -${smartDiff.removed.length} ~${smartDiff.updated.length} ` +
      `| ratio=${smartDiff.changeRatio.toFixed(2)} | structural=${smartDiff.structuralChange}`
    );
    if (isNoOpGeneration) {
      console.log('ðŸŸ° No-op detected: edit request produced no effective file changes.');
    }
    if (blockedByScopeOnly) {
      console.log(`ðŸ”’ Scope-locked edit blocked ${blockedByScopeCount} out-of-scope file update(s).`);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 4. SUCCESS RESPONSE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    const partitionedProcessedErrors = partitionValidationErrorsForStability(processed.errors);
    const processedWarnOnlyMessages = partitionedProcessedErrors.warnings.map((error) => `[Validation/warn-only] ${error}`);
    processed.errors = partitionedProcessedErrors.blocking;
    if (processedWarnOnlyMessages.length > 0) {
      processed.warnings = [...processed.warnings, ...processedWarnOnlyMessages];
    }

    const qualityCriticalFindings = qualityGate.findings.filter((finding) => finding.severity === 'critical');
    const qualityBlockingMessages = qualityCriticalFindings
      .filter((finding) => isHardBlockingValidationError(finding.message))
      .map((finding) => `[Quality/critical] ${finding.message}`);
    const qualityWarnOnlyCriticalMessages = qualityCriticalFindings
      .filter((finding) => !isHardBlockingValidationError(finding.message))
      .map((finding) => `[Quality/warn-only] ${finding.message}`);
    if (qualityWarnOnlyCriticalMessages.length > 0) {
      processed.warnings = [...processed.warnings, ...qualityWarnOnlyCriticalMessages];
    }
    let combinedErrors = rollbackApplied
      ? []
      : [...processed.errors, ...qualityBlockingMessages, ...forcedCriticalErrors];
    const malformedStructuredOnly = combinedErrors.length > 0
      && combinedErrors.every((entry) => /LLM returned malformed structured JSON/i.test(String(entry || '')));
    if (malformedStructuredOnly && responseFiles.length > 0) {
      processed.warnings = [
        ...processed.warnings,
        'Structured-output fallback was used after malformed JSON; final code was recovered successfully.',
      ];
      combinedErrors = [];
    }
    if (repairStatus === 'failed' && repairLastAttemptFiles && repairLastAttemptFiles.length > 0) {
      responseFiles = repairLastAttemptFiles;
    }
    const shouldSurfaceRepairFailure = repairStatus === 'failed' && responseFiles.length > 0;
    const isSuccess = combinedErrors.length === 0 || shouldSurfaceRepairFailure;

    console.log(`${isSuccess ? 'âœ…' : 'âš ï¸'} Code generation & processing completed in ${duration}ms`);

    // Merge internal usage stats if available
    let finalRateLimit = (typeof requestRateLimit !== 'undefined') ? requestRateLimit : {};

    if ((req as any).usageStats) {
      // Prefer internal stats for "Account Quota" visibility
      finalRateLimit = {
        ...finalRateLimit,
        ...((req as any).usageStats), // limit, remaining, used, plan, etc.
        unknown: false // We now know the limits!
      };
    }

    const responseWarnings = buildResponseWarnings(processed.warnings, integrationWarnings);
    const responseErrors = buildResponseErrors(rollbackApplied, combinedErrors);
    const responseDependencies = collectProjectDependencies(sanitizedFileMap, processed.dependencies);
    const qualitySummary = buildQualitySummary({
      qualityGate,
      autoRepair,
      critique: orchestrationCritique,
    });

    const pipelinePayload = {
      mode: 'template+plan+assemble',
      path: routedPipelinePath,
      latencyMs: duration,
      generationMode: effectiveGenerationMode,
      templateId: composedTemplate.preset.id,
      selectedBlocks: composedTemplate.selectedBlocks.map((block) => block.id),
      plan: {
        projectType: resolvedProjectPlan.finalPlan.projectType,
        features: resolvedProjectPlan.finalPlan.features,
        pages: resolvedProjectPlan.finalPlan.pages.map((page) => page.path),
        repairs: resolvedProjectPlan.repairLog,
        dependencyExpansion: resolvedProjectPlan.expandedDependencies,
        valid: resolvedProjectPlan.validation.valid,
        warnings: resolvedProjectPlan.validation.warnings,
        errors: resolvedProjectPlan.validation.errors,
      },
      sectionDiff: {
        mode: sectionPlan.mode,
        structuralChange: sectionPlan.diff.structuralChange,
        targetedCategories: sectionPlan.diff.targetedCategories,
        semantic: {
          intent: sectionPlan.semantic.intent,
          scope: sectionPlan.semantic.scope,
          intensity: sectionPlan.semantic.intensity,
          confidence: sectionPlan.semantic.confidence,
          touchesStructure: sectionPlan.semantic.touchesStructure,
          reasons: sectionPlan.semantic.reasons,
        },
        added: sectionPlan.diff.added,
        removed: sectionPlan.diff.removed,
        unchanged: sectionPlan.diff.unchanged,
        allowAppUpdate: sectionPlan.allowAppUpdate,
        allowedUpdatePaths: sectionPlan.allowedUpdatePaths,
        validationTargetPath,
      },
      operations: parsedOperationsReport ? {
        total: parsedOperationsReport.totalOperations,
        applied: parsedOperationsReport.appliedOperations,
        unresolved: parsedOperationsReport.unresolvedOperations,
        unresolvedPreview: parsedOperationsReport.unresolved.slice(0, 5),
      } : undefined,
      smartDiff: {
        added: smartDiff.added,
        removed: smartDiff.removed,
        updated: smartDiff.updated,
        unchangedCount: smartDiff.unchangedCount,
        changedCount: smartDiff.changedCount,
        changeRatio: smartDiff.changeRatio,
        structuralChange: smartDiff.structuralChange,
        contentOnlyChange: smartDiff.contentOnlyChange,
        configChange: smartDiff.configChange,
        styleIntentDetected,
        styleAnchorDelta,
        styleRecoveryApplied,
      },
      snapshot: {
        currentId: snapshotWrite.current.id,
        previousId: snapshotWrite.previous?.id,
        createdAt: snapshotWrite.current.createdAt,
        projectId: snapshotWrite.current.projectId,
        fileCount: snapshotWrite.current.fileCount,
      },
      validation: validationBeforeRollback,
      rollback: {
        applied: rollbackApplied,
        reason: rollbackReason,
        source: rollbackSource,
        snapshotId: rollbackSnapshotId,
      },
      editOutcome: {
        status: editOutcomeStatus,
        message: editOutcomeMessage,
        blockedFileCount: blockedByScopeCount > 0 ? blockedByScopeCount : undefined,
      },
      tokenBudget: {
        provider: tokenBudget.provider,
        requestedMaxTokens: tokenBudget.requestedMaxTokens,
        generationMaxTokens: tokenBudget.generationMaxTokens,
        repairMaxTokens: tokenBudget.repairMaxTokens,
        repairAttempts: tokenBudget.repairAttempts,
        reason: tokenBudget.reason,
      },
      autoRepair,
      qualityGate: {
        pass: qualityGate.pass,
        overall: qualityGate.overall,
        visualScore: qualityGate.visual.score,
        accessibilityScore: qualityGate.accessibility.score,
        performanceScore: qualityGate.performance.score,
        criticalCount: qualityGate.findings.filter((finding) => finding.severity === 'critical').length,
        warningCount: qualityGate.findings.filter((finding) => finding.severity === 'warning').length,
        findings: qualityGate.findings,
      },
      qualitySummary,
      deterministicActions,
      contentPolish: contentPolishSummary,
      designGenome: {
        similarityToRecent: diversityAdvice.similarityToRecent,
        avoidTraits: diversityAdvice.avoidTraits,
        directive: diversityAdvice.directive,
      },
      promptUnderstanding: {
        source: promptUnderstanding.source,
        confidence: promptUnderstanding.confidence,
        scope: promptUnderstanding.scope,
        editScope: promptUnderstanding.editScope,
        styleRequest: promptUnderstanding.styleRequest,
        targetedCategories: promptUnderstanding.targetedCategories,
        impactedFiles: promptUnderstanding.impactedFiles,
        forbiddenFiles: promptUnderstanding.forbiddenFiles,
        forceAppUpdate: promptUnderstanding.forceAppUpdate,
        reasoning: promptUnderstanding.reasoning,
      },
      contextInjection: {
        selectedPaths: ragContextResult.selectedPaths,
        skippedPaths: ragContextResult.skippedPaths,
        truncatedPaths: ragContextResult.truncatedPaths,
        totalChars: ragContextResult.totalChars,
      },
      visualAnchor: {
        provided: Boolean(visualAnchorPrompt),
        nodeId: trimAnchorValue(editAnchor?.nodeId, 120) || undefined,
        selector: trimAnchorValue(editAnchor?.selector, 220) || undefined,
        domPath: trimAnchorValue(editAnchor?.domPath, 220) || undefined,
        routePath: trimAnchorValue(editAnchor?.routePath, 120) || undefined,
        sectionId: trimAnchorValue(editAnchor?.sectionId, 120) || undefined,
        sourceId: trimAnchorValue(editAnchor?.sourceId, 220) || undefined,
      },
      timingsMs: stageTimings as any,
      plannedCreate: filePlan.create.length,
      plannedUpdate: filePlan.update.length,
      templateFiles: Object.keys(templateFiles).length,
      llmContextFiles: Object.keys(scopedContextFiles).length,
      integrations: {
        supabase: {
          backendIntentDetected,
          connected: Boolean(supabaseIntegration?.connected),
          environment: supabaseIntegration?.environment || null,
          projectRef: supabaseIntegration?.projectRef || null,
          projectUrl: supabaseIntegration?.projectUrl || null,
          hasTestConnection: Boolean(supabaseIntegration?.hasTestConnection),
          hasLiveConnection: Boolean(supabaseIntegration?.hasLiveConnection),
        },
        github: {
          connected: githubConnected,
          username: githubIntegration?.username || null,
          repoUrl: githubIntegration?.repoUrl || null,
          lastSync: githubIntegration?.lastSync || null,
        },
      }
    };

    const needsDatabaseForResponse = Boolean(hydratedContextForResponse?.needsDatabase);
    const hydratedTableFallback = needsDatabaseForResponse
      ? normalizeDatabaseTables(
        Array.isArray(hydratedContextForResponse?.databaseTables)
          ? hydratedContextForResponse.databaseTables
          : inferDatabaseTablesFromPrompt(promptForPlanning)
      )
      : [];
    if (needsDatabaseForResponse && databaseTablesForResponse.length === 0 && hydratedTableFallback.length > 0) {
      databaseTablesForResponse = hydratedTableFallback;
    }
    if (
      !supabaseSchemaForResponse &&
      needsDatabaseForResponse &&
      databaseTablesForResponse.length > 0
    ) {
      supabaseSchemaForResponse = buildSupabaseSchemaFallback(databaseTablesForResponse);
    }

    const response = buildGenerateSuccessResponse({
      isSuccess,
      codeToProcess,
      responseFiles,
      responseDependencies,
      components: processed.components,
      responseErrors,
      responseWarnings,
      executionProviderHint,
      duration,
      processingTime: processed.metadata.processingTime,
      isNoOpGeneration,
      noOpReason,
      editOutcomeMessage,
      repairStatus,
      repairError,
      routedPipelinePath,
      hydratedContextForResponse,
      finalRateLimit,
      supabaseSchema: supabaseSchemaForResponse,
      databaseTables: databaseTablesForResponse,
      pipeline: pipelinePayload,
    }) as GenerateResponse;

    const estimatedInputTokens =
      estimateTokensFromText(generationPrompt) +
      estimateTokensFromText(generationSystemPrompt) +
      estimateTokensFromFiles(scopedContextFiles);
    const estimatedOutputTokens = estimateTokensFromText(codeToProcess);
    const responseErrorCategory = !isSuccess
      ? (qualityCriticalMessages.length > 0
        ? 'quality_gate'
        : (processed.errors.length > 0 ? 'validation_error' : 'pipeline_error'))
      : undefined;
    const fallbackApplied =
      Boolean((finalRateLimit as any)?.fallbackFrom) ||
      provider !== executionProviderHint;

    generateObservability.record({
      requestedProvider: toObservedProvider(provider),
      effectiveProvider: toObservedProvider(executionProviderHint),
      generationMode: effectiveGenerationMode,
      success: isSuccess,
      durationMs: duration,
      processingTimeMs: Number(processed.metadata.processingTime) || 0,
      fallbackApplied,
      errorCategory: responseErrorCategory,
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
    });

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 5. AUDIT LOGGING (Async - Fire & Forget)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // We log even if it failed? No, usually only success consumes quota, unless we want to track failures too.
    // Let's log success for now to track usage.

    if (effectiveUserId) {
      (async () => {
        try {
          // 0. Save Chat Messages (Persistence)
          const projectId = req.body.projectId; // Manually attached in frontend if available

          if (projectId) {
            // Save User Message
            await supabase.from('project_messages').insert({
              project_id: projectId,
              role: 'user',
              content: prompt // or enhanced prompt if desired, but raw prompt is better for history
            });

            // Save Assistant Message
            if (effectiveGenerationMode === 'edit' && editOutcomeStatus !== 'applied') {
              await supabase.from('project_messages').insert({
                project_id: projectId,
                role: 'assistant',
                content: `${editOutcomeStatus}: ${editOutcomeMessage}`
              });
            } else {
              await supabase.from('project_messages').insert({
                project_id: projectId,
                role: 'assistant',
                content: codeToProcess
              });
            }

            // Note: Saving the entire code in chat history might be heavy. 
            // Ideally we save a "Thinking Process" or "Code Generated" marker if the code is huge.
            // But for restoration, we need the content.

            if (effectiveGenerationMode === 'edit') {
              const editHistoryChangedFiles = Array.from(
                new Set([
                  ...editDiffChangedPaths,
                  ...smartDiff.added,
                  ...smartDiff.updated,
                  ...smartDiff.removed,
                  ...editValidationRevertedPaths,
                  ...editRetryRecoveredPaths,
                ].map((entry) => normalizeGeneratedPath(entry)).filter(Boolean))
              );
              const editHistoryClient = supabaseAdmin || supabase;
              const { error: editHistoryError } = await editHistoryClient
                .from('edit_history')
                .insert({
                  project_id: projectId,
                  instruction: editInstructionForContext || prompt,
                  edit_type: detectedEditType || 'feature-modify',
                  files_changed: editHistoryChangedFiles,
                });
              if (editHistoryError && !isMissingTableError(editHistoryError)) {
                console.warn('[EditHistory] Failed to insert edit history:', editHistoryError.message || editHistoryError);
              }
            }
          }

          // 0b. Save Knowledge Base Files (Persistence)
          if (knowledgeBase && knowledgeBase.length > 0) {
            for (const file of knowledgeBase) {
              // Check if file already exists for this project to avoid duplicates (silly simple check)
              // ideally we use upsert or check hash, but for now just insert

              // Better: Delete old one with same name if exists, or just append?
              // Let's just insert. User can clean up later or we add management UI.

              // Actually, let's treat "filename" as unique per project in our simple logic
              const { error: fileError } = await supabase
                .from('project_files')
                .upsert({
                  project_id: projectId,
                  filename: file.path,
                  content: file.content,
                  file_type: 'text/plain', // Assumption for now
                  size_bytes: file.content.length
                }, { onConflict: 'project_id, filename' });

              if (fileError) console.error('Failed to save knowledge file:', fileError);
            }
          }


          // 1. Update Token Usage in DB (if usageId exists from middleware)
          const usageId = (req as any).usageId;
          const projectUsageId = (req as any).projectUsageId;
          const tokensUsed = Math.ceil((codeToProcess?.length || 0) / 4); // Estimate output tokens

          if (usageId) {
            const { error: usageError } = await supabase.rpc('update_token_usage', {
              p_usage_id: usageId,
              p_tokens_used: tokensUsed
            });
            if (usageError) console.error('âš ï¸ Failed to update token usage:', usageError);
          }

          if (projectUsageId) {
            const { error: projectUsageError } = await supabase.rpc('update_project_token_usage', {
              p_usage_id: projectUsageId,
              p_tokens_used: tokensUsed
            });
            if (projectUsageError && !isMissingRpcError(projectUsageError)) {
              console.error('âš ï¸ Failed to update project token usage:', projectUsageError);
            }
          }

          // 2. Write Audit Log
          await supabase.from('audit_logs').insert({
            user_id: effectiveUserId,
            action: 'generate_code',
            details: {
              provider,
              requested_provider: provider,
              effective_provider: executionProviderHint,
              fallback_applied: fallbackApplied,
              model:
                provider === 'openai'
                  ? 'gpt-4o'
                  : provider === 'groq'
                    ? 'llama-4-maverick'
                    : provider === 'nvidia'
                      ? 'qwen3.5-397b-a17b'
                      : 'gemini-pro',
              tokens_input: Math.max(0, Math.round(estimatedInputTokens)),
              tokens_output: Math.max(0, Math.round(estimatedOutputTokens)),
              duration,
              success: isSuccess,
              prompt: String(prompt || '').slice(0, 320),
            }
          });

          const responseUsage = (response as any)?.usage || {};
          const usageTokens = Number(responseUsage?.total_tokens || responseUsage?.totalTokens || 0);
          const generationTokensUsed = Number.isFinite(usageTokens) && usageTokens > 0
            ? Math.round(usageTokens)
            : Math.max(0, Math.round(estimatedInputTokens + estimatedOutputTokens));

          const generationInsertPayload = {
            user_id: effectiveUserId,
            project_id: typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null,
            tokens_used: generationTokensUsed,
            provider: executionProviderHint,
            prompt_preview: String(prompt || '').slice(0, 100),
            pipeline: String(routedPipelinePath || 'deep'),
            latency_ms: Math.max(0, Math.round(Date.now() - startTime)),
          };

          const generationClient = supabaseAdmin || supabase;
          const { error: generationInsertError } = await generationClient
            .from('generations')
            .insert(generationInsertPayload);
          const generationTableMissing =
            (generationInsertError as any)?.code === 'PGRST205' ||
            (generationInsertError as any)?.code === '42P01' ||
            String((generationInsertError as any)?.message || '').toLowerCase().includes('does not exist');
          if (generationInsertError && !generationTableMissing) {
            console.warn('[Billing] Failed to insert generation usage row:', (generationInsertError as any)?.message || generationInsertError);
          }
        } catch (logError) {
          console.error('âš ï¸ Failed to write audit/persistence log:', logError);
        }
      })();
    }

    if (effectiveGenerationMode === 'edit') {
      editTelemetry.record('edit_outcome', {
        projectId: requestBody.projectId,
        outcome: editOutcomeStatus,
        duration: Date.now() - startTime
      });
      editTelemetry.recordLatency(Date.now() - startTime);
    }

    res.json(response);

  } catch (error: any) {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 5. ERROR HANDLING
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.error('âŒ Generation Error:', {
      message: sanitizeErrorForLog(error),
      status: Number(error?.status) || undefined,
      code: typeof error?.code === 'string' ? error.code : undefined,
      provider: typeof error?.provider === 'string' ? error.provider : undefined,
    });

    const duration = Date.now() - startTime;

    const isMalformedOutput =
      error.message?.includes('MALFORMED_STRUCTURED_OUTPUT') ||
      error.code === 'MALFORMED_STRUCTURED_OUTPUT';

    const classified = classifyProviderError(error, req.body?.provider);
    const { statusCode, payload } = buildGenerateErrorResponse({
      error,
      duration,
      requestedProvider: req.body?.provider,
      isMalformedOutput,
      classified,
    });

    const requestProvider = toObservedProvider(req.body?.provider);
    const requestMode = req.body?.generationMode === 'new' || req.body?.generationMode === 'edit'
      ? req.body.generationMode
      : (req.body?.files && Object.keys(req.body.files || {}).length > 0 ? 'edit' : 'unknown');
    const failureInputTokens =
      estimateTokensFromText(req.body?.prompt) +
      estimateTokensFromFiles(req.body?.files);

    generateObservability.record({
      requestedProvider: requestProvider,
      effectiveProvider: requestProvider,
      generationMode: requestMode,
      success: false,
      durationMs: duration,
      processingTimeMs: 0,
      fallbackApplied: false,
      errorCategory: isMalformedOutput ? 'malformed_output' : classified.category,
      inputTokens: failureInputTokens,
      outputTokens: 0,
    });

    res.status(statusCode).json(payload);
  }
});

router.post('/generate/visual-apply', async (req: Request, res: Response) => {
  try {
    const requestFiles = req.body?.files;
    const requestOperations = req.body?.operations;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    const verify = req.body?.verify !== false;
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : '';
    const primaryPathRaw = typeof req.body?.primaryPath === 'string' ? req.body.primaryPath : '';

    if (!requestFiles || typeof requestFiles !== 'object' || Array.isArray(requestFiles)) {
      return res.status(400).json({
        success: false,
        error: 'files must be an object map',
        code: 'INVALID_VISUAL_INPUT_FILES',
      });
    }

    if (!Array.isArray(requestOperations) || requestOperations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'operations must be a non-empty array',
        code: 'INVALID_VISUAL_INPUT_OPERATIONS',
      });
    }

    const baseFiles = sanitizeProjectSourceFiles(
      Object.entries(requestFiles as Record<string, unknown>).reduce((acc: Record<string, string>, [path, content]) => {
        if (typeof path !== 'string' || typeof content !== 'string') return acc;
        acc[path] = content;
        return acc;
      }, {})
    );

    if (Object.keys(baseFiles).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid files to patch',
        code: 'EMPTY_VISUAL_FILES',
      });
    }

    const normalizedPrimaryPath = normalizeGeneratedPath(
      primaryPathRaw ||
      (baseFiles['src/App.tsx'] ? 'src/App.tsx' : Object.keys(baseFiles)[0])
    );

    const parsedOperations: AstPatchOperation[] = [];
    const preflightFailures: Array<{ file: string; selector: string; reason: string }> = [];
    for (const raw of requestOperations as VisualApplyOperation[]) {
      if (!raw || typeof raw !== 'object') continue;

      const selector = typeof raw.selector === 'string' ? raw.selector.trim() : '';
      const explicitSourceId = typeof raw.sourceId === 'string' ? raw.sourceId.trim() : '';
      const sourceId = explicitSourceId || extractSourceIdFromSelector(selector) || '';
      const sourceFile = sourceId ? resolveSourceFileFromSourceId(sourceId) : null;
      const requestedFile = typeof raw.file === 'string' ? normalizeGeneratedPath(raw.file.trim()) : '';
      const fallbackFile = normalizeGeneratedPath(normalizedPrimaryPath || 'src/App.tsx');
      const file = requestedFile || sourceFile || fallbackFile;
      const normalizedSelector = selector || `[data-source-id="${sourceId.replace(/"/g, '\\"')}"]`;

      if (!selector && !sourceId) {
        preflightFailures.push({
          file,
          selector: '',
          reason: 'selector or sourceId is required',
        });
        continue;
      }

      if (!sourceId || !sourceFile) {
        preflightFailures.push({
          file,
          selector: normalizedSelector,
          reason: 'sourceId must be a deterministic "file:line:col" anchor',
        });
        continue;
      }

      if (file !== sourceFile) {
        preflightFailures.push({
          file,
          selector: normalizedSelector,
          reason: `sourceId target "${sourceFile}" does not match operation file "${file}"`,
        });
        continue;
      }

      if (raw.op === 'replace_text') {
        if (typeof raw.text !== 'string') continue;
        parsedOperations.push({
          op: 'replace_text',
          file,
          selector: normalizedSelector,
          sourceId,
          text: raw.text,
        });
        continue;
      }

      if (raw.op === 'add_class' || raw.op === 'remove_class') {
        const classes = Array.isArray(raw.classes)
          ? raw.classes.map((entry) => String(entry).trim()).filter(Boolean)
          : [];
        if (classes.length === 0) continue;
        parsedOperations.push({
          op: raw.op,
          file,
          selector: normalizedSelector,
          sourceId,
          classes,
        });
        continue;
      }

      if (raw.op === 'set_prop') {
        if (typeof raw.prop !== 'string' || raw.prop.trim().length === 0 || typeof raw.value !== 'string') continue;
        parsedOperations.push({
          op: 'set_prop',
          file,
          selector: normalizedSelector,
          sourceId,
          prop: raw.prop.trim(),
          value: raw.value,
        });
        continue;
      }

      if (raw.op === 'remove_prop') {
        if (typeof raw.prop !== 'string' || raw.prop.trim().length === 0) continue;
        parsedOperations.push({
          op: 'remove_prop',
          file,
          selector: normalizedSelector,
          sourceId,
          prop: raw.prop.trim(),
        });
      }
    }

    if (parsedOperations.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No valid deterministic visual operations were provided',
        code: 'VISUAL_INVALID_TARGETS',
        patch: {
          total: preflightFailures.length,
          applied: 0,
          failed: preflightFailures.length,
          changedPaths: [],
          failedReasons: preflightFailures,
        },
      });
    }

    const totalOperationCount = parsedOperations.length + preflightFailures.length;

    const beforeFiles = { ...baseFiles };
    const nextFiles = { ...baseFiles };
    const opsByFile = new Map<string, AstPatchOperation[]>();
    parsedOperations.forEach((op) => {
      const file = normalizeGeneratedPath(op.file || normalizedPrimaryPath || 'src/App.tsx');
      if (!opsByFile.has(file)) opsByFile.set(file, []);
      opsByFile.get(file)!.push({ ...op, file });
    });

    const failedReasons: Array<{ file: string; selector: string; reason: string }> = [...preflightFailures];
    let appliedCount = 0;
    let failedCount = preflightFailures.length;

    for (const [file, ops] of opsByFile.entries()) {
      const source = nextFiles[file];
      if (typeof source !== 'string') {
        failedCount += ops.length;
        ops.forEach((op) => {
          failedReasons.push({
            file,
            selector: op.selector,
            reason: `Target file "${file}" not found`,
          });
          editTelemetry.record('ast_patch_failed', { projectId, source: 'visual_apply', file });
        });
        continue;
      }

      const result = applyAstPatches(source, ops);
      nextFiles[file] = result.code;
      appliedCount += result.applied.length;
      failedCount += result.failed.length;

      result.applied.forEach(() => {
        editTelemetry.record('ast_patch_applied', { projectId, source: 'visual_apply', file });
      });
      result.failed.forEach((failure) => {
        failedReasons.push({
          file,
          selector: failure.patch.selector,
          reason: failure.reason,
        });
        editTelemetry.record('ast_patch_failed', { projectId, source: 'visual_apply', file });
      });
    }

    let changedPaths = Array.from(new Set([
      ...Object.keys(beforeFiles),
      ...Object.keys(nextFiles),
    ])).filter((path) => beforeFiles[path] !== nextFiles[path]);

    const stylePromptDetected = isStylePrompt(prompt);
    let styleRetryApplied = false;

    if (stylePromptDetected && changedPaths.length === 0) {
      const retrySeed = parsedOperations.find((op) =>
        (typeof op.sourceId === 'string' && op.sourceId.trim().length > 0)
        || (typeof op.selector === 'string' && op.selector.trim().length > 0)
      );
      if (retrySeed) {
        const retryFile = normalizeGeneratedPath(retrySeed.file || normalizedPrimaryPath || 'src/App.tsx');
        const retrySource = nextFiles[retryFile];
        const retrySelector = (
          (typeof retrySeed.selector === 'string' ? retrySeed.selector.trim() : '')
          || (retrySeed.sourceId ? `[data-source-id="${retrySeed.sourceId.replace(/"/g, '\\"')}"]` : '')
        );
        if (typeof retrySource === 'string') {
          const retryResult = applyAstPatches(retrySource, [{
            op: 'add_class',
            file: retryFile,
            selector: retrySelector,
            sourceId: retrySeed.sourceId,
            classes: ['ring-1'],
          }]);
          if (retryResult.applied.length > 0) {
            nextFiles[retryFile] = retryResult.code;
            styleRetryApplied = true;
            appliedCount += retryResult.applied.length;
            failedCount += retryResult.failed.length;
            retryResult.applied.forEach(() => {
              editTelemetry.record('ast_patch_applied', { projectId, source: 'visual_style_retry', file: retryFile });
            });
            retryResult.failed.forEach((failure) => {
              failedReasons.push({
                file: retryFile,
                selector: failure.patch.selector,
                reason: failure.reason,
              });
              editTelemetry.record('ast_patch_failed', { projectId, source: 'visual_style_retry', file: retryFile });
            });
          }
        }
      }
      changedPaths = Array.from(new Set([
        ...Object.keys(beforeFiles),
        ...Object.keys(nextFiles),
      ])).filter((path) => beforeFiles[path] !== nextFiles[path]);
    }

    if (stylePromptDetected) {
      const runtimeChangedPaths = changedPaths.filter((path) => isRuntimeUiSourcePath(path));
      const styleBefore = runtimeChangedPaths.map((path) => beforeFiles[path] || '').join('\n');
      const styleAfter = runtimeChangedPaths.map((path) => nextFiles[path] || '').join('\n');
      const stylePolicy = evaluateStylePolicy(prompt, styleBefore, styleAfter);
      if (!stylePolicy.compliant) {
        return res.status(422).json({
          success: false,
          error: 'Style prompt produced no concrete class/token diff',
          code: 'STYLE_RETRY_REQUIRED',
          patch: {
            total: totalOperationCount,
            applied: appliedCount,
            failed: failedCount,
            changedPaths,
            failedReasons,
          },
          style: {
            promptDetected: true,
            retryApplied: styleRetryApplied,
            violations: stylePolicy.violations,
          },
        });
      }
    }

    if (appliedCount === 0 || changedPaths.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No visual operations could be applied',
        code: 'VISUAL_NO_OP',
        patch: {
          total: totalOperationCount,
          applied: appliedCount,
          failed: failedCount,
          changedPaths,
          failedReasons,
        },
      });
    }

    const verifyPath = (
      (normalizedPrimaryPath && nextFiles[normalizedPrimaryPath] ? normalizedPrimaryPath : '') ||
      (nextFiles['src/App.tsx'] ? 'src/App.tsx' : '') ||
      Object.keys(nextFiles)[0]
    );

    let verifyResult: {
      pass: boolean;
      errorCount: number;
      warningCount: number;
      errors: string[];
      warnings: string[];
      qualityPass: boolean;
      qualityCriticalCount: number;
      qualityFindings: any[];
      checkedPaths: string[];
    } | undefined;

    if (verify) {
      const verifyTargets = Array.from(new Set([
        ...changedPaths.filter((path) => isRuntimeUiSourcePath(path) && typeof nextFiles[path] === 'string'),
        verifyPath,
        'src/App.tsx',
      ])).filter((path) => isRuntimeUiSourcePath(path) && typeof nextFiles[path] === 'string');

      const checkedPaths: string[] = [];
      const verifyErrors: string[] = [];
      const verifyWarnings: string[] = [];

      for (const targetPath of verifyTargets) {
        const source = nextFiles[targetPath];
        if (typeof source !== 'string') continue;
        const processed = await codeProcessor.process(source, targetPath, {
          validate: true,
          bundle: true,
        });
        checkedPaths.push(targetPath);
        verifyErrors.push(...processed.errors.map((entry) => `[${targetPath}] ${entry}`));
        verifyWarnings.push(...processed.warnings.map((entry) => `[${targetPath}] ${entry}`));
      }

      const qualityGate = await evaluateQualityGates({
        files: nextFiles,
        primaryPath: verifyPath,
        prompt: prompt || 'visual edit verification',
      });
      const qualityCriticalCount = qualityGate.findings.filter((finding) => finding.severity === 'critical').length;
      const verifyPass = verifyErrors.length === 0 && qualityCriticalCount === 0;

      verifyResult = {
        pass: verifyPass,
        errorCount: verifyErrors.length,
        warningCount: verifyWarnings.length,
        errors: verifyErrors,
        warnings: verifyWarnings,
        qualityPass: qualityGate.pass,
        qualityCriticalCount,
        qualityFindings: qualityGate.findings,
        checkedPaths,
      };

      if (!verifyPass) {
        return res.status(422).json({
          success: false,
          error: 'Visual patch failed verification',
          code: 'VISUAL_VERIFY_FAILED',
          patch: {
            total: totalOperationCount,
            applied: appliedCount,
            failed: failedCount,
            changedPaths,
            failedReasons,
          },
          diff: {
            changes: changedPaths.map((path) => ({
              path,
              before: beforeFiles[path] || '',
              after: nextFiles[path] || '',
            })),
          },
          verify: verifyResult,
        });
      }
    }

    const snapshot = projectId
      ? projectSnapshotStore.write(projectId, buildFileHashMap(nextFiles), nextFiles, 'visual-apply')
      : null;

    return res.json({
      success: true,
      files: toProcessedFiles(nextFiles),
      patch: {
        total: totalOperationCount,
        applied: appliedCount,
        failed: failedCount,
        changedPaths,
        failedReasons,
      },
      diff: {
        changes: changedPaths.map((path) => ({
          path,
          before: beforeFiles[path] || '',
          after: nextFiles[path] || '',
        })),
      },
      verify: verifyResult,
      style: {
        promptDetected: stylePromptDetected,
        retryApplied: styleRetryApplied,
      },
      snapshot: snapshot
        ? {
          id: snapshot.current.id,
          createdAt: snapshot.current.createdAt,
          fileCount: snapshot.current.fileCount,
        }
        : undefined,
    });
  } catch (error: any) {
    console.error('Visual apply endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Visual apply failed',
      code: 'VISUAL_APPLY_ERROR',
    });
  }
});

router.post('/generate/verify', async (req: Request, res: Response) => {
  try {
    const requestFiles = req.body?.files;
    const primaryPathRaw = typeof req.body?.primaryPath === 'string' ? req.body.primaryPath : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';

    if (!requestFiles || typeof requestFiles !== 'object' || Array.isArray(requestFiles)) {
      return res.status(400).json({
        success: false,
        error: 'files must be an object map',
        code: 'INVALID_VERIFY_INPUT',
      });
    }

    const normalizedFiles = sanitizeProjectSourceFiles(
      Object.entries(requestFiles as Record<string, unknown>).reduce((acc: Record<string, string>, [path, content]) => {
        if (typeof path !== 'string' || typeof content !== 'string') return acc;
        acc[path] = content;
        return acc;
      }, {})
    );

    if (Object.keys(normalizedFiles).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid files to verify',
        code: 'EMPTY_VERIFY_FILES',
      });
    }

    const primaryPath = (
      (primaryPathRaw && normalizedFiles[primaryPathRaw] ? primaryPathRaw : '') ||
      (normalizedFiles['src/App.tsx'] ? 'src/App.tsx' : '') ||
      (normalizedFiles['App.tsx'] ? 'App.tsx' : '') ||
      Object.keys(normalizedFiles)[0]
    );
    const primaryCode = normalizedFiles[primaryPath] || '';

    const processed = await codeProcessor.process(primaryCode, primaryPath.replace(/^src\//, '') || 'App.tsx', {
      validate: true,
      bundle: true,
    });

    const qualityGate = await evaluateQualityGates({
      files: normalizedFiles,
      primaryPath,
      prompt: prompt || 'verify project quality',
    });

    return res.json({
      success: true,
      validation: {
        pass: processed.errors.length === 0,
        errorCount: processed.errors.length,
        warningCount: processed.warnings.length,
        errors: processed.errors,
        warnings: processed.warnings,
      },
      qualityGate: {
        pass: qualityGate.pass,
        overall: qualityGate.overall,
        visualScore: qualityGate.visual.score,
        accessibilityScore: qualityGate.accessibility.score,
        performanceScore: qualityGate.performance.score,
        criticalCount: qualityGate.findings.filter((finding) => finding.severity === 'critical').length,
        warningCount: qualityGate.findings.filter((finding) => finding.severity === 'warning').length,
        findings: qualityGate.findings,
      },
      metadata: {
        primaryPath,
        fileCount: Object.keys(normalizedFiles).length,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Verify endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Verification failed',
      code: 'VERIFY_ERROR',
    });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /api/generate/info
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

router.get('/generate/templates', (_req: Request, res: Response) => {
  const catalog = getTemplateCatalog();
  res.json({
    success: true,
    ...catalog,
  });
});

router.get('/generate/snapshots/:projectId', (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  const limitRaw = Number(req.query.limit || 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;
  const history = projectSnapshotStore.getHistory(projectId, limit).map((snapshot) => ({
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    fileCount: snapshot.fileCount,
    projectId: snapshot.projectId,
    label: snapshot.label,
  }));

  res.json({
    success: true,
    projectId,
    snapshots: history,
  });
});

router.get('/generate/telemetry', (req: Request, res: Response) => {
  const windowMsRaw = Number(req.query.windowMs || 3600_000);
  const windowMs = Number.isFinite(windowMsRaw) ? Math.max(60_000, windowMsRaw) : 3600_000;

  const metrics = editTelemetry.getMetrics(windowMs);

  res.json({
    success: true,
    metrics,
  });
});

router.get('/generate/observability', (req: Request, res: Response) => {
  const windowMsRaw = Number(req.query.windowMs || 3600_000);
  const windowMs = Number.isFinite(windowMsRaw) ? Math.max(60_000, windowMsRaw) : 3600_000;
  const metrics = generateObservability.getMetrics(windowMs);

  res.json({
    success: true,
    metrics,
  });
});

router.get('/generate/slo', (req: Request, res: Response) => {
  const windowMsRaw = Number(req.query.windowMs || 3600_000);
  const windowMs = Number.isFinite(windowMsRaw) ? Math.max(60_000, windowMsRaw) : 3600_000;
  const slo = generateObservability.getSloStatus(windowMs);

  res.json({
    success: true,
    slo,
  });
});

router.post('/generate/rollback', (req: Request, res: Response) => {
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : '';
  const snapshotId = typeof req.body?.snapshotId === 'string' ? req.body.snapshotId : '';

  if (!projectId || !snapshotId) {
    return res.status(400).json({
      success: false,
      error: 'projectId and snapshotId are required',
      code: 'INVALID_ROLLBACK_REQUEST',
    });
  }

  const snapshot = projectSnapshotStore.getById(projectId, snapshotId);
  if (!snapshot || !snapshot.files) {
    return res.status(404).json({
      success: false,
      error: 'Snapshot not found or has no file payload',
      code: 'SNAPSHOT_NOT_FOUND',
    });
  }

  const files = toProcessedFiles(snapshot.files) as ProcessedFile[];
  return res.json({
    success: true,
    projectId,
    snapshotId: snapshot.id,
    files,
    metadata: {
      createdAt: snapshot.createdAt,
      fileCount: snapshot.fileCount,
    },
  });
});

router.get('/generate/info', (_req: Request, res: Response) => {
  res.json({
    endpoint: '/api/generate',
    method: 'POST',
    description: 'Generate and process React code with LLM',
    requiredFields: ['provider', 'prompt'],
    optionalFields: ['mode', 'errorContext', 'generationMode', 'templateId', 'temperature', 'maxTokens', 'validate', 'bundle', 'featureFlags'],
    templatesEndpoint: '/api/generate/templates',
    providers: ['gemini', 'groq', 'openai', 'nvidia'],
    features: [
      'Code generation with Gemini/Groq/OpenAI/NVIDIA',
      'TypeScript validation',
      'esbuild bundling',
      'Dependency extraction',
      'Component detection',
      'Automatic package.json generation',
      'HTML scaffold generation'
    ]
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /api/generate/stream (Future)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

router.post('/generate/stream', async (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Streaming not yet implemented',
    message: 'Use /api/generate for now'
  });
});

export default router;
