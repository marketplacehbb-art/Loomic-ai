/**
 * Express API Route: POST /api/generate
 * Handles LLM code generation requests with code processing
 */

import { Router, Request, Response } from 'express';
import { llmManager } from './llm/manager.js';
import { codeProcessor, type ProcessedCode } from '../utils/code-processor.js';
import { supabase } from '../lib/supabase.js';
import { validateRequest, generateSchema } from '../middleware/validation.js';
import { getBaseTemplateFiles } from '../ai/project-pipeline/template-base.js';
import { createFilePlan, filterFilesForLLMContext } from '../ai/project-pipeline/file-planner.js';
import { assembleProjectFiles, toProcessedFiles } from '../ai/project-pipeline/project-assembler.js';
import {
  applySectionUpdateGuard,
  createSectionRegenerationPlan,
  filterFilesForSectionContext,
  type PromptIntentHint
} from '../ai/project-pipeline/section-regeneration.js';
import { buildFileHashMap, computeSmartDiff } from '../ai/project-pipeline/smart-diff.js';
import { projectSnapshotStore } from '../ai/project-pipeline/snapshot-store.js';
import { buildStyleRetryPrompt, evaluateStylePolicy, isStylePrompt } from '../ai/project-pipeline/style-policy.js';
import { evaluateLibraryQuality } from '../ai/project-pipeline/library-quality-gate.js';
import { editTelemetry } from '../ai/project-pipeline/edit-telemetry.js';
import { getFeatureFlagsForRequest as getRequestFeatureFlags, type FeatureFlags } from '../config/feature-flags.js';
import { parseLLMOutput, sanitizeGeneratedModuleCode, type ParsedLLMOutput } from '../ai/project-pipeline/llm-response-parser.js';
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

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
// Helper: Timeout wrapper for async operations
// ═══════════════════════════════════════════════════════════════════════

const TIMEOUT_MS = 120000; // 2 minutes timeout

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = TIMEOUT_MS): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  });
}

function buildEditModeContextPrompt(
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

function trimAnchorValue(value: unknown, maxLength: number = 180): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function buildVisualAnchorPrompt(anchor: GenerateRequest['editAnchor']): string {
  if (!anchor || typeof anchor !== 'object') return '';

  const lines: string[] = [];
  const nodeId = trimAnchorValue(anchor.nodeId, 120);
  const selector = trimAnchorValue(anchor.selector, 220);
  const domPath = trimAnchorValue(anchor.domPath, 220);
  const sectionId = trimAnchorValue(anchor.sectionId, 120);
  const routePath = trimAnchorValue(anchor.routePath, 120);
  const tagName = trimAnchorValue(anchor.tagName, 60);
  const className = trimAnchorValue(anchor.className, 180);
  const elementId = trimAnchorValue(anchor.id, 120);
  const role = trimAnchorValue(anchor.role, 60);
  const href = trimAnchorValue(anchor.href, 180);
  const innerText = trimAnchorValue(anchor.innerText, 200);
  const sourceId = trimAnchorValue(anchor.sourceId, 220);

  if (nodeId) lines.push(`- nodeId: ${nodeId}`);
  if (selector) lines.push(`- selector: ${selector}`);
  if (domPath) lines.push(`- domPath: ${domPath}`);
  if (sectionId) lines.push(`- sectionId: ${sectionId}`);
  if (routePath) lines.push(`- routePath: ${routePath}`);
  if (tagName) lines.push(`- tagName: ${tagName}`);
  if (className) lines.push(`- className: ${className}`);
  if (elementId) lines.push(`- id: ${elementId}`);
  if (role) lines.push(`- role: ${role}`);
  if (href) lines.push(`- href: ${href}`);
  if (innerText) lines.push(`- text: ${innerText}`);
  if (sourceId) lines.push(`- sourceId: ${sourceId}`);

  if (lines.length === 0) return '';

  return `Visual edit target (authoritative):
${lines.join('\n')}
Treat this as the primary edit anchor. Apply a minimal local diff around this target before considering global rewrites.
If sourceId is available, prefer selector-based edits with [data-source-id="..."].`;
}

const SUPABASE_BACKEND_INTENT_KEYWORDS = [
  'supabase',
  'backend',
  'fullstack',
  'full-stack',
  'api',
  'server',
  'database',
  'db',
  'postgres',
  'sql',
  'table',
  'auth',
  'authentication',
  'login',
  'signup',
  'register',
  'user account',
  'storage',
  'upload',
  'bucket',
  'realtime',
  'edge function',
  'admin panel',
];

function detectBackendIntent(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const normalized = prompt.toLowerCase();
  return SUPABASE_BACKEND_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildSupabaseIntegrationPrompt(
  integration: SupabaseIntegrationContext | null | undefined,
  backendIntentDetected: boolean
): string {
  const connected = Boolean(integration && typeof integration === 'object' && integration.connected);
  const environment =
    integration && typeof integration === 'object' && (integration.environment === 'test' || integration.environment === 'live')
      ? integration.environment
      : null;
  const projectRef =
    integration && typeof integration === 'object' && typeof integration.projectRef === 'string' && integration.projectRef.trim().length > 0
      ? integration.projectRef.trim()
      : null;
  const hasTestConnection = Boolean(integration && typeof integration === 'object' && integration.hasTestConnection);
  const hasLiveConnection = Boolean(integration && typeof integration === 'object' && integration.hasLiveConnection);

  const lines = [
    'Supabase integration context:',
    `- connected: ${connected ? 'yes' : 'no'}`,
    `- active_environment: ${environment || 'none'}`,
    `- has_test_connection: ${hasTestConnection ? 'yes' : 'no'}`,
    `- has_live_connection: ${hasLiveConnection ? 'yes' : 'no'}`,
    `- project_ref: ${projectRef || 'none'}`,
  ];

  if (connected && environment) {
    lines.push(
      'If user intent needs backend/auth/data, prefer Supabase-compatible implementation (auth, tables, storage, RLS-safe patterns).',
      'Do not invent non-existing env vars. Use placeholders only where project secrets are needed.'
    );
  } else if (backendIntentDetected) {
    lines.push(
      'Backend/fullstack intent detected but Supabase is not connected.',
      'Generate connection-ready code scaffolding and clear TODO placeholders instead of pretending a live backend is already configured.'
    );
  }

  return lines.join('\n');
}

function normalizeGeneratedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function extractSourceIdFromSelector(selector: string): string | null {
  if (typeof selector !== 'string') return null;
  const trimmed = selector.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\[data-source-id=(?:"([^"]+)"|'([^']+)')\]$/);
  if (!match) return null;
  const sourceId = (match[1] || match[2] || '').trim();
  return sourceId || null;
}

function resolveSourceFileFromSourceId(sourceId: string): string | null {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  parts.pop();
  parts.pop();
  const candidate = normalizeGeneratedPath(parts.join(':').trim());
  if (!candidate) return null;
  if (!/\.(tsx|ts|jsx|js)$/.test(candidate)) return null;
  return candidate;
}

function isRuntimeUiSourcePath(path: string): boolean {
  const normalized = normalizeGeneratedPath(path);
  if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) return false;
  if (!normalized.startsWith('src/')) return false;
  if (/\.config\.(ts|js|mjs|cjs)$/.test(normalized)) return false;
  if (normalized.includes('/__tests__/') || normalized.includes('/tests/')) return false;
  return true;
}

function isEditProtectedRootFile(path: string): boolean {
  const normalized = normalizeGeneratedPath(path);
  const protectedFiles = new Set([
    '.gitignore',
    'README.md',
    'index.html',
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'src/main.tsx',
    'src/vite-env.d.ts',
  ]);
  return protectedFiles.has(normalized);
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

type SupportedProvider = 'gemini' | 'deepseek' | 'openai';

function isSupportedProvider(value: unknown): value is SupportedProvider {
  return value === 'gemini' || value === 'deepseek' || value === 'openai';
}

interface TokenBudgetDecision {
  provider: SupportedProvider;
  requestedMaxTokens?: number;
  generationMaxTokens: number;
  repairMaxTokens: number;
  repairAttempts: number;
  reason: string;
}

interface AutoRepairAttemptLog {
  attempt: number;
  beforeErrors: number;
  afterErrors: number;
  status: 'improved' | 'resolved' | 'aborted' | 'failed';
  reason?: string;
}

interface AutoRepairSummary {
  enabled: boolean;
  attempted: boolean;
  applied: boolean;
  maxAttempts: number;
  attemptsExecuted: number;
  initialErrorCount: number;
  finalErrorCount: number;
  abortedReason?: string;
  logs: AutoRepairAttemptLog[];
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

interface PromptUnderstandingResult {
  source: 'ai' | 'fallback';
  confidence: number;
  scope: 'section' | 'global';
  targetedCategories: BlockCategory[];
  forceAppUpdate: boolean;
  styleRequest: boolean;
  reasoning: string;
}

const PROMPT_UNDERSTANDING_CATEGORIES: BlockCategory[] = [
  'navbar',
  'banner',
  'hero',
  'features',
  'testimonials',
  'team',
  'timeline',
  'blog',
  'gallery',
  'ecommerce',
  'social-proof',
  'pricing',
  'cta',
  'faq',
  'contact',
  'footer',
  'dashboard',
  'sidebar',
  'auth',
  'stats',
  'chart',
  'modal',
];

function normalizePromptUnderstandingCategory(input: string): BlockCategory | null {
  const value = input.toLowerCase().trim();
  if (PROMPT_UNDERSTANDING_CATEGORIES.includes(value as BlockCategory)) {
    return value as BlockCategory;
  }
  if (/header|menu|navigation|brand|logo/.test(value)) return 'navbar';
  if (/hero|headline/.test(value)) return 'hero';
  if (/feature|benefit|section/.test(value)) return 'features';
  if (/social proof/.test(value)) return 'social-proof';
  if (/testimonial|review/.test(value)) return 'testimonials';
  if (/team|about/.test(value)) return 'team';
  if (/timeline|roadmap|steps/.test(value)) return 'timeline';
  if (/blog|article|news/.test(value)) return 'blog';
  if (/gallery|portfolio|showcase/.test(value)) return 'gallery';
  if (/shop|product|store|ecommerce/.test(value)) return 'ecommerce';
  if (/cta|call to action/.test(value)) return 'cta';
  if (/faq|question|help/.test(value)) return 'faq';
  if (/contact|kontakt|form/.test(value)) return 'contact';
  if (/banner|announcement/.test(value)) return 'banner';
  if (/price|plan/.test(value)) return 'pricing';
  if (/footer|legal/.test(value)) return 'footer';
  if (/dashboard|admin/.test(value)) return 'dashboard';
  if (/sidebar/.test(value)) return 'sidebar';
  if (/auth|login|register/.test(value)) return 'auth';
  if (/stat|kpi|metric/.test(value)) return 'stats';
  if (/chart|graph|report/.test(value)) return 'chart';
  if (/modal|dialog|popup/.test(value)) return 'modal';
  return null;
}

function buildPromptUnderstandingFallback(prompt: string): PromptUnderstandingResult {
  const lower = prompt.toLowerCase();
  const globalStyleSignal = /(hintergrund|background|theme|palette|farben|farbe|gold|golden|style|styling|design)/.test(lower);
  const styleSignal = /(hintergrund|background|theme|palette|farben|farbe|gold|golden|style|styling|design|schöner|schoener|modern|premium|elegant)/.test(lower);
  const explicitGlobalSignal = /(ganze seite|gesamte seite|Ã¼berall|ueberall|global|all pages|whole page)/.test(lower);
  const scope: 'section' | 'global' = (globalStyleSignal || explicitGlobalSignal) ? 'global' : 'section';
  const forceAppUpdate = scope === 'global';
  const targetedCategories: BlockCategory[] = [];
  if (/nav|navbar|menu|header/.test(lower)) targetedCategories.push('navbar');
  if (/banner|announcement/.test(lower)) targetedCategories.push('banner');
  if (/hero|headline/.test(lower)) targetedCategories.push('hero');
  if (/feature|features/.test(lower)) targetedCategories.push('features');
  if (/testimonial|review/.test(lower)) targetedCategories.push('testimonials');
  if (/social proof/.test(lower)) targetedCategories.push('social-proof');
  if (/team|about/.test(lower)) targetedCategories.push('team');
  if (/timeline|roadmap|steps/.test(lower)) targetedCategories.push('timeline');
  if (/blog|article|news/.test(lower)) targetedCategories.push('blog');
  if (/gallery|portfolio|showcase/.test(lower)) targetedCategories.push('gallery');
  if (/shop|store|product|ecommerce/.test(lower)) targetedCategories.push('ecommerce');
  if (/cta|call to action/.test(lower)) targetedCategories.push('cta');
  if (/faq|question|help/.test(lower)) targetedCategories.push('faq');
  if (/contact|kontakt|form/.test(lower)) targetedCategories.push('contact');
  if (/pricing|preise|price/.test(lower)) targetedCategories.push('pricing');
  if (/footer/.test(lower)) targetedCategories.push('footer');

  return {
    source: 'fallback',
    confidence: 0.45,
    scope,
    forceAppUpdate,
    styleRequest: styleSignal,
    targetedCategories: [...new Set(targetedCategories)],
    reasoning: 'Keyword fallback heuristic',
  };
}

async function inferPromptUnderstandingWithAI(input: {
  provider: SupportedProvider;
  generationMode: 'new' | 'edit';
  prompt: string;
  currentFiles: Record<string, string>;
}): Promise<PromptUnderstandingResult> {
  const fallback = buildPromptUnderstandingFallback(input.prompt);

  const fileHints = Object.keys(input.currentFiles || {})
    .map((path) => path.replace(/\\/g, '/'))
    .slice(0, 20)
    .join(', ');

  const systemPrompt = `You classify UI edit prompts for a React project.
Return JSON only. No markdown.
Schema:
{
  "scope": "section" | "global",
  "targetedCategories": ["navbar"|"banner"|"hero"|"features"|"testimonials"|"team"|"timeline"|"blog"|"gallery"|"ecommerce"|"social-proof"|"pricing"|"cta"|"faq"|"contact"|"footer"|"dashboard"|"sidebar"|"auth"|"stats"|"chart"|"modal"],
  "forceAppUpdate": boolean,
  "styleRequest": boolean,
  "confidence": number,
  "reasoning": string
}`;

  const userPrompt = `Prompt:
${input.prompt}

Known files:
${fileHints || '(none)'}

Rules:
- If prompt requests global visual/style changes (e.g. background/theme/colors), set scope="global" and forceAppUpdate=true.
- If prompt is section-specific, set scope="section".
- Set styleRequest=true when prompt asks for style/look/theme/color/background changes.
- Choose only valid categories from schema list.
- Confidence in range 0..1.`;

  try {
    const response = await withTimeout(
      llmManager.generate({
        provider: input.provider,
        generationMode: input.generationMode,
        prompt: userPrompt,
        systemPrompt,
        temperature: 0,
        maxTokens: 260,
        stream: false,
        currentFiles: {},
      }),
      15000
    );

    const content = typeof response === 'object' && 'content' in response && !('getReader' in response)
      ? ((response as any).content || '')
      : '';
    if (!content || typeof content !== 'string') return fallback;

    const jsonCandidateMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonCandidateMatch) return fallback;
    const parsed = JSON.parse(jsonCandidateMatch[0]);

    const categories = Array.isArray(parsed?.targetedCategories)
      ? parsed.targetedCategories
        .map((item: unknown) => normalizePromptUnderstandingCategory(String(item)))
        .filter((item: BlockCategory | null): item is BlockCategory => Boolean(item))
      : [];
    const uniqueCategories: BlockCategory[] = Array.from(new Set<BlockCategory>(categories));

    const scope: 'section' | 'global' = parsed?.scope === 'global' ? 'global' : 'section';
    const confidenceRaw = typeof parsed?.confidence === 'number' ? parsed.confidence : fallback.confidence;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    const forceAppUpdate = Boolean(parsed?.forceAppUpdate) || scope === 'global';
    const styleRequest = typeof parsed?.styleRequest === 'boolean' ? parsed.styleRequest : fallback.styleRequest;
    const reasoning = typeof parsed?.reasoning === 'string' && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : 'AI prompt understanding';

    return {
      source: 'ai',
      confidence,
      scope,
      forceAppUpdate,
      styleRequest,
      targetedCategories: uniqueCategories,
      reasoning,
    };
  } catch (error) {
    console.warn('[PromptUnderstanding] Falling back to keyword heuristic:', error);
    return fallback;
  }
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

function isStyleIntentPrompt(prompt: string): boolean {
  return /(hintergrund|background|theme|palette|farbe|farben|style|styling|design|schoener|schöner|modern|premium|gold|golden|gradient|typography|font|shadow|radius)/i.test(prompt);
}

function clampTokens(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createTokenBudget(input: {
  provider: SupportedProvider;
  requestedMaxTokens?: number;
  generationMode: 'new' | 'edit';
  semantic: {
    intent: string;
    intensity: 'low' | 'medium' | 'high';
    touchesStructure: boolean;
  };
}): TokenBudgetDecision {
  const providerHardCap: Record<SupportedProvider, number> = {
    gemini: 6144,
    deepseek: 6144,
    openai: 8192,
  };

  const cap = providerHardCap[input.provider];
  const baseByMode = input.generationMode === 'new' ? 5600 : 4200;

  let generationTarget = baseByMode;
  if (input.semantic.intent === 'layout-change' || input.semantic.intent === 'feature-addition') {
    generationTarget += 700;
  }
  if (input.semantic.intensity === 'high' || input.semantic.touchesStructure) {
    generationTarget += 600;
  } else if (input.semantic.intensity === 'low') {
    generationTarget -= 400;
  }

  const requested = typeof input.requestedMaxTokens === 'number' ? input.requestedMaxTokens : undefined;
  const generationMaxTokens = clampTokens(
    requested ? Math.min(requested, generationTarget) : generationTarget,
    1200,
    cap
  );
  const repairMaxTokens = clampTokens(Math.round(generationMaxTokens * 0.55), 900, Math.min(cap, 4096));
  const repairAttempts = input.generationMode === 'edit' && (input.semantic.intent === 'layout-change' || input.semantic.intent === 'feature-addition')
    ? 2
    : 1;

  return {
    provider: input.provider,
    requestedMaxTokens: requested,
    generationMaxTokens,
    repairMaxTokens,
    repairAttempts,
    reason: `provider_cap=${cap}, mode=${input.generationMode}, intent=${input.semantic.intent}, intensity=${input.semantic.intensity}`,
  };
}

function truncateForPrompt(input: string, maxLength: number): string {
  if (!input || input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}\n/* truncated */`;
}

function looksLikeHtmlDocument(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(code);
}

function coerceToStructuredFilesFallback(input: {
  parsedOutput: ParsedLLMOutput;
  generationMode: 'new' | 'edit';
  fallbackPath: string;
  existingFiles: Record<string, string>;
}): { parsedOutput: ParsedLLMOutput; reason: string } | null {
  const parsedOutput = input.parsedOutput;
  if (parsedOutput.parseError) return null;
  if (parsedOutput.detectedFormat === 'json' || parsedOutput.detectedFormat === 'operations') {
    return null;
  }

  const dedupedFiles = new Map<string, string>();
  for (const file of parsedOutput.extractedFiles || []) {
    const normalizedPath = normalizeGeneratedPath(file.path || '');
    const content = typeof file.content === 'string' ? file.content : '';
    if (!normalizedPath || !content.trim()) continue;
    dedupedFiles.set(normalizedPath, content);
  }

  const extracted = Array.from(dedupedFiles.entries()).map(([path, content]) => ({ path, content }));
  const extractedRuntime = extracted.filter((file) => isRuntimeUiSourcePath(file.path));

  if (extracted.length > 0 && (extractedRuntime.length > 0 || input.generationMode === 'edit')) {
    const primary = parsedOutput.primaryCode?.trim().length
      ? parsedOutput.primaryCode
      : (extractedRuntime[0]?.content || extracted[0].content || '');

    return {
      reason: 'coerced_fenced_output_to_files',
      parsedOutput: {
        ...parsedOutput,
        detectedFormat: 'json',
        primaryCode: primary,
        extractedFiles: extracted,
      },
    };
  }

  const primaryCode = typeof parsedOutput.primaryCode === 'string' ? parsedOutput.primaryCode.trim() : '';
  if (!primaryCode || looksLikeHtmlDocument(primaryCode)) {
    return null;
  }

  let targetPath = normalizeGeneratedPath(input.fallbackPath || 'src/App.tsx');
  if (!isRuntimeUiSourcePath(targetPath)) {
    const preferredExistingRuntime = Object.keys(input.existingFiles || {})
      .map((path) => normalizeGeneratedPath(path))
      .find((path) => isRuntimeUiSourcePath(path));
    targetPath = preferredExistingRuntime || 'src/App.tsx';
  }

  return {
    reason: 'wrapped_raw_module_as_files_json',
    parsedOutput: {
      ...parsedOutput,
      detectedFormat: 'json',
      extractedFiles: [{ path: targetPath, content: primaryCode }],
      primaryCode,
    },
  };
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

function applyDeterministicReactSetterRepair(sourceCode: string, errors: string[]): { code: string; changed: boolean; repairedSetters: string[] } {
  const missingSetters = new Set<string>();
  for (const rawError of errors) {
    const match = rawError.match(/Cannot find name ['"]?(set[A-Z][A-Za-z0-9_]*)['"]?/i);
    if (match?.[1]) {
      missingSetters.add(match[1]);
    }
  }

  if (missingSetters.size === 0) {
    return { code: sourceCode, changed: false, repairedSetters: [] };
  }

  let code = sourceCode;
  let changed = false;

  const declaredSetters = new Set<string>();
  for (const match of code.matchAll(/\[\s*[A-Za-z_$][\w$]*\s*,\s*(set[A-Z][A-Za-z0-9_]*)\s*\]\s*=\s*useState\b/g)) {
    if (match[1]) declaredSetters.add(match[1]);
  }

  const settersToRepair = [...missingSetters].filter((setter) => !declaredSetters.has(setter));
  if (settersToRepair.length === 0) {
    return { code, changed: false, repairedSetters: [] };
  }

  const hasUseStateImport = /import\s*{[^}]*\buseState\b[^}]*}\s*from\s*['"]react['"]/.test(code);
  if (!hasUseStateImport) {
    const namedReactImportRegex = /import\s*{([^}]*)}\s*from\s*['"]react['"];?/;
    if (namedReactImportRegex.test(code)) {
      code = code.replace(namedReactImportRegex, (_full, imports: string) => {
        const merged = new Set(
          imports
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        );
        merged.add('useState');
        return `import { ${[...merged].join(', ')} } from 'react';`;
      });
    } else {
      const firstImport = code.match(/^import[^\n]*\n/m);
      if (firstImport && typeof firstImport.index === 'number') {
        const insertAt = firstImport.index + firstImport[0].length;
        code = `${code.slice(0, insertAt)}import { useState } from 'react';\n${code.slice(insertAt)}`;
      } else {
        code = `import { useState } from 'react';\n${code}`;
      }
    }
    changed = true;
  }

  const findInjectionPoint = (): number | null => {
    const defaultFunctionMatch = code.match(/export\s+default\s+function\s+[A-Z][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/);
    if (defaultFunctionMatch && typeof defaultFunctionMatch.index === 'number') {
      return defaultFunctionMatch.index + defaultFunctionMatch[0].length;
    }

    const defaultRefMatch = code.match(/export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?/);
    if (defaultRefMatch?.[1]) {
      const componentName = defaultRefMatch[1];
      const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const functionDecl = new RegExp(`function\\s+${escaped}\\s*\\([^)]*\\)\\s*\\{`);
      const functionDeclMatch = code.match(functionDecl);
      if (functionDeclMatch && typeof functionDeclMatch.index === 'number') {
        return functionDeclMatch.index + functionDeclMatch[0].length;
      }

      const arrowDecl = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>\\s*\\{`);
      const arrowDeclMatch = code.match(arrowDecl);
      if (arrowDeclMatch && typeof arrowDeclMatch.index === 'number') {
        return arrowDeclMatch.index + arrowDeclMatch[0].length;
      }
    }

    const fallback = code.match(/(?:export\s+default\s+)?function\s+[A-Z][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/);
    if (fallback && typeof fallback.index === 'number') {
      return fallback.index + fallback[0].length;
    }

    return null;
  };

  const insertPos = findInjectionPoint();
  if (insertPos === null) {
    return { code, changed, repairedSetters: [] };
  }
  const injectedLines = settersToRepair.map((setter) => {
    const rawName = setter.slice(3);
    const stateName = rawName.length > 0
      ? `${rawName.charAt(0).toLowerCase()}${rawName.slice(1)}`
      : 'stateValue';
    return `\n  const [${stateName}, ${setter}] = useState<any>(null);`;
  }).join('');

  code = `${code.slice(0, insertPos)}${injectedLines}${code.slice(insertPos)}`;
  changed = true;

  return { code, changed, repairedSetters: settersToRepair };
}

function applyDeterministicReactStateInferenceRepair(sourceCode: string, errors: string[]): { code: string; changed: boolean; repairs: string[] } {
  const hasNeverInferenceError = errors.some((rawError) =>
    /type ['"]never['"]|on type ['"]never['"]|to type ['"]never['"]/.test(rawError.toLowerCase())
  );
  const hasUndefinedStateActionError = errors.some((rawError) =>
    /setstateaction<\s*undefined\s*>|setstateaction<undefined>/.test(rawError.toLowerCase())
  );
  const hasNullStateActionError = errors.some((rawError) =>
    /setstateaction<\s*null\s*>|setstateaction<null>/.test(rawError.toLowerCase())
  );

  if (!hasNeverInferenceError && !hasUndefinedStateActionError && !hasNullStateActionError) {
    return { code: sourceCode, changed: false, repairs: [] };
  }

  let code = sourceCode;
  const repairs: string[] = [];
  const applyRepair = (nextCode: string, repairTag: string) => {
    if (nextCode !== code) {
      code = nextCode;
      if (!repairs.includes(repairTag)) {
        repairs.push(repairTag);
      }
    }
  };

  if (hasNeverInferenceError) {
    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*\[\s*\]\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any[]>([])`;
      }),
      'useState_empty_array_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any[]>(() => [])`;
      }),
      'useState_lazy_empty_array_any'
    );

    applyRepair(
      code.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\](\s*;?)/g, (_full, decl: string, name: string, tail: string) => {
        return `${decl} ${name}: any[] = []${tail || ''}`;
      }),
      'empty_array_declaration_any'
    );
  }

  if (hasUndefinedStateActionError) {
    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(undefined)`;
      }),
      'useState_no_initial_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*undefined\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(undefined)`;
      }),
      'useState_undefined_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*\(\s*\)\s*=>\s*undefined\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(() => undefined)`;
      }),
      'useState_lazy_undefined_any'
    );
  }

  if (hasNullStateActionError) {
    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*null\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(null)`;
      }),
      'useState_null_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*\(\s*\(\s*\)\s*=>\s*null\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(() => null)`;
      }),
      'useState_lazy_null_any'
    );
  }

  return {
    code,
    changed: code !== sourceCode,
    repairs,
  };
}

export function applyDeterministicDomNullSafetyRepair(sourceCode: string, errors: string[]): { code: string; changed: boolean; repairs: string[] } {
  const hasDomNullError = errors.some((rawError) =>
    /is possibly ['"]null['"]|object is possibly ['"]null['"]|property ['"]offsettop['"] does not exist on type ['"]element['"]/i.test(rawError)
  );
  if (!hasDomNullError) {
    return { code: sourceCode, changed: false, repairs: [] };
  }

  let code = sourceCode;
  const repairs: string[] = [];

  const replaceWithTracking = (nextCode: string, repairTag: string) => {
    if (nextCode !== code) {
      code = nextCode;
      if (!repairs.includes(repairTag)) {
        repairs.push(repairTag);
      }
    }
  };

  replaceWithTracking(
    code.replace(/document\.querySelector(?!<)(\s*\()/g, 'document.querySelector<HTMLElement>$1'),
    'querySelector_generic'
  );

  replaceWithTracking(
    code.replace(
      /document\.querySelector<HTMLElement>\(([^)]+)\)\.offsetTop/g,
      '(document.querySelector<HTMLElement>($1)?.offsetTop ?? 0)'
    ),
    'querySelector_offsetTop_guard'
  );

  replaceWithTracking(
    code.replace(
      /document\.getElementById\(([^)]+)\)\.offsetTop/g,
      '(document.getElementById($1)?.offsetTop ?? 0)'
    ),
    'getElementById_offsetTop_guard'
  );

  const possiblyNullVars = new Set<string>();
  for (const rawError of errors) {
    const match = rawError.match(/['"]?([A-Za-z_$][\w$]*)['"]?\s+is possibly ['"]null['"]/i);
    if (match?.[1]) {
      possiblyNullVars.add(match[1]);
    }
  }

  for (const variableName of possiblyNullVars) {
    const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const offsetTopAccess = new RegExp(`\\b${escaped}\\.offsetTop\\b`, 'g');
    replaceWithTracking(
      code.replace(offsetTopAccess, `(${variableName}?.offsetTop ?? 0)`),
      `offsetTop_guard:${variableName}`
    );
  }

  return {
    code,
    changed: code !== sourceCode,
    repairs,
  };
}

async function runStructuredAutoRepairLoop(input: {
  enabled: boolean;
  provider: SupportedProvider;
  generationMode: 'new' | 'edit';
  baseSystemPrompt?: string;
  userPrompt: string;
  currentFiles: Record<string, string>;
  filePath: string;
  initialCode: string;
  initialProcessed: ProcessedCode;
  validate: boolean;
  bundle: boolean;
  maxAttempts: number;
  repairMaxTokens: number;
}): Promise<{ code: string; processed: ProcessedCode; summary: AutoRepairSummary }> {
  const initialErrors = input.initialProcessed.errors.length;
  const summary: AutoRepairSummary = {
    enabled: input.enabled,
    attempted: false,
    applied: false,
    maxAttempts: input.maxAttempts,
    attemptsExecuted: 0,
    initialErrorCount: initialErrors,
    finalErrorCount: initialErrors,
    logs: [],
  };

  if (!input.enabled || initialErrors === 0 || !input.validate) {
    return { code: input.initialCode, processed: input.initialProcessed, summary };
  }

  summary.attempted = true;

  let currentCode = input.initialCode;
  let currentProcessed = input.initialProcessed;
  const tryDeterministicRepair = async (repair: {
    changed: boolean;
    code: string;
    description: string;
  }): Promise<boolean> => {
    if (!repair.changed) {
      return false;
    }
    const beforeErrors = currentProcessed.errors.length;
    try {
      const repairedProcessed = await codeProcessor.process(repair.code, input.filePath, {
        validate: input.validate,
        bundle: input.bundle,
      });
      const afterErrors = repairedProcessed.errors.length;

      if (afterErrors < beforeErrors) {
        currentCode = repair.code;
        currentProcessed = repairedProcessed;
        summary.logs.push({
          attempt: 0,
          beforeErrors,
          afterErrors,
          status: afterErrors === 0 ? 'resolved' : 'improved',
          reason: repair.description,
        });

        if (afterErrors === 0) {
          summary.finalErrorCount = 0;
          summary.applied = true;
          return true;
        }
        return true;
      } else {
        summary.logs.push({
          attempt: 0,
          beforeErrors,
          afterErrors,
          status: 'failed',
          reason: `${repair.description} did not reduce validation errors`,
        });
      }
    } catch (error: any) {
      summary.logs.push({
        attempt: 0,
        beforeErrors,
        afterErrors: beforeErrors,
        status: 'aborted',
        reason: error?.message || `${repair.description} failed`,
      });
    }
    return false;
  };

  const deterministicSetterRepair = applyDeterministicReactSetterRepair(
    currentCode,
    currentProcessed.errors
  );
  await tryDeterministicRepair({
    changed: deterministicSetterRepair.changed,
    code: deterministicSetterRepair.code,
    description: deterministicSetterRepair.repairedSetters.length > 0
      ? `deterministic setter repair (${deterministicSetterRepair.repairedSetters.join(', ')})`
      : 'deterministic setter repair',
  });

  const deterministicDomRepair = applyDeterministicDomNullSafetyRepair(
    currentCode,
    currentProcessed.errors
  );
  await tryDeterministicRepair({
    changed: deterministicDomRepair.changed,
    code: deterministicDomRepair.code,
    description: deterministicDomRepair.repairs.length > 0
      ? `deterministic DOM null-safety repair (${deterministicDomRepair.repairs.join(', ')})`
      : 'deterministic DOM null-safety repair',
  });

  const deterministicStateInferenceRepair = applyDeterministicReactStateInferenceRepair(
    currentCode,
    currentProcessed.errors
  );
  await tryDeterministicRepair({
    changed: deterministicStateInferenceRepair.changed,
    code: deterministicStateInferenceRepair.code,
    description: deterministicStateInferenceRepair.repairs.length > 0
      ? `deterministic React state inference repair (${deterministicStateInferenceRepair.repairs.join(', ')})`
      : 'deterministic React state inference repair',
  });

  if (currentProcessed.errors.length === 0) {
    summary.finalErrorCount = 0;
    summary.applied = true;
    return {
      code: currentCode,
      processed: currentProcessed,
      summary,
    };
  }

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    summary.attemptsExecuted = attempt;
    const beforeErrors = currentProcessed.errors.length;
    const repairErrorList = currentProcessed.errors.slice(0, 8).map((item) => `- ${item}`).join('\n');

    const repairSystemPrompt = `You are a strict TypeScript repair engine.
Fix compile/runtime errors only.
Return only valid source code for ${input.filePath}.
No markdown fences. No explanations.
Do not change unrelated structure.`;

    const repairPrompt = `User intent:
${truncateForPrompt(input.userPrompt, 800)}

Target file:
${input.filePath}

Current errors:
${repairErrorList || '- unknown validation error'}

Current code:
${truncateForPrompt(currentCode, 18000)}

Task:
Repair the code so validation errors are reduced or fully resolved.`;

    try {
      const repairedResponse = await llmManager.generate({
        provider: input.provider,
        generationMode: input.generationMode,
        prompt: repairPrompt,
        systemPrompt: repairSystemPrompt,
        temperature: 0.2,
        maxTokens: input.repairMaxTokens,
        stream: false,
        currentFiles: input.currentFiles,
      });

      const repairedRaw = typeof repairedResponse === 'string'
        ? repairedResponse
        : (repairedResponse as any)?.content || '';

      if (!repairedRaw || typeof repairedRaw !== 'string') {
        summary.abortedReason = 'empty_repair_response';
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors: beforeErrors,
          status: 'aborted',
          reason: 'empty repair response',
        });
        break;
      }

      const parsed = parseLLMOutput(repairedRaw, input.filePath, input.currentFiles || {});
      if (parsed.parseError) {
        const parseFailureReason =
          parsed.parseError === 'UNAPPLIED_EDIT_OPERATIONS'
            ? 'repair response operations could not be applied to current file anchors'
            : parsed.parseError === 'INVALID_HTML_DOCUMENT_OUTPUT'
              ? 'repair response returned full HTML document for TS/JS module target'
              : 'repair response contained malformed structured JSON';
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors: beforeErrors,
          status: 'failed',
          reason: parseFailureReason,
        });
        summary.abortedReason = parsed.parseError === 'UNAPPLIED_EDIT_OPERATIONS'
          ? 'unapplied_structured_operations'
          : parsed.parseError === 'INVALID_HTML_DOCUMENT_OUTPUT'
            ? 'invalid_html_module_output'
            : 'malformed_structured_output';
        continue;
      }
      const nextCode = parsed.primaryCode?.trim();
      if (!nextCode || nextCode.length < 20) {
        summary.abortedReason = 'invalid_repair_code';
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors: beforeErrors,
          status: 'aborted',
          reason: 'parsed repair code invalid',
        });
        break;
      }

      if (nextCode === currentCode) {
        summary.abortedReason = 'repair_no_change';
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors: beforeErrors,
          status: 'aborted',
          reason: 'repair generated no code changes',
        });
        break;
      }

      const nextProcessed = await codeProcessor.process(nextCode, input.filePath, {
        validate: input.validate,
        bundle: input.bundle,
      });
      const afterErrors = nextProcessed.errors.length;

      if (afterErrors === 0) {
        currentCode = nextCode;
        currentProcessed = nextProcessed;
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors,
          status: 'resolved',
        });
        break;
      }

      if (afterErrors >= beforeErrors) {
        summary.abortedReason = 'no_error_improvement';
        summary.logs.push({
          attempt,
          beforeErrors,
          afterErrors,
          status: 'failed',
          reason: 'repair did not reduce validation errors',
        });
        break;
      }

      currentCode = nextCode;
      currentProcessed = nextProcessed;
      summary.logs.push({
        attempt,
        beforeErrors,
        afterErrors,
        status: 'improved',
      });
    } catch (error: any) {
      summary.abortedReason = 'repair_exception';
      summary.logs.push({
        attempt,
        beforeErrors,
        afterErrors: beforeErrors,
        status: 'aborted',
        reason: error?.message || 'unknown repair error',
      });
      break;
    }
  }

  summary.finalErrorCount = currentProcessed.errors.length;
  summary.applied = summary.finalErrorCount < summary.initialErrorCount;
  return {
    code: currentCode,
    processed: currentProcessed,
    summary,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /api/generate
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

type SupabaseIntegrationContext = {
  connected?: boolean;
  environment?: 'test' | 'live' | null;
  projectRef?: string | null;
  hasTestConnection?: boolean;
  hasLiveConnection?: boolean;
};

type RequestIntegrations = {
  supabase?: SupabaseIntegrationContext | null;
};

interface GenerateRequest {
  provider: SupportedProvider;
  prompt: string;
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
  knowledgeBase?: Array<{ path: string, content: string }>; // Context files
  featureFlags?: Partial<FeatureFlags>;
  userId?: string;
  projectId?: string;
  integrations?: RequestIntegrations;
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
  rateLimit?: any; // Assuming rateLimit can be any type for now
  pipeline?: {
    mode: 'template+plan+assemble';
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
      targetedCategories: string[];
      forceAppUpdate: boolean;
      reasoning: string;
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
      templateId,
      systemPrompt,
      temperature,
      maxTokens,
      validate = true,
      bundle = true,
      files,
      image,
      knowledgeBase,
      userId,
      integrations,
      editAnchor,
    } = requestBody;

    if (!isSupportedProvider(provider)) {
      return res.status(400).json({
        success: false,
        error: provider ? 'Invalid provider. Must be "gemini", "deepseek" or "openai"' : 'Missing required field: provider',
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

    const hasEditableFiles = Boolean(files && Object.keys(files).length > 0);
    const effectiveGenerationMode: 'new' | 'edit' = hasEditableFiles ? 'edit' : 'new';
    const hasVisualAnchorInput = Boolean(
      editAnchor &&
      Object.values(editAnchor).some((value) => typeof value === 'string' && value.trim().length > 0)
    );
    const visualAnchorPrompt = effectiveGenerationMode === 'edit' ? buildVisualAnchorPrompt(editAnchor) : '';
    const promptForPlanning = visualAnchorPrompt ? `${prompt}\n\n${visualAnchorPrompt}` : prompt;
    const supabaseIntegration = integrations?.supabase || null;
    const backendIntentDetected = detectBackendIntent(promptForPlanning);
    const supabaseIntegrationContextPrompt = buildSupabaseIntegrationPrompt(supabaseIntegration, backendIntentDetected);
    const integrationWarnings: string[] = [];
    if (backendIntentDetected && !supabaseIntegration?.connected) {
      integrationWarnings.push(
        'Backend/fullstack intent erkannt, aber Supabase ist nicht verbunden. Es wurde nur connection-ready Scaffold-Code erzeugt.'
      );
    }

    const contextualFiles = effectiveGenerationMode === 'edit' && files ? files : {};

    const normalizedTemplateId = typeof templateId === 'string' ? templateId : undefined;
    const resolvedProjectPlan = createResolvedProjectPlan({
      prompt: promptForPlanning,
      templateId: normalizedTemplateId,
      existingFiles: contextualFiles,
      generationMode: effectiveGenerationMode,
      projectId: requestBody.projectId || undefined,
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
    const plannedFiles = [...new Set([...filePlan.create, ...filePlan.update, ...templatePlannedFiles])];
    const promptUnderstanding = await inferPromptUnderstandingWithAI({
      provider,
      generationMode: effectiveGenerationMode,
      prompt: promptForPlanning,
      currentFiles: contextualFiles,
    });
    const aiHint: PromptIntentHint = {
      targetedCategories: promptUnderstanding.targetedCategories,
      scope: promptUnderstanding.scope,
      forceAppUpdate: promptUnderstanding.forceAppUpdate,
      confidence: promptUnderstanding.confidence,
      reasoning: promptUnderstanding.reasoning,
    };
    const sectionPlan = createSectionRegenerationPlan({
      generationMode: effectiveGenerationMode,
      prompt: promptForPlanning,
      existingFiles: contextualFiles,
      resolvedBlockIds: resolvedProjectPlan.resolvedBlockIds,
      aiHint,
    });
    const llmContextFiles = filterFilesForLLMContext(contextualFiles);
    const scopedContextFiles = filterFilesForSectionContext(llmContextFiles, sectionPlan);
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
    const promptForGeneration = effectiveGenerationMode === 'new'
      ? `${promptForPlanning}\n\n${resolvedProjectPlan.planContextPrompt}\n\n${composedTemplate.compositionPrompt}${diversityContext}${integrationContextSuffix}${sectionPlan.instructionSuffix}`
      : `${promptForPlanning}\n\n${buildEditModeContextPrompt(
        contextualFiles,
        resolvedProjectPlan.finalPlan.brand,
        resolvedProjectPlan.finalPlan.language
      )}\n\n${editQualityContext}${diversityContext}${integrationContextSuffix}${sectionPlan.instructionSuffix}`;

    const tokenBudget = createTokenBudget({
      provider,
      requestedMaxTokens: maxTokens,
      generationMode: effectiveGenerationMode,
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 2. LLM GENERATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log(`ðŸ¤– Generating code with ${provider}...`);
    console.log(`ðŸ“ Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`ðŸ§± Template preset: ${composedTemplate.preset.id} (${composedTemplate.selectedBlocks.length} blocks)`);
    console.log(`ðŸ—ºï¸ Resolved plan: ${resolvedProjectPlan.finalPlan.projectType} | pages=${resolvedProjectPlan.finalPlan.pages.length} | features=${resolvedProjectPlan.finalPlan.features.join(', ') || 'none'}`);
    if (resolvedProjectPlan.repairLog.length > 0) {
      console.log(`ðŸ› ï¸ Plan repairs: ${resolvedProjectPlan.repairLog.join(' | ')}`);
    }
    console.log(`ðŸ§¬ Section mode: ${sectionPlan.mode} | structural=${sectionPlan.diff.structuralChange} | intent=${sectionPlan.semantic.intent} | scoped updates=${sectionPlan.allowedUpdatePaths.length}`);
    console.log(`ðŸ§  Prompt understanding: source=${promptUnderstanding.source} scope=${promptUnderstanding.scope} forceApp=${promptUnderstanding.forceAppUpdate} categories=${promptUnderstanding.targetedCategories.join(',') || 'none'} conf=${promptUnderstanding.confidence.toFixed(2)}`);
    console.log(`ðŸ§­ Generation mode: ${effectiveGenerationMode}`);
    if (effectiveGenerationMode === 'edit' && Object.keys(contextualFiles).length > 0) {
      console.log(`ðŸ“‚ Context: ${Object.keys(contextualFiles).length} files provided for iterative editing`);
      console.log(`ðŸ§  LLM context after filtering: ${Object.keys(scopedContextFiles).length} files`);
    }
    console.log(`ðŸ§© File plan ready: +${filePlan.create.length} create, ~${filePlan.update.length} update`);

    // LLMManager will automatically use Enhanced System Prompt if systemPrompt is undefined
    // This includes CRITICAL NO-ROUTER and ICON LIBRARY rules + Intent Enhancement

    let rawCode: string;
    let requestRateLimit: any;
    let orchestrationFiles: Array<{ path: string; content: string }> = [];

    // -------------------------------------------------------------------------
    // Enterprise / Intelligence Layer Discovery
    // -------------------------------------------------------------------------

    // 1. Feature Flags (env/request) + internal routing policy
    const { getFeatureFlagsForRequest } = await import('../config/feature-flags.js');
    const baseFeatureFlags = getFeatureFlagsForRequest(req.body.featureFlags);

    const shouldAutoElevatePipeline =
      (effectiveGenerationMode === 'edit' && (
        sectionPlan.semantic.intent === 'feature-addition' ||
        sectionPlan.semantic.intent === 'layout-change' ||
        sectionPlan.semantic.touchesStructure ||
        sectionPlan.semantic.intensity === 'high'
      )) ||
      effectiveGenerationMode === 'new';

    const shouldRunHeavyPostProcessing =
      effectiveGenerationMode === 'edit' &&
      sectionPlan.semantic.intent === 'layout-change' &&
      sectionPlan.semantic.intensity === 'high';

    const requestPhase3Flags = (req.body as any)?.featureFlags?.phase3 || {};
    const hasExplicitIntentAgentFlag = typeof requestPhase3Flags.intentAgent === 'boolean';
    const hasExplicitPromptConditioningFlag = typeof requestPhase3Flags.dynamicPromptConditioning === 'boolean';

    const effectiveFeatureFlags = {
      ...baseFeatureFlags,
      phase1: {
        ...baseFeatureFlags.phase1,
        specPass: baseFeatureFlags.phase1.specPass || shouldAutoElevatePipeline,
        architecturePass: baseFeatureFlags.phase1.architecturePass || shouldAutoElevatePipeline,
        selfCritique: baseFeatureFlags.phase1.selfCritique || shouldAutoElevatePipeline,
        repairLoop: baseFeatureFlags.phase1.repairLoop || shouldAutoElevatePipeline,
      },
      phase2: {
        ...baseFeatureFlags.phase2,
        astRewrite: baseFeatureFlags.phase2.astRewrite || shouldRunHeavyPostProcessing,
        qualityScoring: baseFeatureFlags.phase2.qualityScoring || shouldRunHeavyPostProcessing,
        multiFileGeneration: baseFeatureFlags.phase2.multiFileGeneration || shouldRunHeavyPostProcessing,
      },
      phase3: {
        ...baseFeatureFlags.phase3,
        intentAgent: hasExplicitIntentAgentFlag
          ? baseFeatureFlags.phase3.intentAgent
          : true,
        dynamicPromptConditioning: hasExplicitPromptConditioningFlag
          ? baseFeatureFlags.phase3.dynamicPromptConditioning
          : (baseFeatureFlags.phase3.dynamicPromptConditioning || shouldAutoElevatePipeline),
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
    const useOrchestrator = !useMultiAgent && (usePhase1 || usePhase2 || usePhase3);

    console.log(
      `ðŸ§­ Pipeline routing: mode=${effectiveGenerationMode} ` +
      `intent=${sectionPlan.semantic.intent}/${sectionPlan.semantic.intensity} ` +
      `phase1=${usePhase1} phase2=${usePhase2} phase3=${usePhase3} ` +
      `orchestrator=${useOrchestrator} multiAgent=${useMultiAgent} autoElevate=${shouldAutoElevatePipeline}`
    );

    // -------------------------------------------------------------------------
    // Orchestrated Intelligence / Evolution / Elite Features
    if (useOrchestrator) {
      console.log('ðŸ§  Using orchestrated AI pipeline...');
      try {
        const { orchestrator } = await import('../ai/orchestrator.js');
        const orchestrationResult = await withTimeout(
          orchestrator.orchestrate({
            provider,
            generationMode: effectiveGenerationMode,
            prompt: promptForGeneration,
            systemPrompt,
            temperature: temperature || 0.7,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image,
            knowledgeBase,
            featureFlags: effectiveFeatureFlags,
          }, `Project Context: ${Object.keys(scopedContextFiles).length > 0 ? `${Object.keys(scopedContextFiles).length} focused files provided` : 'New project'}`),
          TIMEOUT_MS
        );

        rawCode = orchestrationResult.code;
        orchestrationFiles = orchestrationResult.files || [];
        console.log('âœ… Orchestrated AI pipeline completed');
      } catch (orchestratorError: any) {
        console.error('âŒ Orchestrated AI pipeline failed:', orchestratorError);
        if (orchestratorError.message?.includes('timeout')) {
          throw new Error(`Orchestrator timeout: Request took longer than ${TIMEOUT_MS / 1000}s`);
        }
        // Fallback to standard generation
        console.log('ðŸ”„ Falling back to standard generation...');
        const result = await withTimeout(
          llmManager.generate({
            provider,
            generationMode: effectiveGenerationMode,
            prompt: promptForGeneration,
            systemPrompt,
            temperature: temperature || 0.7,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image,
            knowledgeBase
          }),
          TIMEOUT_MS
        );
        rawCode = typeof result === 'string'
          ? result
          : (result as any)?.content || '';
        requestRateLimit = (result as any).rateLimit;
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
              provider,
              generationMode: effectiveGenerationMode,
              prompt: promptForGeneration,
              systemPrompt,
              temperature: temperature || 0.7,
              maxTokens: tokenBudget.generationMaxTokens,
              stream: false,
              currentFiles: scopedContextFiles,
              image,
              knowledgeBase
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
        const parsedInitial = parseLLMOutput(rawCode, 'src/App.tsx', scopedContextFiles);
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
                  provider,
                  generationMode: effectiveGenerationMode,
                  prompt: promptForGeneration,
                  systemPrompt,
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
            provider,
            generationMode: effectiveGenerationMode,
            prompt: promptForGeneration,
            systemPrompt,
            temperature: temperature || 0.7,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image,
            knowledgeBase
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
          provider,
          generationMode: effectiveGenerationMode,
          prompt: promptForGeneration,
          systemPrompt,
          temperature: temperature || 0.7,
          maxTokens: tokenBudget.generationMaxTokens,
          stream: false,
          currentFiles: scopedContextFiles,
          image,
          knowledgeBase
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 3. CODE PROCESSING & VALIDATION
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log(`ðŸ”§ Processing generated code...`);

    let parsedOutput = parseLLMOutput(rawCode, 'src/App.tsx', scopedContextFiles);
    const structuredOutputFormats = new Set(['json', 'operations']);
    const requiresStructuredOutput = true;
    const requiresEditStructuredOutput = effectiveGenerationMode === 'edit';
    const hasValidStructuredOutput = structuredOutputFormats.has(parsedOutput.detectedFormat);
    const hasRuntimeModulePayload = Boolean(
      (typeof parsedOutput.primaryCode === 'string' && parsedOutput.primaryCode.trim().length > 0) ||
      parsedOutput.extractedFiles.some((file) => /\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(file.path))) ||
      (parsedOutput.astPatches && parsedOutput.astPatches.length > 0)
    );
    const missingRuntimePayloadInNew = effectiveGenerationMode === 'new' && !hasRuntimeModulePayload;
    const needsStructuredRetry = Boolean(parsedOutput.parseError)
      || (requiresStructuredOutput && !hasValidStructuredOutput)
      || missingRuntimePayloadInNew;
    if (needsStructuredRetry) {
      console.warn('[Parser] Structured output required but missing/invalid. Running strict JSON retries...');
      let repairedRaw = rawCode;
      for (let retry = 1; retry <= 3; retry += 1) {
        const strictSystemPrompt = `${systemPrompt || ''}

CRITICAL OUTPUT ENFORCEMENT:
- Return strict valid JSON only.
- Do not use markdown fences.
- Do not include explanatory text.
- If you return "files", every file content must be a valid JSON string with escaped newlines (\\n).
${requiresEditStructuredOutput ? '- EDIT MODE: Prefer "operations" JSON. If anchors are uncertain, return "files" JSON instead of invalid operations. Never return raw code/markdown.' : '- NEW MODE: Return structured "files" JSON (or "operations"), never raw code or markdown.'}`;

        const unresolvedOperationHints = parsedOutput.operationsReport?.unresolved
          ?.slice(0, 4)
          .map((entry) => `- #${entry.index + 1}${entry.path ? ` @ ${entry.path}` : ''}: ${entry.reason}`)
          .join('\n');

        const strictUserPrompt = requiresEditStructuredOutput
          ? `${promptForGeneration}

Your previous response was invalid for edit mode or could not be applied to current files.
Use selector-based AST operations when possible (especially with sourceId/data-source-id anchors).
If you use replace operations, all "find" anchors must already exist exactly in the current file content.
${unresolvedOperationHints ? `Unapplied operations:\n${unresolvedOperationHints}\n` : ''}
Return strict valid JSON now in this exact format:
{"operations":[{"op":"add_class","path":"src/App.tsx","selector":"[data-source-id=\"src/App.tsx:12:5\"]","classes":["bg-amber-400"]}]}
or
{"operations":[{"op":"replace_text","path":"src/App.tsx","find":"...","replace":"..."}]}
Fallback if operations cannot be applied safely:
{"files":[{"path":"src/App.tsx","content":"..."}]}`
          : `${promptForGeneration}

Your previous response had malformed structured JSON.
Return strict valid JSON now in one of these formats:
1) {"files":[{"path":"src/App.tsx","content":"..."}]}
2) {"operations":[{"op":"replace_text","path":"src/App.tsx","find":"...","replace":"..."}]}`;

        const retryResult = await withTimeout(
          llmManager.generate({
            provider,
            generationMode: effectiveGenerationMode,
            prompt: strictUserPrompt,
            systemPrompt: strictSystemPrompt,
            temperature: 0.2,
            maxTokens: tokenBudget.generationMaxTokens,
            stream: false,
            currentFiles: scopedContextFiles,
            image,
            knowledgeBase
          }),
          TIMEOUT_MS
        );

        if (typeof retryResult === 'object' && 'content' in retryResult && !('getReader' in retryResult)) {
          repairedRaw = (retryResult as any).content || '';
          requestRateLimit = (retryResult as any).rateLimit || requestRateLimit;
        } else {
          break;
        }

        parsedOutput = parseLLMOutput(repairedRaw, 'src/App.tsx', scopedContextFiles);
        const retryStructuredOk = structuredOutputFormats.has(parsedOutput.detectedFormat);
        const retryHasRuntimeModulePayload = Boolean(
          (typeof parsedOutput.primaryCode === 'string' && parsedOutput.primaryCode.trim().length > 0) ||
          parsedOutput.extractedFiles.some((file) => /\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(file.path))) ||
          (parsedOutput.astPatches && parsedOutput.astPatches.length > 0)
        );
        const retryMissingRuntimeInNew = effectiveGenerationMode === 'new' && !retryHasRuntimeModulePayload;
        const retryValid = !parsedOutput.parseError
          && (!requiresStructuredOutput || retryStructuredOk)
          && !retryMissingRuntimeInNew;
        if (retryValid) {
          rawCode = repairedRaw;
          console.log(`[Parser] Strict JSON retry succeeded on attempt ${retry}.`);
          break;
        }

        const coercedRetry = coerceToStructuredFilesFallback({
          parsedOutput,
          generationMode: effectiveGenerationMode,
          fallbackPath: 'src/App.tsx',
          existingFiles: scopedContextFiles,
        });
        if (coercedRetry) {
          parsedOutput = coercedRetry.parsedOutput;
          rawCode = repairedRaw;
          console.warn(`[Parser] Structured retry recovered via ${coercedRetry.reason} on attempt ${retry}.`);
          break;
        }
      }

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
        });
        if (coercedFinal) {
          parsedOutput = coercedFinal.parsedOutput;
          console.warn(`[Parser] Final structured fallback recovery applied via ${coercedFinal.reason}.`);
        } else {
          throw new Error('MALFORMED_STRUCTURED_OUTPUT: LLM returned invalid files/operations JSON after retries');
        }
      }
    }
    let parsedOperationsReport = parsedOutput.operationsReport;
    if (
      effectiveGenerationMode === 'edit' &&
      parsedOperationsReport &&
      parsedOperationsReport.unresolvedOperations > 0
    ) {
      for (let i = 0; i < parsedOperationsReport.unresolvedOperations; i += 1) {
        editTelemetry.record('unapplied_op', {
          projectId: requestBody.projectId,
          unresolved: parsedOperationsReport.unresolvedOperations,
        });
      }
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
      for (let i = 0; i < Math.max(0, Number(astPatchStats.applied || 0)); i += 1) {
        editTelemetry.record('ast_patch_applied', { projectId: requestBody.projectId });
      }
      for (let i = 0; i < Math.max(0, Number(astPatchStats.failed || 0)); i += 1) {
        editTelemetry.record('ast_patch_failed', { projectId: requestBody.projectId });
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
        const styleRetrySystemPrompt = `${systemPrompt || ''}

CRITICAL STYLE ENFORCEMENT:
- Return strict valid JSON only (no markdown).
- Edit mode: return operations/files only.
- Produce concrete class/token/CSS diffs (not purely narrative changes).`;

        try {
          const styleRetryResult = await withTimeout(
            llmManager.generate({
              provider,
              generationMode: effectiveGenerationMode,
              prompt: styleRetryPrompt,
              systemPrompt: styleRetrySystemPrompt,
              temperature: 0.2,
              maxTokens: tokenBudget.generationMaxTokens,
              stream: false,
              currentFiles: scopedContextFiles,
              image,
              knowledgeBase
            }),
            TIMEOUT_MS
          );

          const styleRetryRaw = typeof styleRetryResult === 'object' && 'content' in styleRetryResult && !('getReader' in styleRetryResult)
            ? (styleRetryResult as any).content || ''
            : '';
          if (!styleRetryRaw) {
            continue;
          }

          const styleRetryParsed = parseLLMOutput(styleRetryRaw, validationTargetPath, scopedContextFiles);
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
    const autoRepairResult = await runStructuredAutoRepairLoop({
      enabled: Boolean(validate && processed.errors.length > 0),
      provider,
      generationMode: effectiveGenerationMode,
      baseSystemPrompt: systemPrompt,
      userPrompt: promptForGeneration,
      currentFiles: scopedContextFiles,
      filePath: validationTargetPath,
      initialCode: codeToProcess,
      initialProcessed: processed,
      validate,
      bundle,
      maxAttempts: tokenBudget.repairAttempts,
      repairMaxTokens: tokenBudget.repairMaxTokens,
    });
    const autoRepair = autoRepairResult.summary;
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

    if (effectiveGenerationMode === 'edit' && processed.errors.length > 0) {
      const hasContextFiles = Object.keys(contextualFiles).length > 0;
      if (hasContextFiles) {
        rollbackApplied = true;
        rollbackTrigger = 'validation';
        rollbackSource = 'context-files';
        rollbackReason = `Validation failed with ${processed.errors.length} errors; keeping previous project state.`;
        rollbackFileMap = { ...contextualFiles };
      } else {
        const latestSnapshot = projectSnapshotStore.getLatest(requestBody.projectId);
        if (latestSnapshot?.files && Object.keys(latestSnapshot.files).length > 0) {
          rollbackApplied = true;
          rollbackTrigger = 'validation';
          rollbackSource = 'snapshot';
          rollbackSnapshotId = latestSnapshot.id;
          rollbackReason = `Validation failed with ${processed.errors.length} errors; restored latest snapshot.`;
          rollbackFileMap = { ...latestSnapshot.files };
        }
      }
    }
    const allowedUpdateSet = new Set(sectionPlan.allowedUpdatePaths.map(normalizeGeneratedPath));
    const validationPathNormalized = normalizeGeneratedPath(validationTargetPath);
    const isAllowedEditOutputPath = (rawPath: string): boolean => {
      const normalizedPath = normalizeGeneratedPath(rawPath || '');
      if (!normalizedPath) return false;
      if (effectiveGenerationMode !== 'edit') return true;
      if (isEditProtectedRootFile(normalizedPath)) return false;
      if (sectionPlan.mode !== 'section-isolated') return true;
      if (normalizedPath === 'src/App.tsx') {
        return sectionPlan.allowAppUpdate;
      }
      if (allowedUpdateSet.has(normalizedPath)) return true;
      if (normalizedPath === validationPathNormalized) return true;
      return false;
    };

    const filteredProcessedFiles = (processed.files as any[]).filter((file) => {
      const normalizedPath = normalizeGeneratedPath(file.path || '');
      if (!normalizedPath) return false;
      return isAllowedEditOutputPath(normalizedPath);
    });
    const filteredOrchestrationFiles = orchestrationFiles.filter((file) => isAllowedEditOutputPath(file.path || ''));
    const blockedByScopeCount = Math.max(0, orchestrationFiles.length - filteredOrchestrationFiles.length);
    if (effectiveGenerationMode === 'edit' && blockedByScopeCount > 0) {
      processed.warnings = [
        ...processed.warnings,
        `Scope guard blocked ${blockedByScopeCount} generated file update(s) outside the allowed edit paths.`,
      ];
    }

    const duration = Date.now() - startTime;
    let assembledFileMap = assembleProjectFiles({
      templateFiles,
      existingFiles: files || {},
      plannedFiles,
      generatedCode: normalizedGeneratedCode,
      generatedFiles: filteredOrchestrationFiles,
      processedFiles: filteredProcessedFiles as any,
      dependencies: processed.dependencies,
    });
    if (rollbackApplied && rollbackFileMap) {
      assembledFileMap = { ...rollbackFileMap };
    }
    const sectionGuardedFileMap = rollbackApplied
      ? assembledFileMap
      : applySectionUpdateGuard(assembledFileMap, contextualFiles, sectionPlan);
    let sanitizedFileMap = sanitizeProjectSourceFiles(sectionGuardedFileMap);
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
    let contentPolishSummary: { domain: string; changes: string[] } = {
      domain: 'default',
      changes: [],
    };
    let deterministicActions: string[] = [];

    if (!rollbackApplied) {
      const polished = polishGeneratedContent({
        files: sanitizedFileMap,
        prompt: promptForGeneration,
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

    const finalValidationPathCandidate = normalizeGeneratedPath(validationTargetPath);
    const finalValidationPath = /\.(tsx|ts|jsx|js)$/.test(finalValidationPathCandidate)
      ? finalValidationPathCandidate
      : 'src/App.tsx';
    const finalValidationCode =
      sanitizedFileMap[finalValidationPath] ||
      sanitizedFileMap['src/App.tsx'] ||
      codeToProcess;

    if (!rollbackApplied && validate) {
      const finalProcessed = await codeProcessor.process(finalValidationCode, finalValidationPath, {
        validate,
        bundle,
      });

      if (finalProcessed.errors.length > 0) {
        const hasContextFiles = Object.keys(contextualFiles).length > 0;
        if (effectiveGenerationMode === 'edit' && hasContextFiles) {
          rollbackApplied = true;
          rollbackTrigger = 'final_validation';
          rollbackSource = 'context-files';
          rollbackReason = `Final validation failed with ${finalProcessed.errors.length} errors after post-processing; keeping previous project state.`;
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
          codeToProcess = finalValidationCode;
          processed.warnings = [
            ...processed.warnings,
            `Final validation failed after post-processing (${finalProcessed.errors.length} errors).`,
          ];
        }
      } else {
        processed = finalProcessed;
        codeToProcess = finalValidationCode;
      }
    } else {
      codeToProcess = finalValidationCode;
    }

    let qualityGate = await evaluateQualityGates({
      files: sanitizedFileMap,
      primaryPath: finalValidationPath,
      prompt: stylePolicyPrompt,
    });

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
          severity: 'critical' as const,
          message: `[LibraryQuality] Blocked library: ${l.name} in ${l.path}. ${l.suggestion || ''}`,
          category: 'security',
          suggestion: l.suggestion || 'Remove the blocked library and use an approved alternative.'
        } as any)));
        qualityGate.findings.push(...scaffoldWarnings.map((w, i) => ({
          id: `scaffold-warn-${i}-${Date.now()}`,
          type: 'quality' as any,
          severity: 'critical' as const,
          message: `[Scaffold] ${w.message} at ${w.path}:${w.location}`,
          category: 'quality',
          suggestion: 'Scaffold/placeholder code is blocked in strict mode. Replace it with verified production-ready implementation.'
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

    if (
      qualityCriticalCount > 0 &&
      !rollbackApplied &&
      effectiveGenerationMode === 'edit' &&
      Object.keys(contextualFiles).length > 0
    ) {
      rollbackApplied = true;
      rollbackTrigger = 'quality';
      rollbackSource = 'context-files';
      rollbackReason = 'Quality gate detected critical issues in edit mode; restored previous project state.';
      sanitizedFileMap = sanitizeProjectSourceFiles({ ...contextualFiles });
      const rollbackTargetPath = normalizeGeneratedPath(validationTargetPath);
      codeToProcess =
        sanitizedFileMap[rollbackTargetPath] ||
        sanitizedFileMap['src/App.tsx'] ||
        codeToProcess;
      processed.warnings = [...processed.warnings, rollbackReason];
      processed.errors = [];
      processed.metadata.hasErrors = false;
      qualityGate = await evaluateQualityGates({
        files: sanitizedFileMap,
        primaryPath: finalValidationPath,
        prompt: stylePolicyPrompt,
      });
      qualityCriticalCount = qualityGate.findings.filter((finding) => finding.severity === 'critical').length;
      console.warn('â†©ï¸ Rollback applied due to quality gate critical findings (context-files)');
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
        if (rollbackTrigger === 'quality') {
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

    const qualityCriticalMessages = qualityGate.findings
      .filter((finding) => finding.severity === 'critical')
      .map((finding) => `[Quality/critical] ${finding.message}`);
    const combinedErrors = rollbackApplied
      ? []
      : [...processed.errors, ...qualityCriticalMessages];
    const isSuccess = combinedErrors.length === 0;

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

    const dedupedWarnings = [...new Set([...processed.warnings, ...integrationWarnings])];
    const responseWarnings = dedupedWarnings.length > 0 ? dedupedWarnings : undefined;
    const responseErrors = rollbackApplied
      ? undefined
      : (combinedErrors.length > 0 ? combinedErrors : undefined);

    const response: GenerateResponse = {
      success: isSuccess,
      code: codeToProcess,
      files: responseFiles,
      dependencies: processed.dependencies,
      components: processed.components,
      errors: responseErrors,
      warnings: responseWarnings,
      provider,
      timestamp: new Date().toISOString(),
      duration,
      processingTime: processed.metadata.processingTime,
      noOp: {
        detected: isNoOpGeneration,
        reason: isNoOpGeneration ? noOpReason : editOutcomeMessage,
      },
      rateLimit: finalRateLimit,
      pipeline: {
        mode: 'template+plan+assemble',
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
          targetedCategories: promptUnderstanding.targetedCategories,
          forceAppUpdate: promptUnderstanding.forceAppUpdate,
          reasoning: promptUnderstanding.reasoning,
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
            hasTestConnection: Boolean(supabaseIntegration?.hasTestConnection),
            hasLiveConnection: Boolean(supabaseIntegration?.hasLiveConnection),
          }
        }
      }
    };

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 5. AUDIT LOGGING (Async - Fire & Forget)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // We log even if it failed? No, usually only success consumes quota, unless we want to track failures too.
    // Let's log success for now to track usage.

    if (userId) {
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
          const tokensUsed = Math.ceil((codeToProcess?.length || 0) / 4); // Estimate output tokens

          if (usageId) {
            const { error: usageError } = await supabase.rpc('update_token_usage', {
              p_usage_id: usageId,
              p_tokens_used: tokensUsed
            });
            if (usageError) console.error('âš ï¸ Failed to update token usage:', usageError);
          }

          // 2. Write Audit Log
          await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'generate_code',
            details: {
              provider,
              model: provider === 'openai' ? 'gpt-4o' :
                provider === 'deepseek' ? 'deepseek-coder' : 'gemini-pro',
              tokens_input: (prompt.length / 4), // Estimate
              tokens_output: tokensUsed,
              duration,
              success: isSuccess
            }
          });
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

    console.error('âŒ Generation Error:', error);

    const duration = Date.now() - startTime;

    // Check for Rate Limit / Quota Exceeded errors
    const isRateLimit =
      error.status === 429 ||
      error.code === 429 ||
      error.code === 'RESOURCE_EXHAUSTED' ||
      (error.message && error.message.includes('429')) ||
      (error.message && error.message.includes('Quota exceeded'));

    // Check for timeout errors
    const isTimeout =
      error.message?.includes('timeout') ||
      error.message?.includes('Timeout') ||
      error.code === 'ETIMEDOUT';

    const isMalformedOutput =
      error.message?.includes('MALFORMED_STRUCTURED_OUTPUT') ||
      error.code === 'MALFORMED_STRUCTURED_OUTPUT';

    const statusCode = isRateLimit ? 429 : isTimeout ? 504 : isMalformedOutput ? 422 : 500;
    const errorCode = isRateLimit
      ? 'RATE_LIMIT_EXCEEDED'
      : isTimeout
        ? 'REQUEST_TIMEOUT'
        : isMalformedOutput
          ? 'MALFORMED_STRUCTURED_OUTPUT'
          : 'GENERATION_ERROR';

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Code generation failed',
      provider: req.body?.provider || 'unknown',
      timestamp: new Date().toISOString(),
      duration,
      code: errorCode
    });
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
    optionalFields: ['generationMode', 'templateId', 'temperature', 'maxTokens', 'validate', 'bundle', 'featureFlags'],
    templatesEndpoint: '/api/generate/templates',
    providers: ['gemini', 'deepseek', 'openai'],
    features: [
      'Code generation with Gemini/DeepSeek/OpenAI',
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
