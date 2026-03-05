import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock3, LayoutGrid, RotateCcw, RotateCw, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MonacoEditor } from '../components/MonacoEditor';
import { CodePreview } from '../components/CodePreview';
import { ThinkingProcess } from '../components/ThinkingProcess';
import {
  api,
  type BillingPlan,
  type BillingStatusResponse,
  Project,
  type CloudOverviewResponse,
  type CloudState,
  type GitHubSyncStatusResponse,
  type ProjectPublication,
  type PublishAccess,
  type SupabaseIntegrationEnvironment,
  type SupabaseIntegrationEnvStatus,
  type VisualPatchApplyResponse,
  type VisualPatchOperation
} from '../lib/api';
import { buildVisualOperationsFromIntent } from '../lib/visual-operations';
import { useHistory } from '../hooks/useHistory';
import PatchDiffPreview from '../components/PatchDiffPreview';
import { useOperationHistory } from '../hooks/useOperationHistory';
import { useVisualWorkflow, type VisualPatchDiagnostics } from '../hooks/useVisualWorkflow';
import VisualEditPanel, { type VisualEditIntent } from '../components/VisualEditPanel';
import SupabaseConnect from '../components/SupabaseConnect';
import CloudWorkspace from '../components/CloudWorkspace';
import PublishModal from '../components/PublishModal';
import GitHubSync from '../components/GitHubSync';
import TemplateGallery from '../components/TemplateGallery';
import GenerationTimeline, {
  TIMELINE_BUNDLING_INDEX,
  TIMELINE_READY_INDEX,
  createInitialTimelineState,
  type TimelineStepState,
} from '../components/GenerationTimeline';
import { supabase } from '../lib/supabase';
import type { GalleryTemplate } from '../data/templates';
import {
  normalizeRuntimeIssuePayload,
  type PreviewRuntimeIssuePayload,
} from './generator-runtime-utils';
import {
  applyStrategyPromptTemplate,
  classifyError,
  FIX_STRATEGIES,
  type ErrorClassificationType,
  type RuntimeErrorPayload,
} from '../lib/auto-debug';

import { useUsage } from '../contexts/UsageContext';

const LUCIDE_ALIAS_CANONICAL: Record<string, string> = {
  Cup: 'CupSoda',
  Trash: 'Trash2',
  Person: 'User',
  HelpCircle: 'Info',
  AlertCircle: 'CircleAlert',
};

const MODEL_OPTIONS: Array<{
  id: 'gemini' | 'groq' | 'openai' | 'nvidia';
  name: string;
  icon: string;
  tone: string;
}> = [
    { id: 'gemini', name: 'Gemini 2.0 Flash', icon: 'psychology', tone: 'text-blue-400' },
    { id: 'groq', name: 'Llama 4 Maverick (Groq)', icon: 'bolt', tone: 'text-orange-400' },
    { id: 'openai', name: 'ChatGPT 4o', icon: 'auto_awesome', tone: 'text-green-400' },
    { id: 'nvidia', name: 'Qwen 3.5 397B (NVIDIA)', icon: 'memory', tone: 'text-emerald-300' },
  ];

type ProviderId = 'gemini' | 'groq' | 'openai' | 'nvidia';
type ProviderErrorCategory = 'rate_limit' | 'provider_down' | 'auth_error';

interface ProviderRecoveryHint {
  category: ProviderErrorCategory;
  switchTo: ProviderId;
}

type SurfaceMode = 'preview' | 'analytics' | 'code' | 'cloud' | 'design' | 'security' | 'speed';

const SURFACE_MODE_META: Record<SurfaceMode, { label: string; icon: string }> = {
  preview: { label: 'Preview', icon: 'language' },
  analytics: { label: 'Analytics', icon: 'query_stats' },
  code: { label: 'Code', icon: 'code' },
  cloud: { label: 'Cloud', icon: 'cloud' },
  design: { label: 'Design', icon: 'palette' },
  security: { label: 'Security', icon: 'shield' },
  speed: { label: 'Speed', icon: 'speed' },
};

const SURFACE_MENU_MODES: SurfaceMode[] = ['analytics', 'cloud', 'code', 'design', 'security', 'speed'];
const DEFAULT_PINNED_SURFACE_MODES: SurfaceMode[] = ['analytics', 'code', 'cloud'];

interface RuntimeQualitySummary {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  status: 'excellent' | 'good' | 'needs_improvement' | 'critical';
  pass: boolean;
  criticalCount: number;
  warningCount: number;
  topIssues: string[];
  recommendedAction?: string;
  repair: {
    attempted: boolean;
    applied: boolean;
    initialErrorCount: number;
    finalErrorCount: number;
    attemptsExecuted: number;
    abortedReason?: string;
  };
}

const isProviderId = (value: unknown): value is ProviderId =>
  value === 'gemini' || value === 'groq' || value === 'openai' || value === 'nvidia';

const getAlternateProvider = (provider: ProviderId): ProviderId => {
  if (provider === 'gemini') return 'groq';
  if (provider === 'groq') return 'openai';
  if (provider === 'openai') return 'nvidia';
  return 'groq';
};

const getProviderLabel = (provider: ProviderId): string => {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'groq') return 'Groq';
  if (provider === 'nvidia') return 'NVIDIA';
  return 'Gemini';
};

const normalizeProviderErrorCategory = (value: unknown): ProviderErrorCategory | null => {
  if (value === 'rate_limit' || value === 'provider_down' || value === 'auth_error') {
    return value;
  }
  return null;
};

interface VisualEditAnchorPayload {
  rect?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
  };
  nodeId?: string;
  tagName?: string;
  className?: string;
  id?: string;
  innerText?: string;
  textContent?: string;
  selector?: string;
  domPath?: string;
  sectionId?: string;
  routePath?: string;
  href?: string;
  role?: string;
  sourceId?: string; // data-source-id from Vite plugin: "file:line:col"
  selected?: VisualEditAnchorPayload[];
  appendMode?: boolean;
  activeSelectionKey?: string;
  text?: string;
}

interface VisualSelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface VisualEditTargetElement {
  tagName: string;
  className: string;
  textContent: string;
}

interface VisualEditRequestPayload {
  targetElement: VisualEditTargetElement;
  editInstruction: string;
}

interface GenerateInvocationOptions {
  forceGenerationMode?: 'new' | 'edit';
}

type FileMap = Record<string, string>;

interface SnapshotHistoryEntry {
  id: string;
  timestamp: string;
  label: string;
  snapshotId?: string | null;
}

interface StarterSuggestionCard {
  emoji: string;
  title: string;
  description: string;
  prompt: string;
}

const STARTER_SUGGESTION_CARDS: StarterSuggestionCard[] = [
  {
    emoji: '🍕',
    title: 'Pizza Restaurant',
    description: 'Menu, story section, and smooth online ordering flow.',
    prompt: 'Create a beautiful pizza restaurant website with menu, about section, and online ordering',
  },
  {
    emoji: '🚀',
    title: 'SaaS Landing Page',
    description: 'Hero, features, pricing, and social proof sections.',
    prompt: 'Build a modern SaaS landing page with hero, features, pricing, and testimonials',
  },
  {
    emoji: '👤',
    title: 'Developer Portfolio',
    description: 'Projects, skills, timeline, and contact form.',
    prompt: 'Create a minimal developer portfolio with projects, skills, and contact form',
  },
  {
    emoji: '🛍️',
    title: 'E-Commerce Store',
    description: 'Product grid, cart interactions, and checkout flow.',
    prompt: 'Build an online store with product grid, cart, and checkout flow',
  },
  {
    emoji: '📊',
    title: 'Analytics Dashboard',
    description: 'Stats cards, charts, and a useful data table.',
    prompt: 'Create an analytics dashboard with stats cards, charts, and data table',
  },
  {
    emoji: '💒',
    title: 'Wedding Page',
    description: 'Elegant story, gallery, schedule, and RSVP form.',
    prompt: 'Build an elegant wedding website with story, gallery, and RSVP form',
  },
  {
    emoji: '💪',
    title: 'Fitness Studio',
    description: 'Classes, trainers, plans, and memberships.',
    prompt: 'Create a fitness studio website with classes, trainers, and membership pricing',
  },
  {
    emoji: '📝',
    title: 'Blog Platform',
    description: 'Article grid, categories, and newsletter signup.',
    prompt: 'Build a clean blog with article grid, categories, and newsletter signup',
  },
];

interface PendingInlineDraft {
  key: string;
  anchor: VisualEditAnchorPayload;
  text: string;
}

type FixStatus = 'idle' | 'auto_fixed' | 'needs_fix';
type AutoRepairState = 'idle' | 'detecting' | 'fixing' | 'fixed' | 'failed';

interface RepairRequestOptions {
  prompt?: string;
  errorContext?: string;
  maxTokens?: number;
  source?: 'manual' | 'auto';
}

const MAX_AUTO_REPAIRS = 3;

const escapeRegExp = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureLucideIconImport = (source: string, iconName: string): string => {
  const bodyWithoutImports = source.replace(/^import[^\n]*\n/gm, '\n');
  const iconPattern = new RegExp(`\\b${escapeRegExp(iconName)}\\b`);
  if (!iconPattern.test(bodyWithoutImports)) return source;

  const importRegex = /import\s*{([^}]+)}\s*from\s*['"]lucide-react['"];?/g;
  const matches = Array.from(source.matchAll(importRegex));

  if (matches.length === 0) {
    const firstImport = source.match(/^import[^\n]*\n/m);
    if (!firstImport || typeof firstImport.index !== 'number') {
      return `import { ${iconName} } from 'lucide-react';\n${source}`;
    }
    const insertAt = firstImport.index + firstImport[0].length;
    return `${source.slice(0, insertAt)}import { ${iconName} } from 'lucide-react';\n${source.slice(insertAt)}`;
  }

  const specifiers = matches
    .flatMap((m) => m[1].split(',').map((p) => p.trim()))
    .filter(Boolean);

  const hasIcon = specifiers.some((specifier) => {
    const aliasMatch = specifier.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (aliasMatch) {
      return aliasMatch[1] === iconName || aliasMatch[2] === iconName;
    }
    return specifier === iconName;
  });
  if (hasIcon) return source;

  const merged = Array.from(new Set([...specifiers, iconName])).sort();
  const mergedLine = `import { ${merged.join(', ')} } from 'lucide-react';`;

  let rebuilt = source;
  const ranges = matches
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
    .sort((a, b) => b.start - a.start);
  const insertPos = matches[0].index ?? 0;

  for (const range of ranges) {
    rebuilt = `${rebuilt.slice(0, range.start)}${rebuilt.slice(range.end)}`;
  }

  return `${rebuilt.slice(0, insertPos)}${mergedLine}\n${rebuilt.slice(insertPos)}`;
};

const sanitizeLucideAliases = (source: string): string => {
  if (!source.includes('lucide-react')) return ensureLucideIconImport(source, 'Info');

  const replacements = new Map<string, string>();
  let code = source.replace(
    /import\s*{([^}]+)}\s*from\s*['"]lucide-react['"];?/g,
    (_match, imports: string) => {
      const normalizedImports = imports
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const parts = item.split(/\s+as\s+/i).map((part) => part.trim());
          const importedName = parts[0];
          const aliasName = parts[1];
          const canonicalName = LUCIDE_ALIAS_CANONICAL[importedName] || importedName;

          if (canonicalName !== importedName) {
            replacements.set(importedName, canonicalName);
          }

          return aliasName
            ? `${canonicalName} as ${aliasName}`
            : canonicalName;
        });

      const uniqueImports = Array.from(new Set(normalizedImports));
      return `import { ${uniqueImports.join(', ')} } from 'lucide-react';`;
    }
  );

  for (const [from, to] of replacements.entries()) {
    code = code.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
  }

  return ensureLucideIconImport(code, 'Info');
};

const sanitizeLoadedFiles = (input: Record<string, string>): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const [path, content] of Object.entries(input)) {
    if (typeof content !== 'string') {
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(path)) {
      sanitized[path] = sanitizeLucideAliases(content);
      continue;
    }
    sanitized[path] = content;
  }
  return sanitized;
};

const normalizePreviewPath = (rawPath: string): string => {
  const trimmed = rawPath.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      return '/';
    }
  }
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('./')) return `/${trimmed.slice(2)}`;
  return `/${trimmed.replace(/^\/+/, '')}`;
};

const resolveSourceFileFromSourceId = (sourceId?: string): string | null => {
  if (!sourceId) return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  parts.pop();
  parts.pop();
  const maybeFile = parts.join(':').trim();
  if (!maybeFile) return null;
  if (!/\.(tsx|ts|jsx|js)$/.test(maybeFile)) return null;
  return maybeFile;
};

const defaultEnterpriseFlags = {
  astPatchExecutor: true,
  stylePolicy: true,
  libraryQuality: true,
  diffPreview: true,
  operationUndo: true,
  editTelemetry: true,
};

const defaultSupabaseIntegrationStatus: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus> = {
  test: {
    environment: 'test',
    connected: false,
    mode: 'memory',
  },
  live: {
    environment: 'live',
    connected: false,
    mode: 'memory',
  },
};

const BACKEND_INTENT_KEYWORDS = [
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
  'login',
  'signup',
  'register',
  'storage',
  'upload',
  'bucket',
  'realtime',
  'edge function',
];

const detectBackendIntent = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  return BACKEND_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

type PlannerIntentTag = 'cloud' | 'security' | 'seo';

const CLOUD_INTENT_KEYWORDS = ['supabase', 'database', 'auth', 'storage', 'edge function', 'sql', 'api'];
const SECURITY_INTENT_KEYWORDS = ['security', 'secure', 'rls', 'policy', 'vulnerability', 'scan', 'owasp', 'secret'];
const SEO_INTENT_KEYWORDS = ['seo', 'robots.txt', 'sitemap', 'meta tag', 'open graph', 'twitter card'];

const detectPlannerIntentTags = (prompt: string): PlannerIntentTag[] => {
  const normalized = prompt.toLowerCase();
  const tags: PlannerIntentTag[] = [];
  if (CLOUD_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) tags.push('cloud');
  if (SECURITY_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) tags.push('security');
  if (SEO_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) tags.push('seo');
  return tags;
};

const toPlannerPromptFingerprint = (prompt: string): string =>
  prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isCloudEnableCommand = (prompt: string): boolean => {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  return [
    'enable cloud',
    'enable the cloud',
    'activate cloud',
    'cloud aktivieren',
    'aktiviere cloud',
    'cloud einschalten',
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
};

const buildSupabaseGenerateContext = (
  status: Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus>
) => {
  const liveConnected = Boolean(status.live?.connected);
  const testConnected = Boolean(status.test?.connected);
  const activeEnvironment: SupabaseIntegrationEnvironment | null = liveConnected
    ? 'live'
    : testConnected
      ? 'test'
      : null;
  const active = activeEnvironment ? status[activeEnvironment] : null;

  return {
    connected: Boolean(activeEnvironment),
    environment: activeEnvironment,
    projectRef: active?.projectRef || null,
    projectUrl: active?.projectUrl || null,
    hasTestConnection: testConnected,
    hasLiveConnection: liveConnected,
  };
};

const extractDependenciesFromFiles = (inputFiles: Record<string, string>): Record<string, string> => {
  const packageJsonRaw = inputFiles['package.json'];
  if (typeof packageJsonRaw !== 'string' || packageJsonRaw.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(packageJsonRaw);
    if (!parsed || typeof parsed !== 'object') return {};
    const deps = (parsed as any).dependencies;
    if (!deps || typeof deps !== 'object') return {};

    const normalized: Record<string, string> = {};
    Object.entries(deps).forEach(([name, version]) => {
      if (typeof name !== 'string' || typeof version !== 'string') return;
      normalized[name] = version;
    });
    return normalized;
  } catch {
    return {};
  }
};

const DEFAULT_GENERATE_REQUEST_TIMEOUT_MS = 240_000;
const configuredGenerateTimeoutMs = Number(import.meta.env.VITE_GENERATE_TIMEOUT_MS);
const GENERATE_REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredGenerateTimeoutMs) && configuredGenerateTimeoutMs >= 90_000
    ? Math.min(600_000, Math.round(configuredGenerateTimeoutMs))
    : DEFAULT_GENERATE_REQUEST_TIMEOUT_MS;
const GENERATE_TIMEOUT_MESSAGE = `Generation timed out after ${Math.round(GENERATE_REQUEST_TIMEOUT_MS / 1000)} seconds. Please try again.`;
const TIMELINE_DEFAULT_TOTAL_MS = 22_000;
const TIMELINE_AUTO_CLOSE_MS = 3_000;
type TimelinePipelinePath = 'fast' | 'deep';

const normalizeTimelinePipelinePath = (value: unknown): TimelinePipelinePath | null => {
  if (value === 'fast' || value === 'deep') return value;
  return null;
};

const toNumericLatency = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.min(90_000, Math.max(2_000, Math.round(value)));
};

const buildTimelineTransitionThresholds = (pipeline: TimelinePipelinePath, totalMs: number): number[] => {
  const safeTotal = Math.min(90_000, Math.max(2_000, Math.round(totalMs)));
  if (pipeline === 'fast') {
    const firstWindow = safeTotal * 0.2;
    const remaining = safeTotal - firstWindow;
    return [
      firstWindow * 0.5,
      firstWindow,
      firstWindow + remaining * 0.45,
      firstWindow + remaining * 0.82,
    ];
  }
  const segment = safeTotal / 5;
  return [segment, segment * 2, segment * 3, segment * 4];
};

const extractTimelineTiming = (payload: any): { pipeline: TimelinePipelinePath; latencyMs: number } | null => {
  const pipeline =
    normalizeTimelinePipelinePath(payload?.pipelinePath) ||
    normalizeTimelinePipelinePath(payload?.routing?.pipeline) ||
    normalizeTimelinePipelinePath(payload?.pipeline?.path) ||
    normalizeTimelinePipelinePath(payload?.pipeline?.pipelinePath);

  const latencyMs =
    toNumericLatency(payload?.latencyMs) ||
    toNumericLatency(payload?.routing?.latencyMs) ||
    toNumericLatency(payload?.pipeline?.latencyMs) ||
    toNumericLatency(payload?.duration);

  if (!pipeline || !latencyMs) return null;
  return { pipeline, latencyMs };
};

const parseJsonPayload = (raw: string, errorPrefix: string): any => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`${errorPrefix}: leere Antwort`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${errorPrefix}: ungueltiges JSON`);
  }
};

const extractScreenshotPayload = (
  dataUrl: string | null
): { screenshotBase64: string; screenshotMimeType: string } | null => {
  const raw = String(dataUrl || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const [, screenshotMimeType, screenshotBase64] = match;
  if (!screenshotMimeType || !screenshotBase64) return null;
  return {
    screenshotBase64,
    screenshotMimeType,
  };
};

const fetchGenerateWithTimeout = async (accessToken: string, payload: Record<string, unknown>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(GENERATE_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const toRuntimeQualitySummary = (payload: any): RuntimeQualitySummary | null => {
  const summary = payload?.pipeline?.qualitySummary;
  if (summary && typeof summary === 'object' && typeof summary.score === 'number') {
    return {
      score: Math.max(0, Math.min(100, Math.round(summary.score))),
      grade: ['A', 'B', 'C', 'D', 'E'].includes(summary.grade) ? summary.grade : 'C',
      status: ['excellent', 'good', 'needs_improvement', 'critical'].includes(summary.status)
        ? summary.status
        : 'needs_improvement',
      pass: Boolean(summary.pass),
      criticalCount: Number(summary.criticalCount) || 0,
      warningCount: Number(summary.warningCount) || 0,
      topIssues: Array.isArray(summary.topIssues)
        ? summary.topIssues.filter((item: unknown): item is string => typeof item === 'string').slice(0, 3)
        : [],
      recommendedAction: typeof summary.recommendedAction === 'string' ? summary.recommendedAction : undefined,
      repair: {
        attempted: Boolean(summary?.repair?.attempted),
        applied: Boolean(summary?.repair?.applied),
        initialErrorCount: Number(summary?.repair?.initialErrorCount) || 0,
        finalErrorCount: Number(summary?.repair?.finalErrorCount) || 0,
        attemptsExecuted: Number(summary?.repair?.attemptsExecuted) || 0,
        abortedReason: typeof summary?.repair?.abortedReason === 'string' ? summary.repair.abortedReason : undefined,
      },
    };
  }

  const qualityGate = payload?.pipeline?.qualityGate;
  if (!qualityGate || typeof qualityGate.overall !== 'number') return null;

  const score = Math.max(0, Math.min(100, Math.round(qualityGate.overall)));
  const grade: RuntimeQualitySummary['grade'] = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E';
  const criticalCount = Number(qualityGate.criticalCount) || 0;
  const warningCount = Number(qualityGate.warningCount) || 0;
  const status: RuntimeQualitySummary['status'] =
    criticalCount > 0 || score < 50
      ? 'critical'
      : (!qualityGate.pass || warningCount >= 3 || score < 70)
        ? 'needs_improvement'
        : (score >= 85 && warningCount === 0)
          ? 'excellent'
          : 'good';
  const findings = Array.isArray(qualityGate.findings) ? qualityGate.findings : [];
  const topIssues = findings
    .filter((item: any) => item?.severity === 'critical' || item?.severity === 'warning')
    .slice(0, 3)
    .map((item: any) => String(item?.message || '').trim())
    .filter(Boolean);
  const autoRepair = payload?.pipeline?.autoRepair;

  return {
    score,
    grade,
    status,
    pass: Boolean(qualityGate.pass),
    criticalCount,
    warningCount,
    topIssues,
    recommendedAction: undefined,
    repair: {
      attempted: Boolean(autoRepair?.attempted),
      applied: Boolean(autoRepair?.applied),
      initialErrorCount: Number(autoRepair?.initialErrorCount) || 0,
      finalErrorCount: Number(autoRepair?.finalErrorCount) || 0,
      attemptsExecuted: Number(autoRepair?.attemptsExecuted) || 0,
      abortedReason: typeof autoRepair?.abortedReason === 'string' ? autoRepair.abortedReason : undefined,
    },
  };
};

const mergeDependencyMaps = (
  ...sources: Array<Record<string, string> | null | undefined>
): Record<string, string> => {
  const merged: Record<string, string> = {};
  sources.forEach((source) => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([name, version]) => {
      if (typeof name !== 'string' || !name.trim()) return;
      if (typeof version !== 'string' || !version.trim()) return;
      merged[name] = version;
    });
  });
  return merged;
};

const buildVisualPatchErrorMessage = (response: VisualPatchApplyResponse, fallback: string): string => {
  const base = (response.error || fallback || 'Visual patch konnte nicht angewendet werden.').trim();
  const failedReasons = Array.isArray(response.patch?.failedReasons)
    ? response.patch?.failedReasons
    : [];
  const noMatchSelector = failedReasons.some((item) =>
    typeof item?.reason === 'string' && item.reason.toLowerCase().includes('no elements matched selector')
  );
  if (noMatchSelector) {
    return `${base} Das Ziel-Element hat sich geaendert. Bitte Element neu anklicken und erneut anwenden.`;
  }
  if (failedReasons.length === 0) return base;
  const details = failedReasons
    .slice(0, 2)
    .map((item) => `${item.selector || item.file}: ${item.reason}`)
    .join(' | ');
  return `${base} Details: ${details}`;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeVisualRect = (value: unknown): VisualSelectionRect | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const width = Math.max(0, toFiniteNumber(source.width) || 0);
  const height = Math.max(0, toFiniteNumber(source.height) || 0);
  const top = toFiniteNumber(source.top);
  const left = toFiniteNumber(source.left);
  if (top === null || left === null || width <= 0 || height <= 0) return null;
  return { top, left, width, height };
};

const buildVisualEditPrompt = (target: VisualEditTargetElement, instruction: string): string => {
  const tagName = (target.tagName || 'element').trim().toLowerCase();
  const textContent = (target.textContent || '').replace(/\s+/g, ' ').trim();
  const safeText = textContent ? textContent.slice(0, 120) : 'selected element';
  return `Edit the ${tagName} with text '${safeText}': ${instruction.trim()}`;
};

const MAX_FILE_SNAPSHOTS = 20;

const areFileMapsEqual = (a: FileMap | undefined, b: FileMap | undefined): boolean => {
  const left = a || {};
  const right = b || {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
};

const formatSnapshotTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const normalizeBillingPlan = (value: unknown): BillingPlan => {
  if (value === 'pro' || value === 'business' || value === 'enterprise') return value;
  return 'free';
};

const normalizeGeneratedDatabaseTables = (value: unknown): string[] => {
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
};

const formatCreditsResetCountdown = (resetsAt: string | null | undefined): string => {
  const resetMs = Date.parse(String(resetsAt || ''));
  if (!Number.isFinite(resetMs)) return '0h 0m 0s';
  const diffSeconds = Math.max(0, Math.floor((resetMs - Date.now()) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

const getNoCreditsPlanMessage = (plan: BillingPlan): string => {
  if (plan === 'pro') return "You've used all 100 monthly credits.";
  if (plan === 'business') return "You've used all 500 monthly credits.";
  if (plan === 'enterprise') return 'Enterprise plan is currently marked as out of credits.';
  return 'Free plan includes 5 generations per day.';
};

export default function Generator() {
  const { user, session } = useAuth();
  const { updateRateLimit } = useUsage();
  const [promptInput, setPromptInput] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewPath, setPreviewPath] = useState('/');
  const [previewPathInput, setPreviewPathInput] = useState('/');
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [latestPreviewHtml, setLatestPreviewHtml] = useState<string | null>(null);
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [autoInlineEdit, setAutoInlineEdit] = useState(true);
  const [selectedEditAnchor, setSelectedEditAnchor] = useState<VisualEditAnchorPayload | null>(null);
  const [selectedEditAnchors, setSelectedEditAnchors] = useState<VisualEditAnchorPayload[]>([]);
  const [selectedVisualRect, setSelectedVisualRect] = useState<VisualSelectionRect | null>(null);
  const [visualEditInstruction, setVisualEditInstruction] = useState('');
  const [history, setHistory] = useState<FileMap[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapshotHistoryMeta, setSnapshotHistoryMeta] = useState<SnapshotHistoryEntry[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [pendingInlineEdits, setPendingInlineEdits] = useState<PendingInlineDraft[]>([]);
  const [visualSaveNotice, setVisualSaveNotice] = useState<string | null>(null);
  const [isApplyingVisualPatch, setIsApplyingVisualPatch] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [knowledgeFiles, setKnowledgeFiles] = useState<Array<{ name: string, content: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);

  const [, setView] = useState<'preview' | 'code'>('preview');
  const [activeSurfaceMode, setActiveSurfaceMode] = useState<SurfaceMode>('preview');
  const [showSurfaceMenu, setShowSurfaceMenu] = useState(false);
  const [pinnedSurfaceModes, setPinnedSurfaceModes] = useState<SurfaceMode[]>(DEFAULT_PINNED_SURFACE_MODES);
  const [workspaceMode, setWorkspaceMode] = useState<'chat' | 'visual'>('chat');
  const [loading, setLoading] = useState(false);
  const [isGeneratingLocked, setIsGeneratingLocked] = useState(false);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStepState[]>(() => createInitialTimelineState());
  const [timelineCurrentStep, setTimelineCurrentStep] = useState(0);
  const [timelineStartedAt, setTimelineStartedAt] = useState<number | null>(null);
  const [timelineActiveStepStartedAt, setTimelineActiveStepStartedAt] = useState<number | null>(null);
  const [timelineRunning, setTimelineRunning] = useState(false);
  const [fixStatus, setFixStatus] = useState<FixStatus>('idle');
  const [fixErrorContext, setFixErrorContext] = useState<string | null>(null);
  const [autoRepairState, setAutoRepairState] = useState<AutoRepairState>('idle');
  const [autoRepairErrorType, setAutoRepairErrorType] = useState<ErrorClassificationType | null>(null);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const [lastRuntimeError, setLastRuntimeError] = useState<RuntimeErrorPayload | null>(null);
  const [buildErrors, setBuildErrors] = useState<Array<{
    file: string;
    line: number;
    message: string;
    suggestion: string;
  }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [, setIsRateLimited] = useState(false);
  const [providerRecoveryHint, setProviderRecoveryHint] = useState<ProviderRecoveryHint | null>(null);
  const [lastQualitySummary, setLastQualitySummary] = useState<RuntimeQualitySummary | null>(null);
  const [pendingIntentPlan, setPendingIntentPlan] = useState<{
    prompt: string;
    intents: PlannerIntentTag[];
  } | null>(null);
  const [ignoredPlannerPromptFingerprint, setIgnoredPlannerPromptFingerprint] = useState<string | null>(null);
  const [lastVisualDiagnostics, setLastVisualDiagnostics] = useState<VisualPatchDiagnostics | null>(null);

  // Enterprise Feature 5: Pending Patch for Review
  const [pendingPatch, setPendingPatch] = useState<{
    changes: Array<{ path: string; before: string; after: string }>;
    label: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Enterprise Feature 6: Operation-Level History
  const operationHistory = useOperationHistory(50);
  const pushOperationHistory = operationHistory.push;

  // Use History Hook for Files
  const {
    state: files,
    set: setFiles,
    reset: resetFiles
  } = useHistory<Record<string, string>>({});

  const [dependencies, setDependencies] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [lastContextCount, setLastContextCount] = useState<number | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Project Dropdown State
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showModelSwitcher, setShowModelSwitcher] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showGitHubSyncModal, setShowGitHubSyncModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [publication, setPublication] = useState<ProjectPublication | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [gitHubSyncStatus, setGitHubSyncStatus] = useState<GitHubSyncStatusResponse | null>(null);
  const [gitHubSyncLoading, setGitHubSyncLoading] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus>>(defaultSupabaseIntegrationStatus);
  const [supabaseStatusLoading, setSupabaseStatusLoading] = useState(false);
  const [cloudState, setCloudState] = useState<CloudState | null>(null);
  const [cloudStateLoading, setCloudStateLoading] = useState(false);
  const [cloudOverview, setCloudOverview] = useState<CloudOverviewResponse | null>(null);
  const [cloudOverviewLoading, setCloudOverviewLoading] = useState(false);
  const [generatedSupabaseSchema, setGeneratedSupabaseSchema] = useState('');
  const [generatedDatabaseTables, setGeneratedDatabaseTables] = useState<string[]>([]);
  const [databaseSchemaCopied, setDatabaseSchemaCopied] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [noCreditsModal, setNoCreditsModal] = useState<{
    open: boolean;
    plan: BillingPlan;
    resetsAt: string | null;
  }>({
    open: false,
    plan: 'free',
    resetsAt: null,
  });
  const [noCreditsCountdown, setNoCreditsCountdown] = useState('0h 0m 0s');
  const [noCreditsUpgradeLoading, setNoCreditsUpgradeLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelSwitcherRef = useRef<HTMLDivElement>(null);
  const surfaceMenuRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const isGenerating = useRef(false);
  const timelineStepsRef = useRef<TimelineStepState[]>(createInitialTimelineState());
  const timelineActiveStepIndexRef = useRef(0);
  const timelineActiveStepStartedAtRef = useRef<number | null>(null);
  const timelineStartedAtRef = useRef<number | null>(null);
  const timelineTerminalStateRef = useRef<'idle' | 'running' | 'failed' | 'success'>('idle');
  const timelineRunIdRef = useRef(0);
  const timelineTransitionTimersRef = useRef<number[]>([]);
  const timelineAutoCloseTimerRef = useRef<number | null>(null);
  const timelineDismissedRef = useRef(false);
  const lastLocalProjectWriteAtRef = useRef(0);
  const lastAppliedFileMapRef = useRef('{}');
  const lastAutoRepairFingerprintRef = useRef('');
  const lastAutoRepairAtRef = useRef(0);
  const liveChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const liveClientIdRef = useRef<string>(`client-${Math.random().toString(36).slice(2, 10)}`);
  const lastSecurityWarningRef = useRef<string>('');
  const historyRef = useRef<FileMap[]>([]);
  const historyIndexRef = useRef(-1);
  const snapshotHistoryMetaRef = useRef<SnapshotHistoryEntry[]>([]);
  const [liveEnabled] = useState(true);
  const [, setLivePeerCount] = useState(1);

  useEffect(() => {
    if (currentProject?.id) {
      localStorage.setItem('active_project_id', currentProject.id);
    }
  }, [currentProject?.id]);

  const commitPreviewPath = useCallback((nextPath: string) => {
    const normalized = normalizePreviewPath(nextPath);
    setPreviewPath(normalized);
    setPreviewPathInput(normalized);
  }, []);

  const refreshPreview = useCallback(() => {
    setPreviewRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    snapshotHistoryMetaRef.current = snapshotHistoryMeta;
  }, [snapshotHistoryMeta]);

  const initializeSnapshotHistory = useCallback((initialFiles: FileMap, label: string, snapshotId?: string | null) => {
    const normalized = { ...(initialFiles || {}) };
    if (Object.keys(normalized).length === 0) {
      historyRef.current = [];
      historyIndexRef.current = -1;
      snapshotHistoryMetaRef.current = [];
      setHistory([]);
      setHistoryIndex(-1);
      setSnapshotHistoryMeta([]);
      return;
    }
    const timestamp = new Date().toISOString();
    const entry: SnapshotHistoryEntry = {
      id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      label,
      snapshotId: snapshotId || null,
    };
    historyRef.current = [normalized];
    historyIndexRef.current = 0;
    snapshotHistoryMetaRef.current = [entry];
    setHistory([normalized]);
    setHistoryIndex(0);
    setSnapshotHistoryMeta([entry]);
  }, []);

  const pushSnapshot = useCallback((nextFiles: FileMap, options?: {
    label?: string;
    snapshotId?: string | null;
    timestamp?: string | null;
  }) => {
    const normalized = { ...(nextFiles || {}) };
    if (Object.keys(normalized).length === 0) return;

    let nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    let nextMeta = snapshotHistoryMetaRef.current.slice(0, historyIndexRef.current + 1);
    const currentFiles = nextHistory[nextHistory.length - 1];

    if (areFileMapsEqual(currentFiles, normalized)) {
      if (nextMeta.length > 0 && options?.snapshotId) {
        const lastIdx = nextMeta.length - 1;
        nextMeta[lastIdx] = {
          ...nextMeta[lastIdx],
          snapshotId: options.snapshotId,
        };
        snapshotHistoryMetaRef.current = nextMeta;
        setSnapshotHistoryMeta(nextMeta);
      }
      return;
    }

    nextHistory.push(normalized);
    nextMeta.push({
      id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: options?.timestamp || new Date().toISOString(),
      label: options?.label || 'Snapshot',
      snapshotId: options?.snapshotId || null,
    });

    if (nextHistory.length > MAX_FILE_SNAPSHOTS) {
      const overflow = nextHistory.length - MAX_FILE_SNAPSHOTS;
      nextHistory = nextHistory.slice(overflow);
      nextMeta = nextMeta.slice(overflow);
    }

    const nextIndex = nextHistory.length - 1;
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    snapshotHistoryMetaRef.current = nextMeta;
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
    setSnapshotHistoryMeta(nextMeta);
  }, []);

  const syncTimelineSteps = useCallback((nextSteps: TimelineStepState[]) => {
    timelineStepsRef.current = nextSteps;
    setTimelineSteps(nextSteps);
  }, []);

  const clearTimelineTransitionTimers = useCallback(() => {
    timelineTransitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    timelineTransitionTimersRef.current = [];
  }, []);

  const clearTimelineAutoCloseTimer = useCallback(() => {
    if (timelineAutoCloseTimerRef.current !== null) {
      window.clearTimeout(timelineAutoCloseTimerRef.current);
      timelineAutoCloseTimerRef.current = null;
    }
  }, []);

  const advanceTimelineStep = useCallback((transitionAt = Date.now()) => {
    if (timelineTerminalStateRef.current !== 'running') return;
    const currentIndex = timelineActiveStepIndexRef.current;
    if (currentIndex >= TIMELINE_BUNDLING_INDEX) return;

    const stepStartedAt = timelineActiveStepStartedAtRef.current ?? transitionAt;
    const nextIndex = currentIndex + 1;
    const nextSteps = timelineStepsRef.current.map((step, index) => {
      if (index < currentIndex) {
        return step.status === 'done' ? step : { ...step, status: 'done' as const };
      }
      if (index === currentIndex) {
        return {
          ...step,
          status: 'done' as const,
          durationMs: step.durationMs ?? Math.max(0, transitionAt - stepStartedAt),
        };
      }
      if (index === nextIndex) {
        return { ...step, status: 'active' as const };
      }
      if (step.status === 'failed') {
        return { ...step, status: 'pending' as const, durationMs: null };
      }
      return step;
    });

    timelineActiveStepIndexRef.current = nextIndex;
    timelineActiveStepStartedAtRef.current = transitionAt;
    setTimelineCurrentStep(nextIndex);
    setTimelineActiveStepStartedAt(transitionAt);
    syncTimelineSteps(nextSteps);
  }, [syncTimelineSteps]);

  const scheduleTimelineProgress = useCallback((pipeline: TimelinePipelinePath, totalMs: number) => {
    if (timelineDismissedRef.current) return;
    if (timelineTerminalStateRef.current !== 'running') return;
    const startedAt = timelineStartedAtRef.current;
    if (!startedAt) return;

    clearTimelineTransitionTimers();
    const thresholds = buildTimelineTransitionThresholds(pipeline, totalMs);
    const runId = timelineRunIdRef.current;

    while (timelineActiveStepIndexRef.current < TIMELINE_BUNDLING_INDEX) {
      const index = timelineActiveStepIndexRef.current;
      const dueAt = startedAt + thresholds[index];
      if (Date.now() < dueAt) break;
      advanceTimelineStep(dueAt);
    }

    for (let index = timelineActiveStepIndexRef.current; index < TIMELINE_BUNDLING_INDEX; index += 1) {
      const dueAt = startedAt + thresholds[index];
      const delay = Math.max(0, dueAt - Date.now());
      const timer = window.setTimeout(() => {
        if (timelineRunIdRef.current !== runId) return;
        if (timelineTerminalStateRef.current !== 'running') return;
        advanceTimelineStep(Math.max(dueAt, Date.now()));
      }, delay);
      timelineTransitionTimersRef.current.push(timer);
    }
  }, [advanceTimelineStep, clearTimelineTransitionTimers]);

  const startTimeline = useCallback(() => {
    if (timelineDismissedRef.current) return;
    const startedAt = Date.now();
    timelineRunIdRef.current += 1;
    clearTimelineTransitionTimers();
    clearTimelineAutoCloseTimer();

    timelineTerminalStateRef.current = 'running';
    timelineActiveStepIndexRef.current = 0;
    timelineActiveStepStartedAtRef.current = startedAt;
    timelineStartedAtRef.current = startedAt;

    const initialState = createInitialTimelineState();
    syncTimelineSteps(initialState);
    setTimelineCurrentStep(0);
    setTimelineStartedAt(startedAt);
    setTimelineActiveStepStartedAt(startedAt);
    setTimelineRunning(true);
    setTimelineOpen(true);

    scheduleTimelineProgress('deep', TIMELINE_DEFAULT_TOTAL_MS);
  }, [
    clearTimelineAutoCloseTimer,
    clearTimelineTransitionTimers,
    scheduleTimelineProgress,
    syncTimelineSteps,
  ]);

  const applyTimelineTiming = useCallback((payload: any) => {
    if (timelineDismissedRef.current) return;
    if (timelineTerminalStateRef.current !== 'running') return;
    const timing = extractTimelineTiming(payload);
    if (!timing) return;
    scheduleTimelineProgress(timing.pipeline, timing.latencyMs);
  }, [scheduleTimelineProgress]);

  const markTimelineFailed = useCallback(() => {
    if (timelineDismissedRef.current) return;
    if (timelineTerminalStateRef.current !== 'running') return;

    clearTimelineTransitionTimers();
    clearTimelineAutoCloseTimer();

    const failedAt = Date.now();
    const activeIndex = Math.min(timelineActiveStepIndexRef.current, TIMELINE_BUNDLING_INDEX);
    const stepStartedAt = timelineActiveStepStartedAtRef.current ?? failedAt;

    const nextSteps = timelineStepsRef.current.map((step, index) => {
      if (index < activeIndex) {
        return step.status === 'done'
          ? step
          : { ...step, status: 'done' as const, durationMs: step.durationMs ?? 0 };
      }
      if (index === activeIndex) {
        return {
          ...step,
          status: 'failed' as const,
          durationMs: step.durationMs ?? Math.max(0, failedAt - stepStartedAt),
        };
      }
      return { ...step, status: 'pending' as const, durationMs: null };
    });

    timelineTerminalStateRef.current = 'failed';
    timelineActiveStepStartedAtRef.current = null;
    setTimelineActiveStepStartedAt(null);
    setTimelineCurrentStep(activeIndex);
    setTimelineRunning(false);
    setTimelineOpen(true);
    syncTimelineSteps(nextSteps);
  }, [
    clearTimelineAutoCloseTimer,
    clearTimelineTransitionTimers,
    syncTimelineSteps,
  ]);

  const markTimelineReady = useCallback(() => {
    if (timelineDismissedRef.current) return;
    if (timelineTerminalStateRef.current !== 'running') return;

    clearTimelineTransitionTimers();
    clearTimelineAutoCloseTimer();

    const readyAt = Date.now();
    const activeIndex = Math.min(timelineActiveStepIndexRef.current, TIMELINE_BUNDLING_INDEX);
    const stepStartedAt = timelineActiveStepStartedAtRef.current ?? readyAt;

    const nextSteps = timelineStepsRef.current.map((step, index) => {
      if (index < activeIndex) {
        return { ...step, status: 'done' as const, durationMs: step.durationMs ?? 0 };
      }
      if (index === activeIndex) {
        return {
          ...step,
          status: 'done' as const,
          durationMs: step.durationMs ?? Math.max(0, readyAt - stepStartedAt),
        };
      }
      if (index <= TIMELINE_BUNDLING_INDEX) {
        return { ...step, status: 'done' as const, durationMs: step.durationMs ?? 0 };
      }
      if (index === TIMELINE_READY_INDEX) {
        return { ...step, status: 'done' as const, durationMs: 0 };
      }
      return step;
    });

    timelineTerminalStateRef.current = 'success';
    timelineActiveStepIndexRef.current = TIMELINE_READY_INDEX;
    timelineActiveStepStartedAtRef.current = null;
    setTimelineActiveStepStartedAt(null);
    setTimelineCurrentStep(TIMELINE_READY_INDEX);
    setTimelineRunning(false);
    setTimelineOpen(true);
    syncTimelineSteps(nextSteps);

    timelineAutoCloseTimerRef.current = window.setTimeout(() => {
      if (timelineDismissedRef.current) return;
      setTimelineOpen(false);
    }, TIMELINE_AUTO_CLOSE_MS);
  }, [
    clearTimelineAutoCloseTimer,
    clearTimelineTransitionTimers,
    syncTimelineSteps,
  ]);

  const handleTimelineClose = useCallback(() => {
    timelineDismissedRef.current = true;
    timelineTerminalStateRef.current = 'idle';
    clearTimelineTransitionTimers();
    clearTimelineAutoCloseTimer();
    setTimelineRunning(false);
    setTimelineOpen(false);
  }, [clearTimelineAutoCloseTimer, clearTimelineTransitionTimers]);

  useEffect(() => {
    return () => {
      clearTimelineTransitionTimers();
      clearTimelineAutoCloseTimer();
    };
  }, [clearTimelineAutoCloseTimer, clearTimelineTransitionTimers]);

  const openPreviewInNewTab = useCallback(() => {
    if (!latestPreviewHtml) return;
    try {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
      const blob = new Blob([latestPreviewHtml], { type: 'text/html' });
      const nextUrl = URL.createObjectURL(blob);
      previewBlobUrlRef.current = nextUrl;
      window.open(nextUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open preview in new tab:', error);
      setError('Preview konnte nicht in neuem Tab geÃ¶ffnet werden.');
    }
  }, [latestPreviewHtml]);

  const loadSupabaseIntegrationStatus = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setSupabaseStatus(defaultSupabaseIntegrationStatus);
      return;
    }
    try {
      setSupabaseStatusLoading(true);
      const response = await api.getSupabaseIntegrationStatus(projectId);
      if (response.success && response.status) {
        const next = {
          test: response.status.test || defaultSupabaseIntegrationStatus.test,
          live: response.status.live || defaultSupabaseIntegrationStatus.live,
        };
        if (response.connected && response.projectUrl) {
          const targetEnv = response.environment === 'live' ? 'live' : 'test';
          next[targetEnv] = {
            ...next[targetEnv],
            connected: true,
            projectUrl: response.projectUrl,
          };
        }
        setSupabaseStatus(next);
      } else {
        setSupabaseStatus(defaultSupabaseIntegrationStatus);
      }
    } catch (statusError) {
      console.error('Failed to load Supabase integration status:', statusError);
      setSupabaseStatus(defaultSupabaseIntegrationStatus);
    } finally {
      setSupabaseStatusLoading(false);
    }
  }, []);

  const loadCloudState = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setCloudState(null);
      return;
    }
    try {
      setCloudStateLoading(true);
      const response = await api.getCloudState(projectId);
      if (response.success && response.state) {
        setCloudState(response.state);
      } else {
        setCloudState(null);
      }
    } catch (stateError) {
      console.error('Failed to load cloud state:', stateError);
      setCloudState(null);
    } finally {
      setCloudStateLoading(false);
    }
  }, []);

  const loadCloudOverview = useCallback(async (projectId?: string, environment?: SupabaseIntegrationEnvironment) => {
    if (!projectId) {
      setCloudOverview(null);
      return;
    }

    try {
      setCloudOverviewLoading(true);
      const response = await api.getCloudOverview(projectId, environment);
      if (response.success) {
        setCloudOverview(response);
      } else {
        setCloudOverview(null);
      }
    } catch (overviewError) {
      console.error('Failed to load cloud overview:', overviewError);
      setCloudOverview(null);
    } finally {
      setCloudOverviewLoading(false);
    }
  }, []);

  const loadPublishStatus = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setPublication(null);
      return;
    }

    try {
      setPublishLoading(true);
      const response = await api.getPublishStatus(projectId);
      if (response.success && response.publication) {
        setPublication(response.publication);
      } else {
        setPublication(null);
      }
    } catch (publishError) {
      console.error('Failed to load publish status:', publishError);
      setPublication(null);
    } finally {
      setPublishLoading(false);
    }
  }, []);

  const loadGitHubSyncStatus = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setGitHubSyncStatus(null);
      return;
    }

    try {
      setGitHubSyncLoading(true);
      const response = await api.git.githubStatus(projectId);
      setGitHubSyncStatus(response);
    } catch (gitHubError) {
      console.error('Failed to load GitHub sync status:', gitHubError);
      setGitHubSyncStatus({ connected: false });
    } finally {
      setGitHubSyncLoading(false);
    }
  }, []);

  const loadBillingStatus = useCallback(async () => {
    if (!user?.id) {
      setBillingStatus(null);
      return;
    }
    try {
      const response = await api.getBillingStatus();
      if (response.error) {
        throw new Error(response.error);
      }
      if (!response || typeof response.plan !== 'string') return;
      setBillingStatus({
        plan: normalizeBillingPlan(response.plan),
        status: response.status === 'canceled' || response.status === 'past_due' ? response.status : 'active',
        creditsUsed: Number.isFinite(Number(response.creditsUsed)) ? Number(response.creditsUsed) : 0,
        creditsTotal: Number.isFinite(Number(response.creditsTotal)) ? Number(response.creditsTotal) : 5,
        creditsResetAt: typeof response.creditsResetAt === 'string' ? response.creditsResetAt : new Date().toISOString(),
        stripeConnected: Boolean(response.stripeConnected),
      });
    } catch (billingError) {
      console.error('Failed to load billing status:', billingError);
    }
  }, [user?.id]);

  const publishProject = useCallback(async (input: {
    slug: string;
    access: PublishAccess;
    siteTitle?: string;
    siteDescription?: string;
  }) => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }
    try {
      setPublishSubmitting(true);
      setError(null);
      const response = await api.publishProject({
        projectId: currentProject.id,
        slug: input.slug,
        access: input.access,
        siteTitle: input.siteTitle,
        siteDescription: input.siteDescription,
      });
      if (!response.success || !response.publication) {
        throw new Error(response.error || 'Projekt konnte nicht veroeffentlicht werden.');
      }
      const published = response.publication;
      setPublication(published);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Publish live: ${published.publishedUrl || `https://${published.slug}.loomic.app`}`,
        },
      ]);
    } catch (publishError: any) {
      console.error('Failed to publish project:', publishError);
      setError(publishError?.message || 'Projekt konnte nicht veroeffentlicht werden.');
    } finally {
      setPublishSubmitting(false);
    }
  }, [currentProject?.id]);

  const unpublishProject = useCallback(async () => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }
    try {
      setPublishSubmitting(true);
      setError(null);
      const response = await api.unpublishProject({ projectId: currentProject.id });
      if (!response.success || !response.publication) {
        throw new Error(response.error || 'Projekt konnte nicht zurueckgezogen werden.');
      }
      setPublication(response.publication);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Publish deaktiviert. Projekt ist wieder im Draft-Status.' },
      ]);
    } catch (unpublishError: any) {
      console.error('Failed to unpublish project:', unpublishError);
      setError(unpublishError?.message || 'Unpublish fehlgeschlagen.');
    } finally {
      setPublishSubmitting(false);
    }
  }, [currentProject?.id]);

  const deployProjectToVercel = useCallback(async () => {
    if (!currentProject?.id) {
      throw new Error('Bitte zuerst ein Projekt laden oder erstellen.');
    }

    const response = await api.deployToVercel({ projectId: currentProject.id });
    if (!response.success || !response.url || !response.deploymentId) {
      throw new Error(response.error || 'Vercel deployment failed.');
    }

    if (response.publication) {
      setPublication(response.publication);
    } else {
      await loadPublishStatus(currentProject.id);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Vercel live: ${response.url}`,
      },
    ]);

    return {
      url: response.url,
      deploymentId: response.deploymentId,
      lastDeployedAt: response.publication?.lastDeployedAt || null,
    };
  }, [currentProject?.id, loadPublishStatus]);

  const enableCloud = useCallback(async (source: string = 'manual') => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return false;
    }

    try {
      setError(null);
      const response = await api.enableCloud({
        projectId: currentProject.id,
        source,
      });
      if (!response.success || !response.state) {
        throw new Error(response.error || 'Cloud konnte nicht aktiviert werden.');
      }
      setCloudState(response.state);
      await Promise.all([
        loadCloudOverview(currentProject.id),
        loadSupabaseIntegrationStatus(currentProject.id),
      ]);
      return true;
    } catch (cloudError: any) {
      console.error('Failed to enable cloud:', cloudError);
      setError(cloudError?.message || 'Cloud konnte nicht aktiviert werden.');
      return false;
    }
  }, [currentProject?.id, loadCloudOverview, loadSupabaseIntegrationStatus]);

  const connectSupabaseCredentials = useCallback(async (input: { projectUrl: string; anonKey: string }) => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }

    try {
      setError(null);
      const response = await api.connectSupabaseCredentials({
        projectId: currentProject.id,
        projectUrl: input.projectUrl,
        anonKey: input.anonKey,
      });
      if (!response.success || !response.connected) {
        throw new Error(response.error || 'Supabase konnte nicht verbunden werden.');
      }

      await Promise.all([
        loadSupabaseIntegrationStatus(currentProject.id),
        loadCloudOverview(currentProject.id),
      ]);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Supabase verbunden: ${response.projectUrl || input.projectUrl}`,
        },
      ]);
    } catch (connectError: any) {
      console.error('Failed to connect Supabase credentials:', connectError);
      setError(connectError?.message || 'Supabase konnte nicht verbunden werden.');
    }
  }, [currentProject?.id, loadCloudOverview, loadSupabaseIntegrationStatus]);

  const disconnectSupabaseConnection = useCallback(async () => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }

    try {
      setError(null);
      const response = await api.disconnectSupabaseCredentials({
        projectId: currentProject.id,
      });
      if (!response.success) {
        throw new Error(response.error || 'Supabase konnte nicht getrennt werden.');
      }

      await loadSupabaseIntegrationStatus(currentProject.id);
      await loadCloudOverview(currentProject.id);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Supabase wurde getrennt.',
        },
      ]);
    } catch (disconnectError: any) {
      console.error('Failed to disconnect Supabase:', disconnectError);
      setError(disconnectError?.message || 'Supabase konnte nicht getrennt werden.');
    }
  }, [currentProject?.id, loadCloudOverview, loadSupabaseIntegrationStatus]);

  const normalizeAnchor = useCallback((anchor: VisualEditAnchorPayload): VisualEditAnchorPayload => ({
    rect: normalizeVisualRect(anchor.rect) || undefined,
    nodeId: (anchor.nodeId || '').trim(),
    tagName: (anchor.tagName || '').trim(),
    className: (anchor.className || '').trim(),
    id: (anchor.id || '').trim(),
    innerText: (anchor.innerText || anchor.textContent || '').trim(),
    textContent: (anchor.textContent || anchor.innerText || '').trim(),
    selector: (anchor.selector || '').trim(),
    domPath: (anchor.domPath || '').trim(),
    sectionId: (anchor.sectionId || '').trim(),
    routePath: (anchor.routePath || '').trim(),
    href: (anchor.href || '').trim(),
    role: (anchor.role || '').trim(),
    sourceId: (anchor.sourceId || '').trim(),
  }), []);

  const resolveAnchorProjectFile = useCallback((anchor: VisualEditAnchorPayload): string | null => {
    const sourceFile = resolveSourceFileFromSourceId(anchor.sourceId);
    if (!sourceFile) return null;
    if (!Object.prototype.hasOwnProperty.call(files, sourceFile)) return null;
    return sourceFile;
  }, [files]);

  const isReliableVisualAnchor = useCallback((anchor: VisualEditAnchorPayload): boolean => {
    return Boolean(resolveAnchorProjectFile(anchor));
  }, [resolveAnchorProjectFile]);

  const selectorForAnchor = useCallback((anchor: VisualEditAnchorPayload): string => {
    if (!anchor.sourceId) return '';
    return `[data-source-id="${anchor.sourceId.replace(/"/g, '\\"')}"]`;
  }, []);

  const broadcastLiveSnapshot = useCallback((nextFiles: Record<string, string>, nextDependencies: Record<string, string>) => {
    if (!liveEnabled || !currentProject?.id || !liveChannelRef.current) return;
    liveChannelRef.current.send({
      type: 'broadcast',
      event: 'files-sync',
      payload: {
        projectId: currentProject.id,
        clientId: liveClientIdRef.current,
        updatedAt: Date.now(),
        files: nextFiles,
        dependencies: nextDependencies,
      },
    }).catch(() => {
      // Ignore transient realtime send failures.
    });
  }, [currentProject?.id, liveEnabled]);

  const applyOperationEntry = useCallback((entry: { files: Record<string, string>; dependencies: Record<string, string>; message: string }) => {
    lastLocalProjectWriteAtRef.current = Date.now();
    try {
      lastAppliedFileMapRef.current = JSON.stringify(entry.files);
    } catch {
      lastAppliedFileMapRef.current = '{}';
    }
    setFiles(entry.files);
    setDependencies(entry.dependencies);
    setMessages((prev) => [...prev, { role: 'assistant', content: entry.message }]);
    broadcastLiveSnapshot(entry.files, entry.dependencies);
  }, [broadcastLiveSnapshot, setFiles]);

  const markNeedsFix = useCallback((message: string) => {
    const normalized = String(message || '').trim();
    if (!normalized) return;
    setFixStatus('needs_fix');
    setFixErrorContext(normalized);
  }, []);

  const handleFixIssue = useCallback(async (options?: RepairRequestOptions): Promise<boolean> => {
    if (loading || isApplyingVisualPatch || isAutoRepairing || isGenerating.current) return false;
    if (!session?.access_token) {
      setError('Session abgelaufen. Bitte erneut einloggen.');
      return false;
    }
    if (Object.keys(files).length === 0) {
      setError('Keine Projektdateien vorhanden, die repariert werden koennen.');
      return false;
    }

    const repairSource = options?.source || 'manual';
    const repairPrompt = String(options?.prompt || 'Fix the current project runtime/build issue with minimal code changes.').trim();
    const maxTokens = Number.isFinite(Number(options?.maxTokens))
      ? Math.max(300, Math.min(2400, Number(options?.maxTokens)))
      : 1200;
    const errorContext = String(
      options?.errorContext
      || fixErrorContext
      || (typeof error === 'string' ? error : '')
      || 'Unknown runtime/build error'
    ).trim();
    if (!errorContext) {
      setError('Kein Fehlerkontext verfuegbar.');
      return false;
    }

    isGenerating.current = true;
    setIsGeneratingLocked(true);
    setIsAutoRepairing(true);
    setFixStatus('needs_fix');

    try {
      const response = await fetchGenerateWithTimeout(
        session.access_token,
        {
          provider,
          mode: 'repair',
          generationMode: 'edit',
          prompt: repairPrompt,
          errorContext,
          files,
          validate: true,
          bundle: true,
          maxTokens,
          projectId: currentProject?.id,
          userId: user?.id,
          featureFlags: {
            enterprise: defaultEnterpriseFlags,
          },
        }
      );

      const text = await response.text();
      const data = parseJsonPayload(text, `${repairSource === 'auto' ? 'Auto' : 'Manual'} Fix (${response.status})`);
      if (data?.rateLimit) {
        updateRateLimit(data.rateLimit);
      }

      const filesObj = (Array.isArray(data?.files) ? data.files : []).reduce((acc: Record<string, string>, file: any) => {
        if (file && typeof file.path === 'string' && typeof file.content === 'string') {
          acc[file.path] = file.content;
        }
        return acc;
      }, {});

      if (Object.keys(filesObj).length === 0) {
        const message = data?.repairError || data?.error || data?.errors?.join('\n') || 'Fix request returned no files.';
        setFixStatus('needs_fix');
        setFixErrorContext(message);
        setError(message);
        setMessages((prev) => [...prev, { role: 'assistant', content: `Fix fehlgeschlagen: ${message}` }]);
        if (repairSource === 'auto') {
          setAutoRepairState('failed');
        }
        return false;
      }

      const nextDependencies = mergeDependencyMaps(
        dependencies,
        extractDependenciesFromFiles(filesObj),
        data?.dependencies
      );
      const changedPaths = Array.from(new Set([
        ...Object.keys(files),
        ...Object.keys(filesObj),
      ])).filter((path) => files[path] !== filesObj[path]);
      const repairSnapshotId =
        typeof data?.pipeline?.snapshot?.currentId === 'string' ? data.pipeline.snapshot.currentId : null;
      const repairSnapshotTimestamp =
        typeof data?.pipeline?.snapshot?.createdAt === 'string' ? data.pipeline.snapshot.createdAt : null;

      const beforeFiles = { ...files };
      const beforeDependencies = { ...dependencies };
      applyOperationEntry({
        files: filesObj,
        dependencies: nextDependencies,
        message: repairSource === 'auto' ? 'Auto repair applied.' : 'Manual fix applied.',
      });
      pushSnapshot(filesObj, {
        label: repairSource === 'auto' ? 'Auto repair' : 'Manual fix',
        snapshotId: repairSnapshotId,
        timestamp: repairSnapshotTimestamp,
      });
      pushOperationHistory({
        label: repairSource === 'auto' ? 'Auto repair' : 'Manual fix',
        beforeFiles,
        afterFiles: filesObj,
        changedPaths,
        beforeDependencies,
        afterDependencies: nextDependencies,
        metadata: {
          prompt: `${repairSource}-fix: ${errorContext.slice(0, 240)}`,
          outcome: data?.repairStatus === 'failed' ? 'failed' : 'applied',
          generationMode: 'edit',
        },
      });

      if (currentProject?.id) {
        try {
          await api.updateProject(currentProject.id, {
            code: JSON.stringify(filesObj),
            prompt: `${repairSource === 'auto' ? 'Auto repair' : 'Manual fix'}: ${errorContext.slice(0, 240)}`,
            updated_at: new Date().toISOString(),
          });
        } catch (persistError) {
          console.error(`Failed to persist ${repairSource} fix result:`, persistError);
        }
      }

      if (!response.ok || data?.repairStatus === 'failed' || data?.success === false) {
        const failedMessage = data?.repairError || data?.error || data?.errors?.join('\n') || 'Repair failed.';
        setFixStatus('needs_fix');
        setFixErrorContext(failedMessage);
        setError(failedMessage);
        setMessages((prev) => [...prev, { role: 'assistant', content: `Fix fehlgeschlagen: ${failedMessage}` }]);
        if (repairSource === 'auto') {
          setAutoRepairState('failed');
        }
        return false;
      }

      setFixStatus('auto_fixed');
      setFixErrorContext(null);
      setError(null);
      setBuildErrors([]);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: repairSource === 'auto' ? 'Auto-fixed successfully.' : 'Issue fixed successfully.',
        },
      ]);

      if (repairSource === 'auto') {
        setAutoRepairState('fixed');
      } else {
        setAutoRepairState('idle');
        setAutoRepairErrorType(null);
      }

      refreshPreview();
      return true;
    } catch (fixError: any) {
      const message = fixError?.message || 'Fix request failed.';
      setFixStatus('needs_fix');
      setFixErrorContext(message);
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Fix Fehler: ${message}` }]);
      if (repairSource === 'auto') {
        setAutoRepairState('failed');
      }
      return false;
    } finally {
      isGenerating.current = false;
      setIsGeneratingLocked(false);
      setIsAutoRepairing(false);
    }
  }, [
    applyOperationEntry,
    currentProject?.id,
    dependencies,
    error,
    files,
    fixErrorContext,
    isApplyingVisualPatch,
    isAutoRepairing,
    loading,
    provider,
    pushSnapshot,
    pushOperationHistory,
    refreshPreview,
    session?.access_token,
    updateRateLimit,
    user?.id,
  ]);

  const handleRuntimeError = useCallback(async (runtimeError: RuntimeErrorPayload) => {
    const normalizedMessage = String(runtimeError?.message || '').trim();
    if (!normalizedMessage) return;

    const normalizedError: RuntimeErrorPayload = {
      ...runtimeError,
      message: normalizedMessage,
      line: Number.isFinite(Number(runtimeError?.line)) ? Number(runtimeError?.line) : undefined,
      col: Number.isFinite(Number(runtimeError?.col)) ? Number(runtimeError?.col) : undefined,
    };
    setLastRuntimeError(normalizedError);
    markNeedsFix(normalizedError.message);

    const fingerprint = [
      normalizedError.message,
      normalizedError.filename || '',
      String(normalizedError.line || ''),
      normalizedError.source || '',
      normalizedError.buildError?.type || '',
    ].join('|');
    const now = Date.now();
    if (lastAutoRepairFingerprintRef.current === fingerprint && now - lastAutoRepairAtRef.current < 1200) {
      return;
    }
    lastAutoRepairFingerprintRef.current = fingerprint;
    lastAutoRepairAtRef.current = now;

    if (loading || isApplyingVisualPatch || isAutoRepairing || isGenerating.current) {
      return;
    }

    if (repairAttempts >= MAX_AUTO_REPAIRS) {
      setAutoRepairState('failed');
      return;
    }

    setAutoRepairState('detecting');
    const classification = classifyError(normalizedError);
    setAutoRepairErrorType(classification.type);

    if (!classification.autoFixable || classification.confidence < 0.8 || classification.type === 'unknown') {
      setAutoRepairState('failed');
      return;
    }

    const strategy = FIX_STRATEGIES[classification.type];
    if (!strategy) {
      setAutoRepairState('failed');
      return;
    }

    setAutoRepairState('fixing');
    setRepairAttempts((prev) => prev + 1);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Auto-fixing: ${classification.type}...`,
      },
    ]);

    const fixPrompt = applyStrategyPromptTemplate(strategy.prompt, normalizedError);
    const repairOk = await handleFixIssue({
      source: 'auto',
      prompt: fixPrompt,
      errorContext: normalizedError.message,
      maxTokens: strategy.maxTokens,
    });

    if (!repairOk) {
      setAutoRepairState('failed');
    }
  }, [
    handleFixIssue,
    isApplyingVisualPatch,
    isAutoRepairing,
    loading,
    markNeedsFix,
    repairAttempts,
  ]);

  const handleAutoRepairRetry = useCallback(() => {
    if (!lastRuntimeError) return;
    void handleRuntimeError(lastRuntimeError);
  }, [handleRuntimeError, lastRuntimeError]);

  const handleBuildErrorAutoFix = useCallback(() => {
    if (buildErrors.length === 0) return;
    const primary = buildErrors[0];
    void handleRuntimeError({
      message: primary.message,
      filename: primary.file,
      line: primary.line,
      source: 'bundler',
      buildError: {
        type: 'build-error',
        errors: buildErrors,
      },
    });
  }, [buildErrors, handleRuntimeError]);

  const handleCopyLastRuntimeError = useCallback(async () => {
    if (!lastRuntimeError) return;
    const payload = JSON.stringify(lastRuntimeError, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error copied to clipboard.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: payload }]);
    }
  }, [lastRuntimeError]);

  useEffect(() => {
    if (autoRepairState !== 'fixed') return;
    const timer = window.setTimeout(() => {
      setAutoRepairState('idle');
      setAutoRepairErrorType(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [autoRepairState]);

  const handlePreviewIssue = useCallback((issue: PreviewRuntimeIssuePayload & {
    type?: 'bundler' | 'runtime';
    buildError?: {
      type: 'build-error';
      errors: Array<{
        file: string;
        line: number;
        message: string;
        suggestion: string;
      }>;
    };
  }) => {
    const normalized = normalizeRuntimeIssuePayload(issue);
    if (!normalized) return;
    const message = issue.type === 'bundler'
      ? `Build error: ${normalized.message}`
      : `Preview runtime error: ${normalized.message}`;
    setError(message);

    const runtimeErrorPayload: RuntimeErrorPayload = {
      message: normalized.message,
      stack: normalized.stack || undefined,
      source: normalized.source || undefined,
      routePath: normalized.routePath || '/',
      buildError: issue.buildError,
    };

    const buildErrorPayload = issue.buildError;
    if (buildErrorPayload?.type === 'build-error' && Array.isArray(buildErrorPayload.errors)) {
      setBuildErrors(
        buildErrorPayload.errors
          .filter((entry) => entry && typeof entry.message === 'string')
          .map((entry) => ({
            file: typeof entry.file === 'string' ? entry.file : 'src/App.tsx',
            line: Number.isFinite(Number(entry.line)) ? Number(entry.line) : 1,
            message: String(entry.message || 'Build error'),
            suggestion: typeof entry.suggestion === 'string'
              ? entry.suggestion
              : 'Inspect file and apply a minimal compile fix.',
          }))
      );
    } else {
      setBuildErrors([]);
    }

    void handleRuntimeError(runtimeErrorPayload);
  }, [handleRuntimeError]);

  const clearVisualSelection = useCallback(() => {
    setSelectedEditAnchor(null);
    setSelectedEditAnchors([]);
    setSelectedVisualRect(null);
    setVisualEditInstruction('');
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement | null;
    iframe?.contentWindow?.postMessage({ type: 'CLEAR_SELECTION' }, '*');
  }, []);

  const selectParentAnchor = useCallback(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'SELECT_PARENT',
      payload: {
        activeSelectionKey:
          selectedEditAnchor?.nodeId ||
          selectedEditAnchor?.sourceId ||
          selectedEditAnchor?.selector ||
          '',
      },
    }, '*');
  }, [selectedEditAnchor?.nodeId, selectedEditAnchor?.selector, selectedEditAnchor?.sourceId]);

  const activateInlineTextEdit = useCallback(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const activeSelectionKey =
      selectedEditAnchor?.nodeId ||
      selectedEditAnchor?.sourceId ||
      selectedEditAnchor?.selector ||
      '';
    if (!activeSelectionKey) return;
    iframe.contentWindow.postMessage({
      type: 'ACTIVATE_INLINE_TEXT_EDIT',
      payload: { activeSelectionKey },
    }, '*');
  }, [selectedEditAnchor?.nodeId, selectedEditAnchor?.selector, selectedEditAnchor?.sourceId]);

  const applyInlineTextPatches = useCallback(async (drafts: PendingInlineDraft[]): Promise<boolean> => {
    if (drafts.length === 0) return false;
    if (Object.keys(files).length === 0) return false;

    const operations: VisualPatchOperation[] = [];
    const invalidTargets: string[] = [];

    for (const draft of drafts) {
      const sourceFile = resolveAnchorProjectFile(draft.anchor);
      const selector = selectorForAnchor(draft.anchor);
      if (!sourceFile || !selector) {
        invalidTargets.push(draft.anchor.sourceId || draft.anchor.selector || draft.anchor.nodeId || 'unknown');
        continue;
      }
      operations.push({
        op: 'replace_text',
        file: sourceFile,
        selector,
        sourceId: draft.anchor.sourceId,
        text: typeof draft.text === 'string' ? draft.text : '',
      });
    }

    if (operations.length === 0 || invalidTargets.length > 0) {
      const message = 'Einige Inline-Edits sind veraltet. Bitte Elemente neu auswaehlen und erneut speichern.';
      setError(message);
      setLastVisualDiagnostics({
        phase: 'inline-text',
        code: 'VISUAL_INVALID_TARGETS',
        message,
      });
      return false;
    }

    const promptPreview = drafts
      .map((draft) => (draft.text || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' | ') || '[empty]';

    setIsApplyingVisualPatch(true);
    setError(null);
    setPendingPatch(null);
    setLastVisualDiagnostics(null);

    try {
      const response = await api.applyVisualPatch({
        files,
        operations,
        prompt: `inline text edits (${operations.length}): ${promptPreview}`,
        verify: true,
        primaryPath: 'src/App.tsx',
        projectId: currentProject?.id,
      });

      if (!response.success || !Array.isArray(response.files)) {
        const errorMessage = buildVisualPatchErrorMessage(response, 'Inline text edit fehlgeschlagen.');
        setError(errorMessage);
        setLastVisualDiagnostics({
          phase: 'inline-text',
          code: response.code,
          message: errorMessage,
          failedReasons: response.patch?.failedReasons,
          checkedPaths: response.verify?.checkedPaths,
        });
        return false;
      }

      const nextFiles = response.files.reduce<Record<string, string>>((acc, file) => {
        if (file && typeof file.path === 'string' && typeof file.content === 'string') {
          acc[file.path] = file.content;
        }
        return acc;
      }, {});
      if (Object.keys(nextFiles).length === 0) return false;

      const beforeFiles = { ...files };
      const beforeDependencies = { ...dependencies };
      const nextDependencies = mergeDependencyMaps(dependencies, extractDependenciesFromFiles(nextFiles));
      const changedPaths = Array.from(new Set([...Object.keys(files), ...Object.keys(nextFiles)]))
        .filter((path) => files[path] !== nextFiles[path]);

      applyOperationEntry({
        files: nextFiles,
        dependencies: nextDependencies,
        message: 'Inline text updates applied.',
      });
      pushSnapshot(nextFiles, {
        label: `Inline text edits (${operations.length})`,
      });
      setLastVisualDiagnostics({
        phase: 'inline-text',
        code: 'APPLIED',
        message: `Inline text edits angewendet (${changedPaths.length} Datei(en)).`,
        checkedPaths: response.verify?.checkedPaths,
      });

      operationHistory.push({
        label: `Inline text edits (${operations.length})`,
        beforeFiles,
        afterFiles: nextFiles,
        changedPaths,
        beforeDependencies,
        afterDependencies: nextDependencies,
        metadata: {
          prompt: `inline text edits (${operations.length}): ${promptPreview}`,
          editAnchor: operations[0]?.selector,
          outcome: 'applied',
          generationMode: 'visual',
        },
      });

      if (currentProject?.id) {
        try {
          await api.updateProject(currentProject.id, {
            code: JSON.stringify(nextFiles),
            prompt: `inline text edits (${operations.length})`,
            updated_at: new Date().toISOString(),
          });
        } catch (saveError) {
          console.error('Failed to persist inline text edits:', saveError);
        }
      }
      return true;
    } catch (error: any) {
      const message = error?.message || 'Inline text edits failed';
      setError(message);
      setLastVisualDiagnostics({
        phase: 'inline-text',
        code: 'VISUAL_APPLY_ERROR',
        message,
      });
      return false;
    } finally {
      setIsApplyingVisualPatch(false);
    }
  }, [applyOperationEntry, currentProject?.id, dependencies, files, operationHistory, pushSnapshot, resolveAnchorProjectFile, selectorForAnchor]);

  const applyFiles = useCallback((nextFiles: FileMap) => {
    const normalized = sanitizeLoadedFiles(nextFiles);
    const nextDependencies = mergeDependencyMaps(extractDependenciesFromFiles(normalized));
    lastLocalProjectWriteAtRef.current = Date.now();
    try {
      lastAppliedFileMapRef.current = JSON.stringify(normalized);
    } catch {
      lastAppliedFileMapRef.current = '{}';
    }
    setFiles(normalized);
    setDependencies(nextDependencies);
    broadcastLiveSnapshot(normalized, nextDependencies);
    refreshPreview();
  }, [broadcastLiveSnapshot, refreshPreview, setFiles]);

  const syncSnapshotRestoreWithBackend = useCallback(async (
    targetFiles: FileMap,
    targetMeta: SnapshotHistoryEntry | undefined
  ) => {
    if (!currentProject?.id) return;
    try {
      let snapshotId = targetMeta?.snapshotId || '';
      if (!snapshotId) {
        const snapshotList = await api.getGenerateSnapshots(currentProject.id, 1);
        snapshotId = snapshotList?.snapshots?.[0]?.id || '';
      }
      if (snapshotId) {
        await api.restoreGenerateSnapshot({
          projectId: currentProject.id,
          snapshotId,
          files: targetFiles,
        });
      }
      await api.updateProject(currentProject.id, {
        code: JSON.stringify(targetFiles),
        prompt: `snapshot restore: ${targetMeta?.label || 'history'}`,
        updated_at: new Date().toISOString(),
      });
    } catch (restoreError) {
      console.error('Failed to sync snapshot restore with backend:', restoreError);
    }
  }, [currentProject?.id]);

  const restoreSnapshotAtIndex = useCallback((targetIndex: number, source: 'undo' | 'redo' | 'history') => {
    const snapshots = historyRef.current;
    if (targetIndex < 0 || targetIndex >= snapshots.length) return;
    const targetFiles = snapshots[targetIndex];
    const targetMeta = snapshotHistoryMetaRef.current[targetIndex];
    historyIndexRef.current = targetIndex;
    setHistoryIndex(targetIndex);
    applyFiles(targetFiles);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `${source === 'undo' ? 'Undo' : source === 'redo' ? 'Redo' : 'History restore'}: ${targetMeta?.label || `Snapshot ${targetIndex + 1}`}`,
      },
    ]);
    void syncSnapshotRestoreWithBackend(targetFiles, targetMeta);
  }, [applyFiles, syncSnapshotRestoreWithBackend]);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    restoreSnapshotAtIndex(idx - 1, 'undo');
  }, [restoreSnapshotAtIndex]);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const snapshots = historyRef.current;
    if (idx < 0 || idx >= snapshots.length - 1) return;
    restoreSnapshotAtIndex(idx + 1, 'redo');
  }, [restoreSnapshotAtIndex]);

  const handleUndoOperation = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedoOperation = useCallback(() => {
    redo();
  }, [redo]);

  const handleApplyPendingInlineEdits = useCallback(async () => {
    if (pendingInlineEdits.length === 0 || workspaceMode !== 'visual') return;
    const ok = await applyInlineTextPatches(pendingInlineEdits);
    if (ok) {
      setPendingInlineEdits([]);
      setVisualSaveNotice('Aenderungen gespeichert.');
    } else {
      setVisualSaveNotice('Speichern fehlgeschlagen. Bitte Elemente neu auswaehlen und erneut speichern.');
    }
  }, [applyInlineTextPatches, pendingInlineEdits, workspaceMode]);

  const handleDiscardPendingInlineEdits = useCallback(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement | null;
    iframe?.contentWindow?.postMessage({ type: 'DISCARD_INLINE_TEXT_EDITS' }, '*');
    setPendingInlineEdits([]);
    setVisualSaveNotice('Ungespeicherte Aenderungen verworfen.');
    refreshPreview();
    setLastVisualDiagnostics({
      phase: 'inline-text',
      code: 'DISCARDED',
      message: 'Ungespeicherte Inline-Edits verworfen.',
    });
  }, [refreshPreview]);

  useEffect(() => {
    try {
      lastAppliedFileMapRef.current = JSON.stringify(files || {});
    } catch {
      lastAppliedFileMapRef.current = '{}';
    }
  }, [files]);

  // Load project function with useCallback to prevent stale closures
  const loadProject = useCallback(async (id: string) => {
    try {
      const project = await api.getProject(id);
      setCurrentProject(project);
      setSelectedEditAnchor(null);
      setSelectedEditAnchors([]);
      setPreviewPath('/');
      setPreviewPathInput('/');

      try {
        const parsedFiles = JSON.parse(project.code);
        if (parsedFiles && typeof parsedFiles === 'object' && !Array.isArray(parsedFiles)) {
          const sanitizedLoaded = sanitizeLoadedFiles(parsedFiles);
          resetFiles(sanitizedLoaded);
          setDependencies(mergeDependencyMaps(extractDependenciesFromFiles(sanitizedLoaded)));
          initializeSnapshotHistory(sanitizedLoaded, `Loaded ${project.name}`);
          try {
            lastAppliedFileMapRef.current = JSON.stringify(sanitizedLoaded);
          } catch {
            lastAppliedFileMapRef.current = '{}';
          }
        } else {
          initializeSnapshotHistory({}, 'Loaded project');
        }
      } catch (e) {
        console.log('Project code is not JSON file map');
        initializeSnapshotHistory({}, 'Loaded project');
      }

      // Load Chat History
      try {
        const messageHistory = await api.getMessages(id);
        if (messageHistory && messageHistory.length > 0) {
          setMessages(messageHistory.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })));
        } else {
          setMessages([{ role: 'assistant', content: `Project "${project.name}" loaded.` }]);
        }
      } catch (msgError) {
        console.error('Failed to load messages:', msgError);
        // Fallback
        setMessages([{ role: 'assistant', content: `Project "${project.name}" loaded.` }]);
      }

      // Load Knowledge Base Files
      try {
        const pFiles = await api.getProjectFiles(id);
        if (pFiles && pFiles.length > 0) {
          setKnowledgeFiles(pFiles.map(f => ({
            name: f.filename,
            content: f.content || ''
          })));
        } else {
          setKnowledgeFiles([]);
        }
      } catch (fileError) {
        console.error('Failed to load project files:', fileError);
      }

      setShowProjectDropdown(false);
      setShowHistoryDropdown(false);
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
    }
  }, [initializeSnapshotHistory, resetFiles]);

  // Load project if ID is present
  useEffect(() => {
    const projectId = searchParams.get('project_id');
    if (projectId && user) {
      loadProject(projectId);
    }
  }, [searchParams, user, loadProject]);

  useEffect(() => {
    void loadSupabaseIntegrationStatus(currentProject?.id);
    void loadCloudState(currentProject?.id);
    void loadCloudOverview(currentProject?.id);
    void loadPublishStatus(currentProject?.id);
    void loadGitHubSyncStatus(currentProject?.id);
    void loadBillingStatus();
  }, [currentProject?.id, loadCloudOverview, loadCloudState, loadPublishStatus, loadSupabaseIntegrationStatus, loadGitHubSyncStatus, loadBillingStatus]);

  useEffect(() => {
    if (!noCreditsModal.open) return;
    setNoCreditsCountdown(formatCreditsResetCountdown(noCreditsModal.resetsAt));
    const timer = window.setInterval(() => {
      setNoCreditsCountdown(formatCreditsResetCountdown(noCreditsModal.resetsAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [noCreditsModal.open, noCreditsModal.resetsAt]);

  useEffect(() => {
    const oauthStatus = searchParams.get('supabase_oauth');
    if (!oauthStatus) return;

    const oauthEnv = searchParams.get('supabase_env');
    const oauthMessage = searchParams.get('supabase_message');
    const projectId = searchParams.get('project_id');

    if (oauthStatus === 'success') {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Supabase ${oauthEnv ? `(${oauthEnv.toUpperCase()}) ` : ''}verbunden.${oauthMessage ? ` ${oauthMessage}` : ''}`,
        },
      ]);
      if (projectId) {
        void loadSupabaseIntegrationStatus(projectId);
        void loadCloudState(projectId);
        void loadCloudOverview(projectId);
      }
    } else {
      setError(oauthMessage || 'Supabase OAuth fehlgeschlagen.');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('supabase_oauth');
    nextParams.delete('supabase_env');
    nextParams.delete('supabase_message');
    setSearchParams(nextParams);
  }, [loadCloudOverview, loadCloudState, loadSupabaseIntegrationStatus, searchParams, setSearchParams]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (modelSwitcherRef.current && !modelSwitcherRef.current.contains(event.target as Node)) {
        setShowModelSwitcher(false);
      }
      if (surfaceMenuRef.current && !surfaceMenuRef.current.contains(event.target as Node)) {
        setShowSurfaceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const projectId = currentProject?.id;
    if (!projectId || !liveEnabled) {
      setLivePeerCount(1);
      if (liveChannelRef.current) {
        supabase.removeChannel(liveChannelRef.current);
        liveChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`project-live:${projectId}`, {
      config: {
        presence: { key: liveClientIdRef.current },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const peers = Object.keys(state || {}).length;
      setLivePeerCount(Math.max(1, peers));
    });

    channel.on('broadcast', { event: 'files-sync' }, ({ payload }) => {
      const incoming = payload as {
        projectId?: string;
        clientId?: string;
        updatedAt?: number;
        files?: Record<string, string>;
        dependencies?: Record<string, string>;
      };

      if (!incoming || incoming.projectId !== projectId) return;
      if (incoming.clientId === liveClientIdRef.current) return;
      if (!incoming.updatedAt || incoming.updatedAt <= lastLocalProjectWriteAtRef.current) return;
      if (!incoming.files || typeof incoming.files !== 'object') return;

      const sanitized = sanitizeLoadedFiles(incoming.files);
      const nextDependencies = mergeDependencyMaps(
        extractDependenciesFromFiles(sanitized),
        incoming.dependencies
      );

      lastLocalProjectWriteAtRef.current = incoming.updatedAt;
      try {
        lastAppliedFileMapRef.current = JSON.stringify(sanitized);
      } catch {
        lastAppliedFileMapRef.current = '{}';
      }
      setFiles(sanitized);
      setDependencies(nextDependencies);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Live update von einem Teammitglied angewendet.' }]);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: user?.id || 'anonymous',
          clientId: liveClientIdRef.current,
          joinedAt: Date.now(),
        });
      }
    });

    liveChannelRef.current = channel;

    return () => {
      if (liveChannelRef.current === channel) {
        liveChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [currentProject?.id, liveEnabled, setFiles, user?.id]);

  // Inspector: Handle messages FROM iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const previewIframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement | null;
      const validPreviewSource = Boolean(previewIframe?.contentWindow && event.source === previewIframe.contentWindow);
      if (!validPreviewSource) return;
      if (!(event.origin === 'null' || event.origin === window.location.origin)) return;

      if (event.data.type === 'ELEMENT_SELECTED') {
        const payload = (event.data.payload || event.data.element || {}) as VisualEditAnchorPayload;
        const selected = Array.isArray(payload.selected) && payload.selected.length > 0
          ? payload.selected.map(normalizeAnchor)
          : [normalizeAnchor(payload)];
        const primary = selected[0] || normalizeAnchor(payload);
        const incomingRect = normalizeVisualRect(primary.rect || (event.data.element as any)?.rect);
        const tagName = (primary.tagName || '').trim();
        const className = (primary.className || '').trim();
        const innerText = (primary.innerText || primary.textContent || '').trim();
        const selector = (primary.selector || '').trim();
        const routePath = (primary.routePath || '').trim();
        const sectionId = (primary.sectionId || '').trim();
        const nodeId = (primary.nodeId || '').trim();
        const sourceId = (primary.sourceId || '').trim();
        setSelectedEditAnchor(primary);
        setSelectedEditAnchors(selected);
        setVisualEditInstruction('');
        if (incomingRect && previewIframe) {
          const iframeRect = previewIframe.getBoundingClientRect();
          const stageRect = previewStageRef.current?.getBoundingClientRect() || iframeRect;
          const relativeTop = incomingRect.top + (iframeRect.top - stageRect.top);
          const relativeLeft = incomingRect.left + (iframeRect.left - stageRect.left);
          setSelectedVisualRect({
            top: Math.max(0, relativeTop),
            left: Math.max(0, relativeLeft),
            width: Math.max(1, incomingRect.width),
            height: Math.max(1, incomingRect.height),
          });
        } else {
          setSelectedVisualRect(null);
        }
        const contextParts = [
          tagName ? `tag=${tagName}` : '',
          selected.length > 1 ? `count=${selected.length}` : '',
          nodeId ? `node=${nodeId}` : '',
          sourceId ? `source=${sourceId}` : '',
          sectionId ? `section=${sectionId}` : '',
          routePath ? `route=${routePath}` : '',
          selector ? `selector=${selector}` : '',
          className ? `class=${className}` : '',
          innerText ? `text="${innerText.slice(0, 80)}"` : '',
        ].filter(Boolean);
        const contextString = contextParts.join(' | ');
        if (workspaceMode === 'chat') {
          setPromptInput(prev => {
            const prefix = prev ? prev + '\n' : '';
            return `${prefix}Aendere dieses Element gezielt (${contextString}) -> `;
          });
        } else {
          const prefilledPrompt = buildVisualEditPrompt({
            tagName: (primary.tagName || 'element').toLowerCase(),
            className: primary.className || '',
            textContent: primary.innerText || primary.textContent || '',
          }, '');
          setPromptInput(prefilledPrompt.endsWith(':') ? `${prefilledPrompt} ` : prefilledPrompt);
        }
        return;
      }

      if (event.data.type === 'INLINE_TEXT_EDIT_COMMIT' || event.data.type === 'INLINE_TEXT_EDIT_DRAFT') {
        const payload = (event.data.payload || {}) as VisualEditAnchorPayload;
        const text = typeof payload.text === 'string' ? payload.text : '';
        const normalized = normalizeAnchor(payload);
        if (!isReliableVisualAnchor(normalized)) {
          setError('Dieses Element gehoert nicht zu den Projektdateien. Bitte ein Element in deiner App auswaehlen.');
          setLastVisualDiagnostics({
            phase: 'inline-text',
            code: 'VISUAL_INVALID_TARGETS',
            message: 'Selektiertes Element liegt ausserhalb der bearbeitbaren Projektdateien.',
          });
          return;
        }
        const draftKey =
          normalized.sourceId ||
          normalized.nodeId ||
          selectorForAnchor(normalized) ||
          normalized.selector ||
          `${Date.now()}`;
        setSelectedEditAnchor(normalized);
        setSelectedEditAnchors([normalized]);
        if (workspaceMode === 'visual') {
          setPendingInlineEdits((prev) => {
            const index = prev.findIndex((entry) => entry.key === draftKey);
            if (index === -1) {
              return [...prev, { key: draftKey, anchor: normalized, text }];
            }
            const next = [...prev];
            next[index] = { ...next[index], anchor: normalized, text };
            return next;
          });
          setVisualSaveNotice('Ungespeicherte Aenderungen vorhanden.');
          setLastVisualDiagnostics({
            phase: 'inline-text',
            code: 'PENDING_APPLY',
            message: 'Inline-Text geaendert. Save oder Discard waehlen.',
          });
        }
        return;
      }

      if (event.data.type === 'PREVIEW_PATH_CHANGED') {
        const nextPath = event.data?.payload?.path;
        if (typeof nextPath === 'string' && nextPath.trim().length > 0) {
          commitPreviewPath(nextPath);
        }
        return;
      }

      if (event.data.type === 'PREVIEW_RUNTIME_ERROR') {
        const payload = event.data?.payload as PreviewRuntimeIssuePayload | undefined;
        const normalized = normalizeRuntimeIssuePayload(payload);
        if (!normalized) return;

        setError(`Preview runtime error: ${normalized.message}`);
        void handleRuntimeError({
          message: normalized.message,
          stack: normalized.stack || undefined,
          source: normalized.source || undefined,
          routePath: normalized.routePath || '/',
        });
        return;
      }

      if (event.data.type === 'RUNTIME_ERROR') {
        const rawError = event.data?.error || {};
        const message = typeof rawError?.message === 'string'
          ? rawError.message
          : 'Unknown runtime error';
        setError(`Preview runtime error: ${message}`);
        void handleRuntimeError({
          message,
          filename: typeof rawError?.filename === 'string' ? rawError.filename : undefined,
          line: Number.isFinite(Number(rawError?.line)) ? Number(rawError.line) : undefined,
          col: Number.isFinite(Number(rawError?.col)) ? Number(rawError.col) : undefined,
          stack: typeof rawError?.stack === 'string' ? rawError.stack : undefined,
          source: typeof rawError?.source === 'string' ? rawError.source : 'runtime',
        });
        return;
      }

      if (event.data.type === 'CONSOLE_ERROR') {
        const message = typeof event.data?.message === 'string'
          ? event.data.message.trim()
          : '';
        if (!message) return;
        setError(`Preview runtime error: ${message}`);
        void handleRuntimeError({
          message,
          source: 'console.error',
        });
        return;
      }

      if (event.data.type === 'PREVIEW_RUNTIME_OK') {
        setError((prev) => {
          if (typeof prev === 'string' && prev.toLowerCase().startsWith('preview runtime error:')) {
            return null;
          }
          return prev;
        });
        setBuildErrors([]);
        markTimelineReady();
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [commitPreviewPath, handleRuntimeError, isReliableVisualAnchor, markTimelineReady, normalizeAnchor, selectorForAnchor, workspaceMode]);

  // Inspector: Toggle mode in iframe
  useEffect(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'TOGGLE_INSPECT', payload: isInspectMode }, '*');
    }
  }, [isInspectMode]);

  useEffect(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: 'SET_VISUAL_EDIT_MODE', payload: workspaceMode === 'visual' && isInspectMode },
        '*'
      );
    }
  }, [workspaceMode, isInspectMode, previewRefreshToken, files]);

  useEffect(() => {
    const iframe = document.querySelector('iframe[title="Local Preview"]') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SET_AUTO_INLINE_EDIT', payload: autoInlineEdit }, '*');
    }
  }, [autoInlineEdit, previewRefreshToken, files]);

  useEffect(() => {
    if (workspaceMode === 'visual') {
      setView('preview');
      setActiveSurfaceMode((prev) => (prev === 'cloud' ? prev : 'design'));
      setIsInspectMode(true);
      return;
    }
    setActiveSurfaceMode((prev) => (prev === 'design' ? 'preview' : prev));
    setIsInspectMode(false);
    setPendingInlineEdits([]);
    setVisualSaveNotice(null);
    setSelectedVisualRect(null);
    setVisualEditInstruction('');
  }, [workspaceMode]);

  useEffect(() => {
    if (!visualSaveNotice) return;
    const timer = window.setTimeout(() => setVisualSaveNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [visualSaveNotice]);

  // Image Upload Handlers
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size too large. Please upload an image smaller than 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setAttachedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Knowledge Base Handlers
  const handleKnowledgeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newKnowledgeFiles: Array<{ name: string, content: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Basic text file check (can be improved)
      if (file.size > 1024 * 1024) { // 1MB limit per file
        setError(`File ${file.name} is too large (max 1MB).`);
        continue;
      }

      try {
        const text = await file.text();
        newKnowledgeFiles.push({ name: file.name, content: text });
      } catch (e) {
        console.error(`Failed to read file ${file.name}`, e);
      }
    }

    setKnowledgeFiles(prev => [...prev, ...newKnowledgeFiles]);
    if (knowledgeInputRef.current) {
      knowledgeInputRef.current.value = '';
    }
  };

  // Paste Handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setAttachedImage(event.target?.result as string);
            };
            reader.readAsDataURL(blob);
            e.preventDefault(); // Prevent pasting the image binary into textarea
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter: Generate
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!loading && !isGeneratingLocked && promptInput.trim()) {
          handleGenerate();
        }
      }
      // Ctrl+S or Cmd+S: Save (if project exists)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Save logic could be added here if needed
      }
      // Ctrl/Cmd+Z: snapshot undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z: redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndoOperation();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedoOperation();
        return;
      }
      // Escape: Close modals/dropdowns
      if (e.key === 'Escape') {
        if (showProjectDropdown) {
          setShowProjectDropdown(false);
        }
        if (showModelSwitcher) {
          setShowModelSwitcher(false);
        }
        if (showSurfaceMenu) {
          setShowSurfaceMenu(false);
        }
        if (showHistoryDropdown) {
          setShowHistoryDropdown(false);
        }
        if (showPublishModal) {
          setShowPublishModal(false);
        }
        if (showTemplateGallery) {
          setShowTemplateGallery(false);
        }
        if (isInspectMode) {
          setIsInspectMode(false);
        }
        if (selectedEditAnchors.length > 0) {
          clearVisualSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, isGeneratingLocked, promptInput, showProjectDropdown, showModelSwitcher, showSurfaceMenu, showHistoryDropdown, showPublishModal, showTemplateGallery, isInspectMode, handleUndoOperation, handleRedoOperation, selectedEditAnchors.length, clearVisualSelection]);

  useEffect(() => {
    if (!showHistoryDropdown) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (historyDropdownRef.current?.contains(target)) return;
      setShowHistoryDropdown(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showHistoryDropdown]);

  // Disable browser/page zoom inside generator view.
  useEffect(() => {
    const handleWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const handleZoomHotkeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0') {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheelZoom, { passive: false });
    window.addEventListener('keydown', handleZoomHotkeys, true);

    return () => {
      window.removeEventListener('wheel', handleWheelZoom);
      window.removeEventListener('keydown', handleZoomHotkeys, true);
    };
  }, [commitPreviewPath]);

  const buildVisualOperations = useCallback((intent: VisualEditIntent): VisualPatchOperation[] => {
    return buildVisualOperationsFromIntent({
      intent,
      selectedEditAnchor,
      selectedEditAnchors,
      isReliableVisualAnchor,
      selectorForAnchor,
      resolveSourceFileFromSourceId: (sourceId?: string) => {
        if (!sourceId) return null;
        return resolveAnchorProjectFile({ sourceId });
      },
    });
  }, [isReliableVisualAnchor, resolveAnchorProjectFile, selectedEditAnchor, selectedEditAnchors, selectorForAnchor]);

  const handleApplyVisualIntent = useCallback(async (intent: VisualEditIntent) => {
    if (Object.keys(files).length === 0) {
      const message = 'Keine Dateien geladen fuer Visual Edit.';
      setError(message);
      setLastVisualDiagnostics({
        phase: 'visual-intent',
        code: 'VISUAL_NO_FILES',
        message,
      });
      return;
    }

    const operations = buildVisualOperations(intent);
    if (operations.length === 0) {
      const message = 'Kein gueltiges Ziel fuer Visual Edit gefunden.';
      setError(message);
      setLastVisualDiagnostics({
        phase: 'visual-intent',
        code: 'VISUAL_INVALID_TARGETS',
        message,
      });
      return;
    }

    setIsApplyingVisualPatch(true);
    setError(null);
    setLastVisualDiagnostics(null);

    try {
      const response = await api.applyVisualPatch({
        files,
        operations,
        prompt: promptInput || 'visual edit',
        verify: true,
        primaryPath: 'src/App.tsx',
        projectId: currentProject?.id,
      });

      if (!response.success) {
        const nextError = buildVisualPatchErrorMessage(response, 'Visual patch konnte nicht angewendet werden.');
        setError(nextError);
        setLastVisualDiagnostics({
          phase: 'visual-intent',
          code: response.code,
          message: nextError,
          failedReasons: response.patch?.failedReasons,
          checkedPaths: response.verify?.checkedPaths,
        });
        setMessages((prev) => [...prev, { role: 'assistant', content: `Visual edit fehlgeschlagen: ${nextError}` }]);
        return;
      }

      const responseFilesArray = Array.isArray(response.files) ? response.files : [];
      const nextFiles = responseFilesArray.reduce<Record<string, string>>((acc, file) => {
        if (file && typeof file.path === 'string' && typeof file.content === 'string') {
          acc[file.path] = file.content;
        }
        return acc;
      }, {});

      if (Object.keys(nextFiles).length === 0) {
        const message = 'Visual patch lieferte keine aktualisierten Dateien.';
        setError(message);
        setLastVisualDiagnostics({
          phase: 'visual-intent',
          code: 'VISUAL_EMPTY_RESULT',
          message,
          checkedPaths: response.verify?.checkedPaths,
        });
        return;
      }

      const previewChanges = (response.diff?.changes || []).map((change) => ({
        path: change.path,
        before: change.before || '',
        after: change.after || '',
      }));

      const changes = previewChanges.length > 0
        ? previewChanges
        : Array.from(new Set([...Object.keys(files), ...Object.keys(nextFiles)]))
          .filter((path) => files[path] !== nextFiles[path])
          .map((path) => ({
            path,
            before: files[path] || '',
            after: nextFiles[path] || '',
          }));

      const nextDependencies = mergeDependencyMaps(dependencies, extractDependenciesFromFiles(nextFiles));
      const beforeFiles = { ...files };
      const beforeDependencies = { ...dependencies };
      applyOperationEntry({
        files: nextFiles,
        dependencies: nextDependencies,
        message: 'Visual patch wurde angewendet.',
      });
      pushSnapshot(nextFiles, {
        label: `Visual edit (${operations.length})`,
      });
      operationHistory.push({
        label: `Visual edit (${operations.length})`,
        beforeFiles,
        afterFiles: nextFiles,
        changedPaths: changes.map((entry) => entry.path),
        beforeDependencies,
        afterDependencies: nextDependencies,
        metadata: {
          prompt: promptInput,
          editAnchor: selectedEditAnchor?.selector,
          outcome: 'applied',
          generationMode: 'visual',
        },
      });
      setLastVisualDiagnostics({
        phase: 'visual-intent',
        code: 'APPLIED',
        message: `Visual patch angewendet (${changes.length} Datei(en)).`,
        checkedPaths: response.verify?.checkedPaths,
      });

      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Visual patch angewendet: ${changes.length} Datei(en) geaendert.`,
      }]);

      if (currentProject?.id) {
        try {
          await api.updateProject(currentProject.id, {
            code: JSON.stringify(nextFiles),
            prompt: promptInput || 'visual edit',
            updated_at: new Date().toISOString(),
          });
        } catch (saveError) {
          console.error('Failed to persist visual edit:', saveError);
        }
      }
    } catch (error: any) {
      const message = error?.message || 'Visual patch failed';
      setError(message);
      setLastVisualDiagnostics({
        phase: 'visual-intent',
        code: 'VISUAL_APPLY_ERROR',
        message,
      });
    } finally {
      setIsApplyingVisualPatch(false);
    }
  }, [
    buildVisualOperations,
    currentProject?.id,
    dependencies,
    files,
    operationHistory,
    promptInput,
    pushSnapshot,
    selectedEditAnchor?.selector,
    applyOperationEntry,
  ]);

  const handleGenerate = async (
    forcePlanApply = false,
    promptOverride?: string,
    visualEditRequest?: VisualEditRequestPayload,
    options?: GenerateInvocationOptions
  ) => {
    const candidatePrompt = (promptOverride ?? promptInput).trim();
    if (!candidatePrompt || loading || isAutoRepairing || isGenerating.current) return; // Guard against race conditions
    const accessToken = session?.access_token || null;
    if (!accessToken) {
      setError('Session abgelaufen. Bitte erneut einloggen.');
      return;
    }
    const hasVisualEditRequest = Boolean(
      visualEditRequest &&
      typeof visualEditRequest.editInstruction === 'string' &&
      visualEditRequest.editInstruction.trim().length > 0
    );
    if (workspaceMode === 'visual' && !hasVisualEditRequest) {
      if (pendingInlineEdits.length > 0) {
        setError('Du hast ungespeicherte Inline-Aenderungen. Bitte erst Save oder Discard.');
        return;
      }
      const reliableAnchors = selectedEditAnchors.filter(isReliableVisualAnchor);
      if (reliableAnchors.length === 0) {
        const message = 'Waehle zuerst ein Element mit stabilem Visual-Anchor aus (data-source-id).';
        setError(message);
        setLastVisualDiagnostics({
          phase: 'chat-edit',
          code: 'VISUAL_INVALID_TARGETS',
          message,
        });
        return;
      }
    }

    const userMessage = candidatePrompt;
    if (!userMessage) return;
    if (isCloudEnableCommand(userMessage)) {
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
      setPromptInput('');
      setLoading(true);
      setError(null);
      try {
        if (!currentProject?.id) {
          throw new Error('Bitte zuerst ein Projekt laden oder erstellen.');
        }

        const enabled = await enableCloud('chat_command');
        if (!enabled) {
          setPromptInput(userMessage);
          return;
        }

        setActiveSurfaceMode('cloud');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Cloud ist jetzt aktiviert.\n\n- Datenbank & Storage integriert\n- Benutzer-Authentifizierung vorbereitet\n- Edge Functions und Secrets verfuegbar\n\nNutze den Cloud-Workspace fuer Overview, Module und Supabase-Links.',
          },
        ]);
      } catch (enableError: any) {
        setError(enableError?.message || 'Cloud konnte nicht aktiviert werden.');
        setPromptInput(userMessage);
      } finally {
        setLoading(false);
      }
      return;
    }
    const plannerPromptFingerprint = toPlannerPromptFingerprint(userMessage);
    const plannerIntents = detectPlannerIntentTags(userMessage);
    const plannerIgnoredOnce = ignoredPlannerPromptFingerprint === plannerPromptFingerprint;
    if (!hasVisualEditRequest && !forcePlanApply && plannerIntents.length > 0 && !plannerIgnoredOnce) {
      setPendingIntentPlan({
        prompt: userMessage,
        intents: plannerIntents,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Plan erkannt (${plannerIntents.join(', ')}). Ich mache nichts automatisch. Bitte "Apply Plan" oder "Ignore" wählen.`,
        },
      ]);
      return;
    }
    if (plannerIgnoredOnce) {
      setIgnoredPlannerPromptFingerprint(null);
    }
    setPendingIntentPlan(null);
    const strictVisualAnchors = selectedEditAnchors.filter(isReliableVisualAnchor);
    const visualTargetElement: VisualEditTargetElement | null = hasVisualEditRequest
      ? {
        tagName: (visualEditRequest?.targetElement?.tagName || '').trim().toLowerCase(),
        className: (visualEditRequest?.targetElement?.className || '').trim(),
        textContent: (visualEditRequest?.targetElement?.textContent || '').trim(),
      }
      : null;
    const visualSelectionPromptAddon = strictVisualAnchors.length > 1
      ? `\n\nVISUAL_SELECTIONS:\n${strictVisualAnchors
        .slice(0, 8)
        .map((anchor, index) => {
          const selector = selectorForAnchor(anchor);
          const text = (anchor.innerText || '').slice(0, 80);
          const route = anchor.routePath || '/';
          return `${index + 1}. selector=${selector} route=${route}${text ? ` text="${text}"` : ''}`;
        })
        .join('\n')}`
      : '';
    const requestPrompt = hasVisualEditRequest && visualTargetElement
      ? buildVisualEditPrompt(visualTargetElement, visualEditRequest?.editInstruction || '')
      : `${userMessage}${visualSelectionPromptAddon}`;
    const keepSelectionAfterRun = workspaceMode === 'visual';
    const forcedGenerationMode = options?.forceGenerationMode;
    const autoGenerationMode: 'new' | 'edit' = forcedGenerationMode
      ? forcedGenerationMode
      : (hasVisualEditRequest ? 'edit' : (currentProject?.id ? 'edit' : 'new'));
    const hasEditableFiles = files && Object.keys(files).length > 0;
    if (hasVisualEditRequest && !hasEditableFiles) {
      setError('Visual Edit braucht bestehende Projektdateien.');
      return;
    }
    const useEditContext = autoGenerationMode === 'edit' && hasEditableFiles;
    const generationProjectId = autoGenerationMode === 'edit' ? currentProject?.id : undefined;
    const supabaseGenerateContext = buildSupabaseGenerateContext(supabaseStatus);
    const backendIntentDetected = detectBackendIntent(requestPrompt);

    if (generationProjectId && Object.keys(files).length > 0) {
      void api.runSecurityScan({
        projectId: generationProjectId,
        environment: 'test',
        files,
      }).then((scan) => {
        if (!scan.success || !scan.summary) return;
        const critical = scan.summary.critical || 0;
        const high = scan.summary.high || 0;
        if (critical === 0 && high === 0) return;
        const fingerprint = `${generationProjectId}:${critical}:${high}`;
        if (lastSecurityWarningRef.current === fingerprint) return;
        lastSecurityWarningRef.current = fingerprint;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Security precheck: ${critical} critical / ${high} high Findings erkannt. Empfehlung: zuerst /security pruefen.`,
          },
        ]);
      }).catch(() => {
        // non-blocking precheck: ignore network/scan failures
      });
    }

    if (backendIntentDetected && !supabaseGenerateContext.connected) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Hinweis: Backend-/Fullstack-Intent erkannt. Verbinde optional Supabase (oben), damit Auth/DB/Storage direkt produktionsnah generiert werden.',
        }
      ]);
      setShowSupabaseModal(true);
    }

    if (isGenerating.current) return;
    isGenerating.current = true;
    setIsGeneratingLocked(true);
    startTimeline();

    // 1. Optimistic Update
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setPromptInput('');
    setLoading(true);
    setError(null);
    setIsRateLimited(false);
    setProviderRecoveryHint(null);
    setLastQualitySummary(null);
    setFixStatus('idle');
    setFixErrorContext(null);
    setAutoRepairState('idle');
    setAutoRepairErrorType(null);
    setRepairAttempts(0);
    setLastRuntimeError(null);
    setBuildErrors([]);
    setGeneratedSupabaseSchema('');
    setGeneratedDatabaseTables([]);
    setDatabaseSchemaCopied(false);
    if (workspaceMode === 'visual') {
      setPendingPatch(null);
      setLastVisualDiagnostics(null);
    }

    try {
      const screenshotPayload = extractScreenshotPayload(attachedImage);
      const response = await fetchGenerateWithTimeout(
        accessToken,
        {
          provider,
          mode: hasVisualEditRequest ? 'visual-edit' : undefined,
          generationMode: autoGenerationMode,
          prompt: requestPrompt,
          validate: true,
          bundle: true,
          files: useEditContext ? files : undefined,
          editAnchor: useEditContext
            ? (isReliableVisualAnchor(selectedEditAnchor || {}) ? selectedEditAnchor : strictVisualAnchors[0])
            : undefined,
          targetElement: hasVisualEditRequest ? visualTargetElement : undefined,
          editInstruction: hasVisualEditRequest ? visualEditRequest?.editInstruction : undefined,

          image: attachedImage, // legacy field (data URL)
          screenshotBase64: screenshotPayload?.screenshotBase64,
          screenshotMimeType: screenshotPayload?.screenshotMimeType,
          knowledgeBase: knowledgeFiles.length > 0 ? knowledgeFiles.map(f => ({ path: f.name, content: f.content })) : undefined,
          userId: user?.id, // Pass User ID for logging
          projectId: generationProjectId, // Pass Project ID for persistence only in edit mode
          featureFlags: { enterprise: defaultEnterpriseFlags },
          integrations: {
            supabase: supabaseGenerateContext,
          },
        }
      );

      const text = await response.text();
      const data = parseJsonPayload(text, `Generate-Response (${response.status})`);
      applyTimelineTiming(data);
      const repairStatusFromResponse = data?.repairStatus;
      const repairErrorFromResponse = typeof data?.repairError === 'string' ? data.repairError.trim() : '';

      // Update Rate Limit Info
      if (data.rateLimit) {
        updateRateLimit(data.rateLimit);
      }

      if (!response.ok || !data.success) {
        if (repairStatusFromResponse === 'failed') {
          const repairMessage =
            repairErrorFromResponse ||
            (Array.isArray(data?.errors) ? data.errors.join('\n') : '') ||
            (typeof data?.error === 'string' ? data.error : '') ||
            'Validation repair failed.';
          markNeedsFix(repairMessage);
        }
        const normalizedCategory =
          normalizeProviderErrorCategory(data?.errorCategory) ||
          ((response.status === 429 || data?.code === 'RATE_LIMIT_EXCEEDED') ? 'rate_limit' : null);
        const suggestedProvider = isProviderId(data?.suggestedProvider)
          ? data.suggestedProvider
          : getAlternateProvider(provider);

        setProviderRecoveryHint(null);

        if (response.status === 402 && data?.error === 'NO_CREDITS') {
          const blockedPlan = normalizeBillingPlan(data?.plan);
          const resetsAt = typeof data?.resetsAt === 'string' ? data.resetsAt : null;
          setNoCreditsModal({
            open: true,
            plan: blockedPlan,
            resetsAt,
          });
          setNoCreditsCountdown(formatCreditsResetCountdown(resetsAt));
          setError(null);
          setPromptInput(userMessage);
          setMessages(prev => prev.slice(0, -1));
          markTimelineFailed();
          void loadBillingStatus();
          return;
        }

        if (
          normalizedCategory === 'rate_limit' ||
          data.code === 'DAILY_REQUEST_LIMIT_EXCEEDED' ||
          data.code === 'DAILY_TOKEN_LIMIT_EXCEEDED' ||
          data.code === 'PROJECT_DAILY_REQUEST_LIMIT_EXCEEDED' ||
          data.code === 'PROJECT_DAILY_TOKEN_LIMIT_EXCEEDED'
        ) {
          const isDailyQuotaLimit =
            data.code === 'DAILY_REQUEST_LIMIT_EXCEEDED' ||
            data.code === 'DAILY_TOKEN_LIMIT_EXCEEDED';
          const isProjectQuotaLimit =
            data.code === 'PROJECT_DAILY_REQUEST_LIMIT_EXCEEDED' ||
            data.code === 'PROJECT_DAILY_TOKEN_LIMIT_EXCEEDED';
          const isGlobalServerRateLimit =
            typeof data.error === 'string' && data.error.includes('Generation rate limit exceeded');

          setIsRateLimited(true);

          if (data.code === 'DAILY_REQUEST_LIMIT_EXCEEDED') {
            setError(`Daily Request Limit Reached (${data.limit} requests/day). Upgrade plan for more.`);
          } else if (data.code === 'DAILY_TOKEN_LIMIT_EXCEEDED') {
            setError('Daily Token Limit Reached. Please try again tomorrow or upgrade.');
          } else if (data.code === 'PROJECT_DAILY_REQUEST_LIMIT_EXCEEDED') {
            setError(`Project Daily Request Limit Reached (${data.limit} requests/day for this project).`);
          } else if (data.code === 'PROJECT_DAILY_TOKEN_LIMIT_EXCEEDED') {
            setError('Project Daily Token Limit Reached. Switch project or try again tomorrow.');
          } else if (isGlobalServerRateLimit) {
            setError('Server-Limit erreicht (max. 10 Generierungen pro Minute). Warte kurz und versuche es erneut.');
          } else if (typeof data.error === 'string' && data.error.includes('OpenRouter API error: 429')) {
            setError('Gemini/OpenRouter Rate Limit erreicht. Bitte kurz warten oder Modell wechseln.');
          } else if (typeof data.error === 'string' && data.error.includes('OpenAI API error: 429')) {
            setError('OpenAI Rate Limit erreicht. Bitte kurz warten oder Modell wechseln.');
          } else {
            setError(`${getProviderLabel(provider)} ist aktuell limitiert. Bitte auf ${getProviderLabel(suggestedProvider)} wechseln.`);
          }

          if (!isDailyQuotaLimit && !isProjectQuotaLimit && !isGlobalServerRateLimit) {
            setProviderRecoveryHint({
              category: 'rate_limit',
              switchTo: suggestedProvider,
            });
          }
        } else if (normalizedCategory === 'provider_down') {
          setIsRateLimited(false);
          setError(`${getProviderLabel(provider)} ist aktuell nicht verfuegbar. Bitte auf ${getProviderLabel(suggestedProvider)} wechseln.`);
          setProviderRecoveryHint({
            category: 'provider_down',
            switchTo: suggestedProvider,
          });
        } else if (normalizedCategory === 'auth_error') {
          setIsRateLimited(false);
          setError(`${getProviderLabel(provider)} kann aktuell nicht authentifiziert werden. Bitte auf ${getProviderLabel(suggestedProvider)} wechseln.`);
          setProviderRecoveryHint({
            category: 'auth_error',
            switchTo: suggestedProvider,
          });
        } else if (data.code === 'MALFORMED_STRUCTURED_OUTPUT') {
          setError('Das KI-Ausgabeformat war ungueltig (JSON kaputt). Bitte Prompt erneut senden; die Pipeline hat bereits automatische Retries versucht.');
        } else {
          setError(data.error || data.errors?.join('\n') || 'Generation failed');
        }
        if (workspaceMode === 'visual') {
          setLastVisualDiagnostics({
            phase: 'chat-edit',
            code: data.code,
            message: (data.error || data.errors?.join('\n') || 'Generation failed'),
          });
        }

        // Restore user input so they can retry easily
        setPromptInput(userMessage);
        // Remove the 'optimistic' user message since it failed
        setMessages(prev => prev.slice(0, -1));
        markTimelineFailed();
        return;
      }

      void loadBillingStatus();
      const responseSupabaseSchema = typeof data?.supabaseSchema === 'string'
        ? data.supabaseSchema.trim()
        : '';
      const responseDatabaseTables = normalizeGeneratedDatabaseTables(data?.databaseTables);
      setGeneratedSupabaseSchema(responseSupabaseSchema);
      setGeneratedDatabaseTables(responseDatabaseTables);
      setDatabaseSchemaCopied(false);

      const filesObj = data.files.reduce((acc: any, file: any) => {
        acc[file.path] = file.content;
        return acc;
      }, {});
      const generatedTemplateId = typeof data?.pipeline?.templateId === 'string' && data.pipeline.templateId.trim().length > 0
        ? data.pipeline.templateId
        : 'auto-inferred';
      if (typeof data?.pipeline?.llmContextFiles === 'number') {
        setLastContextCount(data.pipeline.llmContextFiles);
      }
      setLastQualitySummary(toRuntimeQualitySummary(data));
      if (repairStatusFromResponse === 'failed') {
        const repairMessage =
          repairErrorFromResponse ||
          (Array.isArray(data?.errors) ? data.errors.join('\n') : '') ||
          'Validation repair failed.';
        markNeedsFix(repairMessage);
      } else if (repairStatusFromResponse === 'succeeded') {
        setFixStatus('auto_fixed');
        setFixErrorContext(null);
      }
      const rollbackApplied = Boolean(data?.pipeline?.rollback?.applied);
      const editOutcomeStatus = typeof data?.pipeline?.editOutcome?.status === 'string'
        ? data.pipeline.editOutcome.status
        : 'applied';
      const editOutcomeMessage =
        typeof data?.pipeline?.editOutcome?.message === 'string' && data.pipeline.editOutcome.message.trim().length > 0
          ? data.pipeline.editOutcome.message.trim()
          : (
            typeof data?.noOp?.reason === 'string' && data.noOp.reason.trim().length > 0
              ? data.noOp.reason.trim()
              : 'No effective file changes were detected for this edit request.'
          );
      const blockedScope = editOutcomeStatus === 'blocked_scope';
      const noOpDetected = editOutcomeStatus === 'noop' || Boolean(
        !rollbackApplied &&
        !blockedScope &&
        ((data?.noOp?.detected === true) ||
          (autoGenerationMode === 'edit' && Number(data?.pipeline?.smartDiff?.changedCount || 0) === 0))
      );
      const noOpReason = editOutcomeMessage;
      const hasAppliedChanges = editOutcomeStatus === 'applied' && !rollbackApplied && !noOpDetected;
      const changedPaths: string[] = [
        ...((data?.pipeline?.smartDiff?.added as string[]) || []),
        ...((data?.pipeline?.smartDiff?.removed as string[]) || []),
        ...((data?.pipeline?.smartDiff?.updated as string[]) || []),
      ];
      const operationApplied = Number(data?.pipeline?.operations?.applied || 0);
      const operationUnresolved = Number(data?.pipeline?.operations?.unresolved || 0);
      const changedPreview = changedPaths.slice(0, 5);
      const plannedPages: string[] = (data?.pipeline?.plan?.pages as string[]) || [];
      const shouldUseDiffReview = defaultEnterpriseFlags.diffPreview && workspaceMode !== 'visual';
      const awaitingPatchConfirmation = hasAppliedChanges && Boolean(selectedEditAnchor && shouldUseDiffReview);
      const responseSnapshotId =
        typeof data?.pipeline?.snapshot?.currentId === 'string' ? data.pipeline.snapshot.currentId : null;
      const responseSnapshotTimestamp =
        typeof data?.pipeline?.snapshot?.createdAt === 'string' ? data.pipeline.snapshot.createdAt : null;

      const applyChanges = () => {
        const beforeFiles = { ...files };
        const beforeDependencies = { ...dependencies };
        const nextDependencies = mergeDependencyMaps(
          dependencies,
          extractDependenciesFromFiles(filesObj),
          data.dependencies
        );
        const changedPathsForOperation = Array.from(new Set([
          ...Object.keys(beforeFiles),
          ...Object.keys(filesObj),
        ])).filter((path) => filesObj[path] !== beforeFiles[path]);
        lastLocalProjectWriteAtRef.current = Date.now();
        try {
          lastAppliedFileMapRef.current = JSON.stringify(filesObj);
        } catch {
          lastAppliedFileMapRef.current = '{}';
        }
        setFiles(filesObj);
        setDependencies(nextDependencies);
        broadcastLiveSnapshot(filesObj, nextDependencies);
        pushSnapshot(filesObj, {
          label: userMessage.substring(0, 80) || 'Generation',
          snapshotId: responseSnapshotId,
          timestamp: responseSnapshotTimestamp,
        });

        // Enterprise Feature 6: Push to Operation History
        operationHistory.push({
          label: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''),
          beforeFiles,
          afterFiles: filesObj,
          changedPaths: changedPathsForOperation,
          beforeDependencies,
          afterDependencies: nextDependencies,
          metadata: {
            prompt: userMessage,
            editAnchor: selectedEditAnchor?.selector,
            outcome: editOutcomeStatus,
          },
        });
      };

      const persistProject = async () => {
        if (!user) return;
        try {
          const projectData = {
            user_id: user.id,
            name: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''),
            code: JSON.stringify(filesObj),
            prompt: userMessage,
            status: 'draft' as const,
            template: attachedImage ? 'image-import' : generatedTemplateId,
            views: 0,
            is_public: false
          };

          let savedProject: Project;
          if (currentProject && autoGenerationMode === 'edit') {
            if (!hasAppliedChanges) {
              savedProject = currentProject;
              setMessages(prev => [...prev, { role: 'assistant', content: `Projekt nicht gespeichert (${editOutcomeStatus}): ${editOutcomeMessage}` }]);
            } else {
              lastLocalProjectWriteAtRef.current = Date.now();
              savedProject = await api.updateProject(currentProject.id, {
                code: JSON.stringify(filesObj),
                prompt: userMessage,
                template: attachedImage ? 'image-import' : generatedTemplateId,
                updated_at: new Date().toISOString()
              });
              setMessages(prev => [...prev, { role: 'assistant', content: 'Project updated in database.' }]);
            }
          } else {
            lastLocalProjectWriteAtRef.current = Date.now();
            savedProject = await api.createProject(projectData);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Neues Projekt in Datenbank gespeichert.' }]);
            setSearchParams({ project_id: savedProject.id });

            // If we just created the project, the PREVIOUS messages (user prompt + AI response) 
            // were likely NOT saved to DB because projectId was null during generation.
            // We should ideally sync them now, OR just accept they are lost from DB but visible in UI.
            // For V1, let's accept they are visible in UI. Next generation will save.
          }
          setCurrentProject(savedProject);

        } catch (saveError) {
          console.error('Failed to save project:', saveError);
          setMessages(prev => [...prev, { role: 'assistant', content: 'Warning: Code generated but failed to save to database.' }]);
        }
      };

      if (hasAppliedChanges) {
        if (awaitingPatchConfirmation) {
          const pendingChanges = Array.from(new Set([
            ...Object.keys(files),
            ...Object.keys(filesObj),
          ])).filter((path) => filesObj[path] !== files[path]);
          setPendingPatch({
            label: userMessage,
            changes: pendingChanges.map(p => ({
              path: p,
              before: files[p] || '',
              after: filesObj[p] || '',
            })),
            onConfirm: () => {
              void (async () => {
                applyChanges();
                setPendingPatch(null);
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: 'Patch wurde angewendet.'
                }]);
                if (changedPreview.length > 0) {
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Geaenderte Dateien: ${changedPreview.join(', ')}${changedPaths.length > changedPreview.length ? ', ...' : ''}`
                  }]);
                }
                if (plannedPages.length > 1) {
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Verfuegbare Seiten: ${plannedPages.join(', ')}. Nutze oben die Adresszeile (z. B. /cart), um sie in der Preview zu oeffnen.`
                  }]);
                }
                await persistProject();
              })();
            },
            onCancel: () => {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Patch-Anwendung abgebrochen. Es wurden keine Dateien geschrieben.'
              }]);
            },
          });
        } else {
          applyChanges();
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: rollbackApplied
          ? `Aenderung wurde aus Sicherheitsgruenden verworfen. ${editOutcomeMessage}`
          : blockedScope
            ? `Edit wurde durch Scope-Schutz blockiert. ${editOutcomeMessage}`
            : noOpDetected
              ? `Keine effektiven Aenderungen erkannt. ${noOpReason}`
              : awaitingPatchConfirmation
                ? 'Patch-Vorschau bereit. Bitte aenderungen bestaetigen oder abbrechen.'
                : 'Code erfolgreich generiert! Du kannst es jetzt in der Vorschau sehen.'
      }]);

      if (autoGenerationMode === 'edit' && operationUnresolved > 0 && !hasAppliedChanges) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Edit-Operationen nicht angewendet (${operationApplied}/${operationApplied + operationUnresolved}). Ich habe nur die stabilen Aenderungen uebernommen.`
        }]);
      }
      if (!awaitingPatchConfirmation && hasAppliedChanges && changedPreview.length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Geaenderte Dateien: ${changedPreview.join(', ')}${changedPaths.length > changedPreview.length ? ', ...' : ''}`
        }]);
      }
      if (!awaitingPatchConfirmation && hasAppliedChanges && plannedPages.length > 1) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Verfuegbare Seiten: ${plannedPages.join(', ')}. Nutze oben die Adresszeile (z. B. /cart), um sie in der Preview zu oeffnen.`
        }]);
      }
      if (!awaitingPatchConfirmation) {
        await persistProject();
      }

      if (workspaceMode === 'visual') {
        if (awaitingPatchConfirmation) {
          setLastVisualDiagnostics({
            phase: 'chat-edit',
            code: 'REVIEW_REQUIRED',
            message: `Patch-Vorschau bereit (${changedPaths.length} Datei(en)).`,
          });
        } else if (hasAppliedChanges) {
          setLastVisualDiagnostics({
            phase: 'chat-edit',
            code: 'APPLIED',
            message: `Chat-Edit angewendet (${changedPaths.length} Datei(en)).`,
          });
        } else {
          setLastVisualDiagnostics({
            phase: 'chat-edit',
            code: editOutcomeStatus.toUpperCase(),
            message: editOutcomeMessage,
          });
        }
      }

    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred';
      if (errorMessage === GENERATE_TIMEOUT_MESSAGE) {
        setIsRateLimited(false);
        setError(GENERATE_TIMEOUT_MESSAGE);
        setProviderRecoveryHint(null);
        if (workspaceMode === 'visual') {
          setLastVisualDiagnostics({
            phase: 'chat-edit',
            code: 'CHAT_EDIT_TIMEOUT',
            message: GENERATE_TIMEOUT_MESSAGE,
          });
        }
        setPromptInput(userMessage);
        setMessages(prev => prev.slice(0, -1));
        markTimelineFailed();
        return;
      }
      const normalized = String(errorMessage).toLowerCase();
      const networkOrTimeoutError = /failed to fetch|network|timeout|timed out|aborted|econnreset|enotfound/.test(normalized);
      if (networkOrTimeoutError) {
        setIsRateLimited(false);
        const suggestedProvider = getAlternateProvider(provider);
        setError(`${getProviderLabel(provider)} ist aktuell nicht erreichbar. Bitte auf ${getProviderLabel(suggestedProvider)} wechseln.`);
        setProviderRecoveryHint({
          category: 'provider_down',
          switchTo: suggestedProvider,
        });
      } else {
        setError(errorMessage);
        setProviderRecoveryHint(null);
      }
      if (workspaceMode === 'visual') {
        setLastVisualDiagnostics({
          phase: 'chat-edit',
          code: 'CHAT_EDIT_ERROR',
          message: errorMessage,
        });
      }
      // Restore user input on network error too
      setPromptInput(userMessage);
      setMessages(prev => prev.slice(0, -1));
      markTimelineFailed();
    } finally {
      isGenerating.current = false;
      setIsGeneratingLocked(false);
      setLoading(false);
      setAttachedImage(null); // Clear image after generation
      if (!keepSelectionAfterRun) {
        clearVisualSelection();
      }
    }
  };

  const handleApplySelectedElementEdit = async () => {
    if (!selectedEditAnchor) {
      setError('Bitte zuerst ein Element in der Preview auswaehlen.');
      return;
    }
    const instruction = visualEditInstruction.trim();
    if (!instruction) {
      setError('Bitte beschreibe die Aenderung fuer das ausgewaehlte Element.');
      return;
    }
    const targetElement: VisualEditTargetElement = {
      tagName: (selectedEditAnchor.tagName || 'element').toLowerCase(),
      className: selectedEditAnchor.className || '',
      textContent: selectedEditAnchor.innerText || selectedEditAnchor.textContent || '',
    };
    const contextualPrompt = buildVisualEditPrompt(targetElement, instruction);
    setPromptInput(contextualPrompt);
    await handleGenerate(false, contextualPrompt, {
      targetElement,
      editInstruction: instruction,
    });
  };

  const contextFileCount = Object.keys(files || {}).filter((path) => path.startsWith('src/')).length;
  const isEditMode = Boolean(currentProject?.id);
  const sidebarContextCount = lastContextCount ?? contextFileCount;
  const sidebarTitle = isEditMode ? (currentProject?.name || 'Current Project') : 'AI Architect';
  const sidebarModeLabel = workspaceMode === 'visual'
    ? 'VISUAL EDIT MODE'
    : (isEditMode ? 'EDIT MODE' : 'NEW PROJECT');
  const qualityStatusLabel = lastQualitySummary
    ? (lastQualitySummary.status === 'excellent'
      ? 'Excellent'
      : lastQualitySummary.status === 'good'
        ? 'Good'
        : lastQualitySummary.status === 'critical'
          ? 'Critical'
          : 'Needs Work')
    : null;
  const qualityToneClass = lastQualitySummary
    ? (lastQualitySummary.status === 'excellent'
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
      : lastQualitySummary.status === 'good'
        ? 'border-blue-400/40 bg-blue-500/10 text-blue-200'
        : lastQualitySummary.status === 'critical'
          ? 'border-red-400/40 bg-red-500/10 text-red-200'
          : 'border-amber-400/40 bg-amber-500/10 text-amber-200')
    : 'border-slate-600/40 bg-slate-700/20 text-slate-200';
  const isVisualMode = workspaceMode === 'visual';
  const supabaseConnectedCount = Number(Boolean(supabaseStatus.test?.connected)) + Number(Boolean(supabaseStatus.live?.connected));
  const supabaseConnectionLabel =
    supabaseConnectedCount === 2
      ? 'Supabase: Test + Live'
      : supabaseConnectedCount === 1
        ? (supabaseStatus.live?.connected ? 'Supabase: Live' : 'Supabase: Test')
        : 'Supabase: Disconnected';
  const gitHubConnected = Boolean(gitHubSyncStatus?.connected);
  const gitHubConnectionLabel = gitHubConnected
    ? (gitHubSyncStatus?.repoUrl ? `GitHub connected: ${gitHubSyncStatus.repoUrl}` : 'GitHub connected')
    : 'GitHub sync';
  const isPublished = publication?.status === 'published';
  const publishButtonLabel = isPublished ? 'Published' : 'Publish';
  const publishButtonTone = isPublished
    ? 'bg-blue-600 hover:bg-blue-500'
    : 'bg-[#2f5ce9] hover:bg-[#416bf1]';
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;
  const recentSnapshots = snapshotHistoryMeta
    .map((entry, index) => ({ ...entry, index }))
    .slice(Math.max(0, snapshotHistoryMeta.length - 5))
    .reverse();
  const reliableVisualSelectionCount = selectedEditAnchors.filter(isReliableVisualAnchor).length;
  const previewStageWidth = previewStageRef.current?.clientWidth || 0;
  const previewStageHeight = previewStageRef.current?.clientHeight || 0;
  const selectedVisualOverlayRect = selectedVisualRect
    ? {
      top: Math.max(0, Math.min(selectedVisualRect.top, Math.max(0, previewStageHeight - 1))),
      left: Math.max(0, Math.min(selectedVisualRect.left, Math.max(0, previewStageWidth - 1))),
      width: Math.max(1, Math.min(selectedVisualRect.width, Math.max(1, previewStageWidth - selectedVisualRect.left))),
      height: Math.max(1, Math.min(selectedVisualRect.height, Math.max(1, previewStageHeight - selectedVisualRect.top))),
    }
    : null;
  const visualPopupWidth = 320;
  const visualPopupLeft = selectedVisualOverlayRect
    ? Math.max(8, Math.min(selectedVisualOverlayRect.left, Math.max(8, previewStageWidth - visualPopupWidth - 8)))
    : 8;
  const visualPopupTop = selectedVisualOverlayRect
    ? Math.min(
      selectedVisualOverlayRect.top + selectedVisualOverlayRect.height + 10,
      Math.max(8, previewStageHeight - 140)
    )
    : 8;
  const primaryVisualFile = selectedEditAnchor ? resolveAnchorProjectFile(selectedEditAnchor) : null;
  const primaryVisualAnchorIsValid = Boolean(selectedEditAnchor && isReliableVisualAnchor(selectedEditAnchor));
  const { visualStatus } = useVisualWorkflow({
    isVisualMode,
    isApplyingVisualPatch,
    loading,
    hasPendingPatch: Boolean(pendingPatch),
    hasError: Boolean(error),
    reliableSelectionCount: reliableVisualSelectionCount,
    isInspectMode,
  });
  const renderMessageWithCode = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={`code-${idx}`} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] text-white">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const activeSurfaceMeta = SURFACE_MODE_META[activeSurfaceMode];
  const headerSurfaceModes: SurfaceMode[] = ['preview', ...pinnedSurfaceModes.filter((mode, index, arr) => mode !== 'preview' && arr.indexOf(mode) === index)];
  const showPreviewToolbar = activeSurfaceMode === 'preview' || activeSurfaceMode === 'design';
  const showPreviewFrame = activeSurfaceMode === 'preview' || activeSurfaceMode === 'design';
  const hasFiles = Object.keys(files).length > 0;
  const showStarterSuggestions = !currentProject?.id && !hasFiles && messages.length === 0 && !isVisualMode;
  const creditTotal = Math.max(1, Math.round(Number(billingStatus?.creditsTotal || 1)));
  const creditUsed = Math.max(0, Math.round(Number(billingStatus?.creditsUsed || 0)));
  const creditRemaining = Math.max(0, creditTotal - creditUsed);
  const creditRemainingRatio = billingStatus?.plan === 'enterprise'
    ? 1
    : Math.max(0, Math.min(1, creditRemaining / creditTotal));
  const creditsBadgeToneClass = billingStatus?.plan === 'enterprise'
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
    : creditRemainingRatio < 0.2
      ? 'border-red-400/40 bg-red-500/15 text-red-100'
      : creditRemainingRatio < 0.5
        ? 'border-amber-400/40 bg-amber-500/15 text-amber-100'
        : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100';
  const creditsBadgeLabel = billingStatus
    ? (billingStatus.plan === 'enterprise' ? 'Unlimited credits' : `${creditRemaining} credits left`)
    : '';
  const supabaseSqlEditorUrl =
    supabaseStatus.live?.links?.sqlEditor ||
    supabaseStatus.test?.links?.sqlEditor ||
    (supabaseStatus.live?.projectRef
      ? `https://supabase.com/dashboard/project/${supabaseStatus.live.projectRef}/sql/new`
      : supabaseStatus.test?.projectRef
        ? `https://supabase.com/dashboard/project/${supabaseStatus.test.projectRef}/sql/new`
        : 'https://supabase.com/dashboard/projects');
  const showDatabaseSetupPanel = generatedSupabaseSchema.length > 0;

  const handleToggleSurfacePin = (mode: SurfaceMode) => {
    setPinnedSurfaceModes((prev) => {
      if (prev.includes(mode)) {
        const next = prev.filter((item) => item !== mode);
        return next.length > 0 ? next : DEFAULT_PINNED_SURFACE_MODES;
      }
      return [...prev, mode];
    });
  };

  const handleSelectSurfaceMode = (mode: SurfaceMode) => {
    setActiveSurfaceMode(mode);
    setShowSurfaceMenu(false);

    if (mode === 'cloud') {
      if (currentProject?.id) {
        void loadCloudState(currentProject.id);
        void loadCloudOverview(currentProject.id);
      }
    }

    if (mode === 'code') {
      setView('code');
      if (workspaceMode === 'visual') {
        setWorkspaceMode('chat');
      }
      return;
    }

    setView('preview');
    if (mode === 'design') {
      if (workspaceMode !== 'visual') {
        setWorkspaceMode('visual');
      }
      return;
    }
    if (workspaceMode === 'visual') {
      setWorkspaceMode('chat');
    }
  };

  const handleOpenPublishModal = () => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt erstellen, bevor du publishen kannst.');
      return;
    }
    setShowPublishModal(true);
    void loadPublishStatus(currentProject.id);
  };

  const openBillingPage = useCallback(() => {
    window.open('/billing', '_blank', 'noopener,noreferrer');
  }, []);

  const closeNoCreditsModal = useCallback(() => {
    setNoCreditsModal((prev) => ({
      ...prev,
      open: false,
    }));
  }, []);

  const handleNoCreditsUpgrade = useCallback(async () => {
    try {
      setNoCreditsUpgradeLoading(true);
      setError(null);
      // TODO: Replace mock-upgrade with Stripe checkout when ready
      // await fetch('/api/billing/create-checkout-session', { ... })
      const response = await api.mockUpgradePlan('pro');
      if (!response.success) {
        throw new Error(response.error || 'Upgrade failed');
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Plan upgraded to Pro (mock billing).' },
      ]);
      await loadBillingStatus();
      closeNoCreditsModal();
    } catch (upgradeError: any) {
      setError(upgradeError?.message || 'Upgrade failed');
    } finally {
      setNoCreditsUpgradeLoading(false);
    }
  }, [closeNoCreditsModal, loadBillingStatus]);

  const handleShareProject = async () => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }

    const shareUrl = `${window.location.origin}/generator?project_id=${currentProject.id}`;
    const shareTitle = currentProject.name || 'Loomic Project';

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: 'Check this Loomic project',
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Projekt-Link kopiert und bereit zum Teilen.' },
        ]);
      }
    } catch (shareError: any) {
      if (shareError?.name !== 'AbortError') {
        setError('Projekt-Link konnte nicht geteilt werden.');
      }
    }
  };

  const handleCopySupabaseSchema = async () => {
    if (!generatedSupabaseSchema.trim()) return;
    try {
      await navigator.clipboard.writeText(generatedSupabaseSchema);
      setDatabaseSchemaCopied(true);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Supabase SQL wurde in die Zwischenablage kopiert.' },
      ]);
    } catch {
      setError('SQL konnte nicht kopiert werden.');
    }
  };

  const handleStarterSuggestionClick = (prompt: string) => {
    if (loading || isGeneratingLocked || isAutoRepairing || !prompt.trim()) return;
    setPromptInput(prompt);
    void handleGenerate(false, prompt);
  };

  const handleUseTemplate = (template: GalleryTemplate) => {
    if (loading || isGeneratingLocked || isAutoRepairing) return;
    setShowTemplateGallery(false);
    setPromptInput(template.prompt);
    void handleGenerate(false, template.prompt, undefined, { forceGenerationMode: 'new' });
  };

  return (
    <div className="font-display h-screen overflow-hidden bg-[#0b0c10] text-slate-100 flex">
      <style>{`
        .glass-effect {
            background: rgba(18, 21, 28, 0.82);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(148, 163, 184, 0.16);
        }
        .glow-button {
            box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
        }
        .glow-button:hover {
            box-shadow: 0 0 30px rgba(124, 58, 237, 0.5);
        }
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
      `}</style>

      {/* Wrapper for main content - Full width now */}
      <div className="flex-1 flex h-full overflow-hidden">

        {/* Chat Sidebar - Lovable exact-style */}
        <aside className="h-full w-[440px] min-w-[320px] max-w-[40vw] flex flex-col border-r border-[#242935] bg-[#0b0c10] text-slate-100 z-20 shrink-0">
          <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/90">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-[0.08em] text-white">{sidebarTitle}</h2>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">{sidebarModeLabel}</p>
            </div>

            <div className="flex items-center gap-1">

              <div ref={modelSwitcherRef} className="relative">
                <button
                  onClick={() => setShowModelSwitcher((prev) => !prev)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                  title="AI Model wechseln"
                >
                  <span className="material-icons-round text-[21px]">dataset</span>
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-[#0b0c10] bg-primary" />
                </button>

                {showModelSwitcher && (
                  <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-700 bg-[#161821] p-1.5 shadow-2xl">
                    {MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setProvider(model.id);
                          setProviderRecoveryHint(null);
                          setIsRateLimited(false);
                          setShowModelSwitcher(false);
                        }}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${provider === model.id ? 'bg-primary/15 border border-primary/30' : 'border border-transparent hover:bg-white/5'}`}
                      >
                        <span className={`material-icons-round text-base ${model.tone}`}>{model.icon}</span>
                        <span className="text-xs font-medium text-slate-200">{model.name}</span>
                        {provider === model.id && <span className="material-icons-round ml-auto text-sm text-primary">check</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 pt-6 pb-36">
            {!isVisualMode && (
              <div className="flex justify-center mb-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-[#171922] px-3 py-1.5">
                  <span className="material-icons-round text-[16px] text-primary">folder</span>
                  <span className="text-xs text-slate-400">Context: <span className="font-semibold text-slate-200">{sidebarContextCount} files selected</span></span>
                </div>
              </div>
            )}

            {lastQualitySummary && (
              <div className="mb-4 rounded-xl border border-slate-700 bg-[#171922] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">Quality</p>
                  <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${qualityToneClass}`}>
                    {qualityStatusLabel}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-lg font-semibold text-white">{lastQualitySummary.score}</p>
                  <p className="pb-0.5 text-xs text-slate-400">/100 ({lastQualitySummary.grade})</p>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Critical: <span className="font-semibold text-slate-200">{lastQualitySummary.criticalCount}</span>
                  {' '}| Warnings: <span className="font-semibold text-slate-200">{lastQualitySummary.warningCount}</span>
                </p>
                {lastQualitySummary.repair.attempted && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Repair: {lastQualitySummary.repair.initialErrorCount} -&gt; {lastQualitySummary.repair.finalErrorCount}
                    {' '}errors ({lastQualitySummary.repair.attemptsExecuted} attempts)
                  </p>
                )}
                {lastQualitySummary.recommendedAction && (
                  <p className="mt-2 rounded-md border border-slate-700 bg-[#0f1118] p-2 text-[10px] text-slate-300">
                    {lastQualitySummary.recommendedAction}
                  </p>
                )}
              </div>
            )}

            {isVisualMode ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-slate-700 bg-[#171922] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Selection</p>
                    <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${visualStatus?.tone || 'border-slate-600 text-slate-300'}`}>
                      {visualStatus?.label || 'Idle'}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Waehle gezielt ein Element in der Preview. Ohne stabilen `data-source-id` wird kein Patch angewendet.
                  </p>
                  <div className="mt-3 space-y-1 rounded-lg border border-slate-800 bg-[#0f1118] p-2">
                    <p className="text-[11px] text-slate-300">
                      Selection: <span className="font-semibold text-slate-100">{selectedEditAnchors.length}</span> total, <span className="font-semibold text-emerald-300">{reliableVisualSelectionCount}</span> valid
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {primaryVisualFile ? `file: ${primaryVisualFile}` : 'file: not resolved'}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {selectedEditAnchor?.sourceId ? `source: ${selectedEditAnchor.sourceId}` : 'source: missing'}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={selectParentAnchor}
                      className="rounded-lg border border-slate-600 bg-[#0f1118] px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white"
                    >
                      Parent
                    </button>
                    <button
                      onClick={activateInlineTextEdit}
                      disabled={!selectedEditAnchor || !isReliableVisualAnchor(selectedEditAnchor)}
                      className="rounded-lg border border-slate-600 bg-[#0f1118] px-2.5 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Inline text
                    </button>
                    <button
                      onClick={clearVisualSelection}
                      className="rounded-lg border border-slate-700 bg-[#0f1118] px-2.5 py-1.5 text-xs text-slate-300"
                    >
                      Clear
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={autoInlineEdit}
                      onChange={(event) => setAutoInlineEdit(event.target.checked)}
                      className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                    />
                    Direktes Text-Edit bei Klick
                  </label>
                  {visualSaveNotice && (
                    <p className="mt-2 text-[11px] text-emerald-300">{visualSaveNotice}</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#171922] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Edit Controls</p>
                  <p className="mt-1 text-[11px] text-slate-500">Fuehre nur gezielte, lokale Aenderungen aus.</p>
                  <div className="mt-3">
                    <VisualEditPanel
                      selectedAnchors={selectedEditAnchors}
                      validSelectedCount={reliableVisualSelectionCount}
                      primaryIsValid={primaryVisualAnchorIsValid}
                      isApplying={isApplyingVisualPatch}
                      onApplyIntent={handleApplyVisualIntent}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#171922] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Review & History</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {pendingPatch
                      ? `Patch bereit (${pendingPatch.changes.length} Dateien).`
                      : 'Noch kein ausstehender Patch.'}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleUndoOperation}
                      disabled={!canUndo}
                      className="rounded-lg border border-slate-600 bg-[#0f1118] px-2.5 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Undo
                    </button>
                    <button
                      onClick={handleRedoOperation}
                      disabled={!canRedo}
                      className="rounded-lg border border-slate-600 bg-[#0f1118] px-2.5 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Redo
                    </button>
                    <span className="ml-auto text-[10px] text-slate-500">
                      Ops: {operationHistory.totalOperations}
                    </span>
                  </div>
                  {lastVisualDiagnostics && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-[#0f1118] p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Diagnostics
                      </p>
                      <p className="mt-1 text-[11px] text-slate-200">
                        {lastVisualDiagnostics.code
                          ? `[${lastVisualDiagnostics.code}] ${lastVisualDiagnostics.message}`
                          : lastVisualDiagnostics.message}
                      </p>
                      {Array.isArray(lastVisualDiagnostics.failedReasons) && lastVisualDiagnostics.failedReasons.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {lastVisualDiagnostics.failedReasons.slice(0, 2).map((item, index) => (
                            <p key={`${item.file}-${item.selector}-${index}`} className="text-[10px] text-rose-300">
                              {item.selector || item.file}: {item.reason}
                            </p>
                          ))}
                        </div>
                      )}
                      {Array.isArray(lastVisualDiagnostics.checkedPaths) && lastVisualDiagnostics.checkedPaths.length > 0 && (
                        <p className="mt-2 truncate text-[10px] text-slate-500">
                          Checked: {lastVisualDiagnostics.checkedPaths.slice(0, 3).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
              {messages.length === 0 ? (
                showStarterSuggestions ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-700 bg-[#171922] p-5">
                      <p className="text-sm font-semibold text-white">Start with a proven prompt</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Pick a starter and generate instantly.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {STARTER_SUGGESTION_CARDS.map((card) => (
                        <button
                          key={card.title}
                          onClick={() => handleStarterSuggestionClick(card.prompt)}
                          className="group bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-left hover:border-purple-500 hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          <p className="text-3xl">{card.emoji}</p>
                          <p className="mt-2 font-semibold text-white">{card.title}</p>
                          <p className="mt-1 text-sm text-slate-400">{card.description}</p>
                          <p className="mt-2 text-xs font-semibold text-purple-400 opacity-0 transition-opacity group-hover:opacity-100">
                            → Try this
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-700 bg-[#171922] p-6 shadow-sm">
                    <p className="text-[15px] leading-relaxed text-slate-300">Describe your first change to get started.</p>
                  </div>
                )
              ) : (
                messages.map((msg, index) => {
                  const isAssistant = msg.role === 'assistant';
                  const isFileSummary = isAssistant && msg.content.startsWith('Geaenderte Dateien:');
                  const fileSummary = isFileSummary
                    ? msg.content.replace(/^Geaenderte Dateien:\s*/i, '').split(',').map((item) => item.trim()).filter(Boolean)
                    : [];

                  if (!isAssistant) {
                    return (
                      <div key={index} className="flex justify-end">
                        <div className="max-w-[92%] rounded-2xl rounded-tr-sm border border-slate-700 bg-[#171922] p-6 shadow-sm">
                          <p className="text-[15px] leading-relaxed text-slate-200 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  if (isFileSummary) {
                    return (
                      <div key={index} className="pl-12">
                        <div className="w-full rounded-xl border border-slate-700 bg-[#171922] p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-[#262936] flex items-center justify-center text-blue-400">
                              <span className="material-icons-round text-base">javascript</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{fileSummary[0] || 'Updated file'}</p>
                              <p className="truncate text-xs text-slate-500">src/components</p>
                            </div>
                            <span className="text-sm font-medium text-emerald-400">updated</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="flex items-start gap-3">
                      <div className="mt-0.5 h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-primary to-purple-700 flex items-center justify-center shadow-lg shadow-primary/25">
                        <span className="material-icons-round text-white">smart_toy</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-bold text-white">AI Assistant</span>
                          <span className="rounded border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">Completed</span>
                        </div>
                        <p className="text-[15px] leading-relaxed text-slate-300 whitespace-pre-wrap">{renderMessageWithCode(msg.content)}</p>
                      </div>
                    </div>
                  );
                })
              )}

              {loading && (
                <div className="pl-1">
                  <ThinkingProcess />
                </div>
              )}
              </div>
            )}
          </main>

          <footer className="border-t border-slate-800 bg-[#0d0f15]/90 px-4 pt-3 pb-4 backdrop-blur-xl">
            {isVisualMode && (
              <div className="mb-3 rounded-xl border border-slate-700 bg-[#171922] p-3">
                <p className="text-[11px] text-slate-400">
                  {pendingInlineEdits.length > 0
                    ? 'Save before chatting: Bitte zuerst Save oder Discard ausfuehren.'
                    : 'Ask AI to refine the selected element(s).'}
                </p>
                <div className="mt-2 relative rounded-xl border border-slate-700 bg-[#0f1118] focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
                  <textarea
                    className="w-full resize-none border-none bg-transparent p-3 pr-12 text-[14px] text-slate-100 placeholder:text-slate-500 outline-none"
                    placeholder="z.B. mach den Button moderner und den Titel groesser"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (!loading && !isGeneratingLocked && promptInput.trim()) {
                          handleGenerate();
                        }
                      }
                    }}
                    rows={2}
                  />
                  <button
                    onClick={() => void handleGenerate()}
                    disabled={loading || isGeneratingLocked || isAutoRepairing || reliableVisualSelectionCount === 0 || pendingInlineEdits.length > 0}
                    className={`absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 ${(loading || isGeneratingLocked || isAutoRepairing || reliableVisualSelectionCount === 0 || pendingInlineEdits.length > 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Apply visual AI edit"
                  >
                    <span className="material-icons-round text-[20px]">arrow_upward</span>
                  </button>
                </div>
              </div>
            )}

            {!isVisualMode && attachedImage && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-700 bg-[#171922] p-2">
                <img src={attachedImage} alt="Preview" className="h-11 w-11 rounded-md border border-slate-700 object-cover" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-200">Image attached</span>
                  <span className="text-[10px] text-slate-500">Ready to analyze</span>
                </div>
                <button onClick={removeImage} className="ml-auto rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {!isVisualMode && knowledgeFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {knowledgeFiles.slice(0, 2).map((file, idx) => (
                  <span key={`${file.name}-${idx}`} className="rounded-md border border-slate-700 bg-[#171922] px-2 py-1 text-[10px] text-slate-400">
                    {file.name}
                  </span>
                ))}
                {knowledgeFiles.length > 2 && (
                  <span className="rounded-md border border-slate-700 bg-[#171922] px-2 py-1 text-[10px] text-slate-400">+{knowledgeFiles.length - 2}</span>
                )}
              </div>
            )}

            {!isVisualMode && (
              <div className="rounded-[28px] border border-slate-700 bg-[#1a1d24] px-4 pt-3 pb-2 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                <textarea
                  className="w-full resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-6 text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="Ask Loomic..."
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!loading && !isGeneratingLocked && promptInput.trim()) {
                        handleGenerate();
                      }
                    }
                  }}
                  rows={1}
                />

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => knowledgeInputRef.current?.click()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 text-slate-300 transition-colors hover:border-slate-500 hover:bg-white/5 hover:text-white"
                      title="Add context"
                    >
                      <span className="material-icons-round text-[19px]">add</span>
                    </button>

                    <button
                      onClick={() => {
                        setWorkspaceMode('visual');
                        setActiveSurfaceMode('design');
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-600 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-white/5 hover:text-white"
                      title="Visual edits"
                    >
                      <span className="material-icons-round text-[17px]">gesture</span>
                      Visual edits
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {(fixStatus === 'needs_fix' || Boolean(fixErrorContext)) && (
                      <button
                        onClick={() => void handleFixIssue()}
                        disabled={loading || isGeneratingLocked || isAutoRepairing || Object.keys(files).length === 0}
                        className={`inline-flex h-8 items-center rounded-full border border-amber-400/70 bg-amber-500/15 px-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 ${(loading || isGeneratingLocked || isAutoRepairing || Object.keys(files).length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Run manual repair"
                      >
                        ✦ Fix Issue
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setPromptInput((prev) => (prev.trim() ? `Plan: ${prev}` : 'Plan: '));
                      }}
                      className="inline-flex h-8 items-center rounded-full border border-slate-600 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-white/5 hover:text-white"
                      title="Plan mode prompt"
                    >
                      Plan
                    </button>

                    <button
                      onClick={() => void handleGenerate()}
                      disabled={loading || isGeneratingLocked || isAutoRepairing}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 ${(loading || isGeneratingLocked || isAutoRepairing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title="Send"
                    >
                      <span className="material-icons-round text-[18px]">arrow_upward</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <input
              type="file"
              multiple
              ref={knowledgeInputRef}
              onChange={handleKnowledgeUpload}
              className="hidden"
              accept=".md,.txt,.json,.js,.jsx,.ts,.tsx,.css,.html"
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />

            {pendingIntentPlan && (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-semibold text-amber-100">
                  Plan suggestion detected: {pendingIntentPlan.intents.join(', ')}
                </p>
                <p className="mt-1 text-amber-200/90">
                  Keine automatische Ausfuehrung. Entscheide selbst.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerate(true, pendingIntentPlan.prompt)}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-slate-900 transition hover:bg-amber-400"
                  >
                    Apply Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const promptToIgnore = pendingIntentPlan.prompt;
                      setPendingIntentPlan(null);
                      setIgnoredPlannerPromptFingerprint(toPlannerPromptFingerprint(promptToIgnore));
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: 'assistant',
                          content: 'Plan ignoriert. Beim naechsten Senden wird der Prompt normal ausgefuehrt.',
                        },
                      ]);
                    }}
                    className="rounded-lg border border-amber-300/40 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/15"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-[10px] text-slate-600">
                {isVisualMode ? 'Visual mode active' : 'Press Enter to send'}
              </p>
              <div className="flex items-center gap-1">
                {fixStatus === 'auto_fixed' && (
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Auto-fixed
                  </span>
                )}
                {fixStatus === 'needs_fix' && (
                  <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Needs fix
                  </span>
                )}
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-slate-500">
                  {isAutoRepairing
                    ? 'Fix running'
                    : (isVisualMode
                      ? `${reliableVisualSelectionCount}/${selectedEditAnchors.length} valid selected`
                      : 'Model ready')}
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                <div className="flex items-start gap-2">
                  <span className="material-icons-round text-sm mt-0.5">error_outline</span>
                  <span className="whitespace-pre-wrap">{typeof error === 'string' ? error : JSON.stringify(error)}</span>
                </div>
                {providerRecoveryHint && (
                  <button
                    onClick={() => {
                      const switchTo = providerRecoveryHint.switchTo;
                      setProvider(switchTo);
                      setProviderRecoveryHint(null);
                      setIsRateLimited(false);
                      setError(null);
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: 'assistant',
                          content: `Modell gewechselt auf ${getProviderLabel(switchTo)}. Bitte Anfrage erneut senden.`,
                        },
                      ]);
                    }}
                    className="mt-2 ml-6 inline-flex items-center gap-1 rounded-lg bg-red-900/30 px-3 py-1.5 text-red-200 transition-colors hover:bg-red-900/50"
                  >
                    <span className="material-icons-round text-xs">sync_alt</span>
                    Wechsel zu {getProviderLabel(providerRecoveryHint.switchTo)}
                  </button>
                )}
                {(fixStatus === 'needs_fix' || Boolean(fixErrorContext)) && (
                  <button
                    onClick={() => void handleFixIssue()}
                    disabled={loading || isGeneratingLocked || isAutoRepairing || Object.keys(files).length === 0}
                    className={`mt-2 ml-6 inline-flex items-center gap-1 rounded-lg bg-amber-900/30 px-3 py-1.5 text-amber-200 transition-colors hover:bg-amber-900/50 ${(loading || isGeneratingLocked || isAutoRepairing || Object.keys(files).length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    ✦ Fix Issue
                  </button>
                )}
              </div>
            )}

            {buildErrors.length > 0 && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  Build Error
                </div>
                <div className="space-y-2">
                  {buildErrors.slice(0, 2).map((entry, index) => (
                    <div key={`${entry.file}:${entry.line}:${index}`} className="rounded-lg border border-red-400/20 bg-black/20 p-2">
                      <p className="font-semibold text-red-100">{entry.file}:{entry.line}</p>
                      <p className="mt-1 text-red-200/90">{entry.message}</p>
                      <p className="mt-1 text-red-300/80">{entry.suggestion}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleBuildErrorAutoFix}
                  disabled={isAutoRepairing || repairAttempts >= MAX_AUTO_REPAIRS}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-500/85 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-icons-round text-sm">build</span>
                  Auto-fix
                </button>
              </div>
            )}
          </footer>
        </aside>

        {/* Main Content (Preview/Code) */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#111318]">
          <header className="sticky top-0 z-20 flex h-[68px] min-w-0 shrink-0 items-center gap-2.5 border-b border-[#242935] bg-[#111318]/95 px-4 backdrop-blur">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex items-center rounded-xl border border-[#2f3542] bg-[#151923] p-1">
                {headerSurfaceModes.map((mode) => {
                  const meta = SURFACE_MODE_META[mode];
                  const isActive = activeSurfaceMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => handleSelectSurfaceMode(mode)}
                      className={`inline-flex h-9 items-center rounded-lg text-xs font-semibold transition-all duration-200 ${
                        isActive
                          ? 'min-w-[108px] justify-start gap-1.5 border border-blue-400/50 bg-blue-500/15 px-3.5 text-blue-200'
                          : 'w-9 justify-center border border-transparent px-0 text-slate-300 hover:border-[#3a4254] hover:bg-[#1c2230] hover:text-white'
                      }`}
                      title={meta.label}
                      aria-label={meta.label}
                    >
                      <span className="material-icons-round text-[17px]">{meta.icon}</span>
                      {isActive && <span className="truncate">{meta.label}</span>}
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowTemplateGallery(true)}
                  className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-colors hover:border-[#3b4458] hover:bg-[#1c2230] hover:text-white"
                  title="Browse templates"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <div ref={surfaceMenuRef} className="relative">
                  <button
                    onClick={() => setShowSurfaceMenu((prev) => !prev)}
                    className={`ml-1 flex h-8 w-8 items-center justify-center rounded-lg border text-slate-300 transition-colors ${
                      showSurfaceMenu
                        ? 'border-[#3b4458] bg-[#1c2230]'
                        : 'border-transparent hover:border-[#3b4458] hover:bg-[#1c2230]'
                    }`}
                    title="Workspace modes"
                  >
                    <span className="material-icons-round text-[18px]">more_horiz</span>
                  </button>
                  {showSurfaceMenu && (
                    <div className="absolute left-0 top-10 z-50 w-60 rounded-xl border border-[#2d3444] bg-[#12161f] p-2 shadow-2xl">
                      {SURFACE_MENU_MODES.map((mode) => {
                        const meta = SURFACE_MODE_META[mode];
                        const pinned = pinnedSurfaceModes.includes(mode);
                        const isActive = activeSurfaceMode === mode;
                        return (
                          <div key={mode} className="mb-1 last:mb-0">
                            <button
                              onClick={() => handleSelectSurfaceMode(mode)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                isActive
                                  ? 'bg-blue-500/15 text-blue-200'
                                  : 'text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <span className="material-icons-round text-[18px]">{meta.icon}</span>
                              <span className="flex-1">{meta.label}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleToggleSurfacePin(mode);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleToggleSurfacePin(mode);
                                  }
                                }}
                                className={`material-icons-round cursor-pointer text-[16px] ${
                                  pinned ? 'text-blue-400' : 'text-slate-500'
                                }`}
                                title={pinned ? 'Unpin mode' : 'Pin mode'}
                              >
                                keep
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {isVisualMode && visualStatus && (
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${visualStatus.tone}`}>
                  <span className="material-icons-round text-sm">tune</span>
                  {visualStatus.label}
                  <span className="text-[10px] opacity-80">
                    {reliableVisualSelectionCount} valid
                  </span>
                </div>
              )}

              {showPreviewToolbar && (
                <>
                  <div className="mx-1 h-6 w-px bg-white/10"></div>
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[#303749] bg-[#151923] px-2.5 backdrop-blur">
                    <div className="flex items-center rounded-xl border border-[#303749] bg-[#0f131b] p-1">
                      <button
                        onClick={() => setPreviewMode('desktop')}
                        title="Desktop"
                        className={`rounded-lg p-1.5 transition-all ${previewMode === 'desktop' ? 'bg-white/10 text-blue-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span className="material-icons-round text-[15px]">desktop_windows</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode('tablet')}
                        title="Tablet"
                        className={`rounded-lg p-1.5 transition-all ${previewMode === 'tablet' ? 'bg-white/10 text-blue-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span className="material-icons-round text-[15px]">tablet_mac</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode('mobile')}
                        title="Mobile"
                        className={`rounded-lg p-1.5 transition-all ${previewMode === 'mobile' ? 'bg-white/10 text-blue-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span className="material-icons-round text-[15px]">smartphone</span>
                      </button>
                    </div>

                    <div className="flex h-8 min-w-[120px] w-[clamp(140px,20vw,240px)] flex-1 items-center rounded-xl border border-[#303749] bg-[#0f131b] px-2.5">
                      <span className="material-icons-round mr-1.5 text-[15px] text-slate-400">language</span>
                      <input
                        value={previewPathInput}
                        onChange={(event) => setPreviewPathInput(event.target.value)}
                        onBlur={() => commitPreviewPath(previewPathInput)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitPreviewPath(previewPathInput);
                          }
                        }}
                        placeholder="/"
                        className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                      />
                    </div>

                    <div className="flex items-center rounded-xl border border-[#303749] bg-[#0f131b] p-1">
                      <button
                        onClick={openPreviewInNewTab}
                        disabled={!latestPreviewHtml}
                        title="Open in new tab"
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="material-icons-round text-[15px]">open_in_new</span>
                      </button>
                      <button
                        onClick={refreshPreview}
                        title="Refresh preview"
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <span className="material-icons-round text-[15px]">refresh</span>
                      </button>
                      <button
                        onClick={handleUndoOperation}
                        title="Undo (Ctrl+Z)"
                        disabled={!canUndo}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCcw className="h-[15px] w-[15px]" />
                      </button>
                      <button
                        onClick={handleRedoOperation}
                        title="Redo (Ctrl+Y)"
                        disabled={!canRedo}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCw className="h-[15px] w-[15px]" />
                      </button>
                      <div ref={historyDropdownRef} className="relative">
                        <button
                          onClick={() => setShowHistoryDropdown((prev) => !prev)}
                          title="History"
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Clock3 className="h-[15px] w-[15px]" />
                        </button>
                        {showHistoryDropdown && (
                          <div className="absolute right-0 top-9 z-50 w-72 rounded-xl border border-[#2d3444] bg-[#12161f] p-2 shadow-2xl">
                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                              History
                            </p>
                            {recentSnapshots.length === 0 ? (
                              <p className="px-2 py-1.5 text-xs text-slate-500">No snapshots yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {recentSnapshots.map((entry) => (
                                  <button
                                    key={entry.id}
                                    onClick={() => {
                                      setShowHistoryDropdown(false);
                                      restoreSnapshotAtIndex(entry.index, 'history');
                                    }}
                                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${
                                      entry.index === historyIndex
                                        ? 'border-blue-400/40 bg-blue-500/15 text-blue-200'
                                        : 'border-transparent text-slate-300 hover:border-[#364056] hover:bg-[#1c2230]'
                                    }`}
                                  >
                                    <p className="truncate text-[11px] font-semibold">{entry.label}</p>
                                    <p className="text-[10px] text-slate-500">{formatSnapshotTimestamp(entry.timestamp)}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isVisualMode && (
                      <button
                        onClick={() => setIsInspectMode((prev) => !prev)}
                        title={isInspectMode ? 'Disable visual inspect' : 'Enable visual inspect'}
                        className={`h-8 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
                          isInspectMode
                            ? 'bg-primary/20 text-primary border border-primary/35'
                            : 'border border-[#303749] text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="ml-2 flex shrink-0 items-center gap-2 border-l border-white/10 pl-2">
              <div className="flex items-center gap-1 rounded-2xl border border-[#303749] bg-[#151923] p-1">
                <button
                  onClick={() => setShowSupabaseModal(true)}
                  className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    supabaseConnectedCount > 0
                      ? 'border-emerald-400/30 bg-emerald-500/[0.10] text-emerald-200 hover:bg-emerald-500/[0.16]'
                      : 'border-[#364056] bg-[#121722] text-slate-300 hover:bg-[#192033]'
                  }`}
                  title={supabaseConnectionLabel}
                  aria-label="Supabase"
                >
                  <span className="material-icons-round text-[18px]">hub</span>
                  {supabaseConnectedCount > 0 && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  )}
                </button>
                <button
                  onClick={() => setShowGitHubSyncModal(true)}
                  className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    gitHubConnected
                      ? 'border-blue-400/30 bg-blue-500/[0.10] text-blue-200 hover:bg-blue-500/[0.16]'
                      : 'border-[#364056] bg-[#121722] text-slate-300 hover:bg-[#192033]'
                  }`}
                  title={gitHubConnectionLabel}
                  aria-label="GitHub sync"
                >
                  <span className="material-icons-round text-[18px]">source</span>
                  {gitHubConnected && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-300" />
                  )}
                </button>
                <Link
                  to="/dashboard"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  title="Go to Dashboard"
                >
                  <span className="material-icons-round text-[18px]">dashboard</span>
                </Link>
                <button
                  onClick={() => void handleShareProject()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  title="Share project"
                >
                  <span className="material-icons-round text-[18px]">share</span>
                </button>
              </div>

              {billingStatus && (
                <button
                  onClick={openBillingPage}
                  className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors hover:opacity-90 ${creditsBadgeToneClass}`}
                  title="Open billing details"
                >
                  <span className="text-sm">⚡</span>
                  {creditsBadgeLabel}
                </button>
              )}

              <Link
                to="/billing"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5e43dd] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#6a4af6]"
                title="Upgrade plan"
              >
                <span className="material-icons-round text-[17px]">flash_on</span>
                Upgrade
              </Link>
              <button
                onClick={handleOpenPublishModal}
                disabled={!currentProject?.id}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${publishButtonTone}`}
                title={currentProject?.id ? 'Publish project' : 'Create project first'}
              >
                {publishButtonLabel}
              </button>
            </div>
          </header>


          <div className="flex-1 p-8 pt-0 overflow-hidden flex flex-col items-center">
            <div className={`flex w-full flex-col gap-4 ${showDatabaseSetupPanel ? 'h-full overflow-y-auto pr-1' : 'h-full overflow-hidden'}`}>
              <div
                ref={previewStageRef}
                data-preview-stage="true"
                className={`relative flex min-h-[320px] w-full flex-1 flex-col overflow-hidden rounded-2xl border border-[#2b3242] bg-[#131823] shadow-2xl transition-all duration-300 ${(showPreviewFrame && previewMode === 'mobile')
                ? 'max-w-[390px] max-h-[844px] my-auto !h-auto aspect-[390/844] border-8 border-slate-800 rounded-[3rem] shadow-xl'
                : (showPreviewFrame && previewMode === 'tablet')
                  ? 'max-w-[834px] max-h-[1112px] my-auto !h-auto aspect-[834/1112] border-[10px] border-slate-800 rounded-[2.2rem] shadow-xl'
                  : ''
                }`}
              >
              {activeSurfaceMode === 'analytics' ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <span className="material-icons-round mb-4 text-5xl text-slate-400">query_stats</span>
                  <h3 className="text-4xl font-semibold text-white">Analytics</h3>
                  <p className="mt-4 max-w-xl text-lg text-slate-400">
                    To view analytics, you first need to publish your project.
                  </p>
                  <button
                    onClick={() => handleSelectSurfaceMode('preview')}
                    className="mt-8 rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Back to Preview
                  </button>
                </div>
              ) : activeSurfaceMode === 'security' ? (
                <div className="flex h-full flex-col p-5 sm:p-8">
                  <div className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-3xl font-semibold text-white">Security scan</h3>
                      <span className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-sm font-semibold text-blue-400">Up-to-date</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200">Add context</button>
                      <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Update (Free)</button>
                    </div>
                  </div>
                  <h4 className="mb-3 text-2xl font-semibold text-white">Detected issues</h4>
                  <div className="mb-4 inline-flex w-fit rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-200">
                    All
                  </div>
                  <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-center">
                    <div className="max-w-md px-6">
                      <span className="material-icons-round text-4xl text-slate-400">shield</span>
                      <p className="mt-3 text-2xl font-semibold text-white">All clear</p>
                      <p className="mt-2 text-slate-400">
                        No issues spotted. Keep in mind our scan can&apos;t catch every possible risk.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-3">
                    <p className="text-sm text-slate-400">Requires a current scan - update scan first</p>
                    <button
                      disabled
                      className="cursor-not-allowed rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-slate-300 opacity-70"
                    >
                      Try to fix all (Free)
                    </button>
                  </div>
                </div>
              ) : activeSurfaceMode === 'speed' ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <span className="material-icons-round mb-4 text-5xl text-slate-400">speed</span>
                  <h3 className="text-4xl font-semibold text-white">Page Speed Analysis</h3>
                  <p className="mt-4 max-w-2xl text-lg text-slate-400">
                    To view page speed analysis, you first need to publish your project.
                  </p>
                  <button
                    onClick={() => handleSelectSurfaceMode('preview')}
                    className="mt-8 rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Back to Preview
                  </button>
                </div>
              ) : activeSurfaceMode === 'cloud' ? (
                <CloudWorkspace
                  projectId={currentProject?.id}
                  projectName={currentProject?.name}
                  cloudState={cloudState}
                  cloudStateLoading={cloudStateLoading}
                  cloudOverview={cloudOverview}
                  cloudOverviewLoading={cloudOverviewLoading}
                  onEnableCloud={async (source?: string) => {
                    await enableCloud(source || 'cloud_workspace');
                  }}
                  onConnectExisting={() => {
                    setShowSupabaseModal(true);
                  }}
                  onRefresh={() => {
                    if (!currentProject?.id) return;
                    void Promise.all([
                      loadCloudState(currentProject.id),
                      loadCloudOverview(currentProject.id),
                      loadSupabaseIntegrationStatus(currentProject.id),
                    ]);
                  }}
                />
              ) : activeSurfaceMode === 'code' ? (
                hasFiles ? (
                  <MonacoEditor files={files} />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <span className="material-icons-round text-6xl opacity-20 animate-pulse">code_off</span>
                    <p className="text-xl font-medium text-slate-300">Kein Code vorhanden</p>
                    <p className="text-sm max-w-md text-center text-slate-500">Beschreibe links eine Idee, um Code zu generieren.</p>
                  </div>
                )
              ) : hasFiles ? (
                <CodePreview
                  files={files}
                  dependencies={dependencies}
                  visualEditEnabled={isVisualMode && isInspectMode}
                  previewPath={previewPath}
                  refreshToken={previewRefreshToken}
                  previewMode={previewMode}
                  onPreviewDocument={setLatestPreviewHtml}
                  onPreviewIssue={handlePreviewIssue}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <span className="material-icons-round text-6xl opacity-20 animate-pulse">browser_updated</span>
                  <p className="text-xl font-medium text-slate-300">{activeSurfaceMeta.label}</p>
                  <p className="text-sm max-w-md text-center text-slate-500">Beschreibe links eine Idee, um den Builder zu starten.</p>
                </div>
              )}

              {showPreviewFrame && autoRepairState !== 'idle' && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2">
                  <div
                    className={`pointer-events-auto w-[min(92vw,720px)] rounded-xl border px-3 py-2 shadow-xl backdrop-blur ${
                      autoRepairState === 'detecting'
                        ? 'border-amber-400/35 bg-amber-500/12 text-amber-100'
                        : autoRepairState === 'fixing'
                          ? 'border-blue-400/35 bg-blue-500/12 text-blue-100'
                          : autoRepairState === 'fixed'
                            ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-100'
                            : 'border-red-400/35 bg-red-500/12 text-red-100'
                    }`}
                  >
                    {autoRepairState === 'detecting' && (
                      <p className="text-sm font-semibold">⚡ Error detected, analyzing...</p>
                    )}
                    {autoRepairState === 'fixing' && (
                      <div>
                        <p className="text-sm font-semibold">
                          🔧 Auto-fixing: {autoRepairErrorType ? autoRepairErrorType.replace(/-/g, ' ') : 'runtime error'}...
                        </p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-300" />
                        </div>
                      </div>
                    )}
                    {autoRepairState === 'fixed' && (
                      <p className="text-sm font-semibold">✓ Auto-fixed successfully</p>
                    )}
                    {autoRepairState === 'failed' && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Could not auto-fix. Click to try manual repair.</p>
                          {lastRuntimeError?.message && (
                            <p className="mt-1 line-clamp-2 max-w-[520px] text-xs text-red-200/90">
                              {lastRuntimeError.message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void handleCopyLastRuntimeError()}
                            className="rounded-lg border border-red-300/35 px-2.5 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/20"
                          >
                            Copy Error
                          </button>
                          <button
                            onClick={handleAutoRepairRetry}
                            disabled={isAutoRepairing || repairAttempts >= MAX_AUTO_REPAIRS}
                            className="rounded-lg border border-red-300/35 px-2.5 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Try Again
                          </button>
                          <button
                            onClick={() => void handleFixIssue({ source: 'manual' })}
                            disabled={isAutoRepairing}
                            className="rounded-lg bg-red-500/85 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Manual Fix
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showPreviewFrame && isVisualMode && selectedVisualOverlayRect && (
                <>
                  <div
                    className="pointer-events-none absolute z-30 rounded-md border-2 border-[#8b5cf6] bg-[#8b5cf6]/10 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]"
                    style={{
                      top: selectedVisualOverlayRect.top,
                      left: selectedVisualOverlayRect.left,
                      width: selectedVisualOverlayRect.width,
                      height: selectedVisualOverlayRect.height,
                    }}
                  />
                  <div
                    className="absolute z-40 w-[320px] rounded-xl border border-[#8b5cf6]/45 bg-[#0d0a1a]/95 p-3 shadow-2xl backdrop-blur"
                    style={{
                      top: visualPopupTop,
                      left: visualPopupLeft,
                    }}
                  >
                    <p className="text-xs font-semibold text-[#d8b4fe]">✦ Edit this element</p>
                    <input
                      value={visualEditInstruction}
                      onChange={(event) => setVisualEditInstruction(event.target.value)}
                      placeholder="What would you like to change?"
                      className="mt-2 w-full rounded-lg border border-[#8b5cf6]/35 bg-[#120f21] px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#a78bfa]"
                    />
                    <button
                      onClick={() => void handleApplySelectedElementEdit()}
                      disabled={loading || isGeneratingLocked || !visualEditInstruction.trim()}
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-lg bg-[#8b5cf6] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}

              {showPreviewFrame && isVisualMode && pendingInlineEdits.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
                  <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-emerald-400/35 bg-[#10131d]/95 px-3 py-2 shadow-[0_8px_30px_rgba(16,185,129,0.22)] backdrop-blur">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-emerald-200">Unsaved changes</p>
                      <p className="text-[10px] text-emerald-300/90">
                        {pendingInlineEdits.length} Aenderung{pendingInlineEdits.length !== 1 ? 'en' : ''} in Preview
                      </p>
                    </div>
                    <button
                      onClick={handleDiscardPendingInlineEdits}
                      disabled={isApplyingVisualPatch}
                      className="rounded-lg border border-slate-500 bg-[#0f1118] px-2.5 py-1 text-[11px] font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => void handleApplyPendingInlineEdits()}
                      disabled={isApplyingVisualPatch}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isApplyingVisualPatch ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {showPreviewFrame && (
                <GenerationTimeline
                  open={timelineOpen}
                  steps={timelineSteps}
                  currentStepIndex={timelineCurrentStep}
                  startedAt={timelineStartedAt}
                  activeStepStartedAt={timelineActiveStepStartedAt}
                  running={timelineRunning}
                  onClose={handleTimelineClose}
                />
              )}

              {(showPreviewFrame || activeSurfaceMode === 'code') && (
                <div className={`h-8 shrink-0 border-t border-white/10 bg-black/20 px-4 flex items-center justify-between font-mono text-[10px] text-slate-500 ${(showPreviewFrame && previewMode === 'mobile') ? 'hidden' : ''}`}>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <span className={`material-icons-round text-[12px] ${hasFiles ? 'text-green-500' : 'text-slate-500'}`}>
                        {hasFiles ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {hasFiles ? 'Code Ready' : 'Standby'}
                    </span>
                    <span className="flex items-center gap-1">UTF-8</span>
                  </div>
                  <div>{hasFiles ? `Files: ${Object.keys(files).length}` : 'Ready'}</div>
                </div>
              )}
              </div>
              {showDatabaseSetupPanel && (
                <section className="w-full rounded-2xl border border-[#2b3242] bg-[#0f1522] shadow-xl">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2b3242] px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Database Setup</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Run this SQL in your Supabase project to set up the database
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleCopySupabaseSchema()}
                        className="inline-flex h-8 items-center rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-white/5"
                      >
                        {databaseSchemaCopied ? 'Copied' : 'Copy SQL'}
                      </button>
                      <a
                        href={supabaseSqlEditorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center rounded-lg bg-[#5e43dd] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#6a4af6]"
                      >
                        Run in Supabase
                      </a>
                    </div>
                  </div>
                  {generatedDatabaseTables.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                      {generatedDatabaseTables.map((table) => (
                        <span
                          key={table}
                          className="rounded-md border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-200"
                        >
                          {table}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="px-4 pb-4 pt-3">
                    <pre className="max-h-64 overflow-auto rounded-xl border border-slate-700 bg-[#0a0f1a] p-3 text-xs leading-5 text-slate-200">
                      <code>{generatedSupabaseSchema}</code>
                    </pre>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Decorative elements */}
          <div className="pointer-events-none absolute -right-56 -top-56 z-0 h-[520px] w-[520px] rounded-full bg-blue-500/15 blur-[140px]"></div>
          <div className="pointer-events-none absolute -bottom-40 -left-40 z-0 h-[340px] w-[340px] rounded-full bg-cyan-500/10 blur-[120px]"></div>
        </main >
      </div >
      {/* Enterprise Feature 5: Diff Preview */}
      {pendingPatch && (
        <PatchDiffPreview
          label={pendingPatch.label}
          changes={pendingPatch.changes}
          onConfirm={pendingPatch.onConfirm}
          onCancel={() => {
            pendingPatch.onCancel?.();
            setPendingPatch(null);
          }}
        />
      )}
      <SupabaseConnect
        open={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        projectId={currentProject?.id}
        projectName={currentProject?.name}
        connected={Boolean(supabaseStatus.live?.connected || supabaseStatus.test?.connected)}
        projectUrl={
          supabaseStatus.live?.projectUrl ||
          supabaseStatus.test?.projectUrl ||
          null
        }
        loading={supabaseStatusLoading}
        onConnect={connectSupabaseCredentials}
        onDisconnect={disconnectSupabaseConnection}
      />
      <GitHubSync
        open={showGitHubSyncModal}
        onClose={() => setShowGitHubSyncModal(false)}
        projectId={currentProject?.id}
        projectName={currentProject?.name}
        status={gitHubSyncStatus}
        loading={gitHubSyncLoading}
        onRefresh={() => loadGitHubSyncStatus(currentProject?.id)}
      />
      <TemplateGallery
        open={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onUseTemplate={handleUseTemplate}
        loading={loading || isGeneratingLocked || isAutoRepairing}
      />
      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        projectId={currentProject?.id}
        projectName={currentProject?.name}
        publication={publication}
        loading={publishLoading}
        submitting={publishSubmitting}
        onRefresh={() => void loadPublishStatus(currentProject?.id)}
        onPublish={publishProject}
        onDeployVercel={deployProjectToVercel}
        onUnpublish={unpublishProject}
      />
      {noCreditsModal.open && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 px-4">
          <div className="relative w-full max-w-xl rounded-2xl border border-white/15 bg-[#101622] p-6 shadow-2xl">
            <button
              onClick={closeNoCreditsModal}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close no credits modal"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-2xl font-semibold text-white">You&apos;ve used all your credits 🚀</h3>
            <p className="mt-2 text-sm text-slate-300">{getNoCreditsPlanMessage(noCreditsModal.plan)}</p>
            <p className="mt-4 rounded-lg border border-violet-400/35 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
              Your credits reset in: {noCreditsCountdown}
            </p>
            <button
              onClick={() => void handleNoCreditsUpgrade()}
              disabled={noCreditsUpgradeLoading}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#6a4af6] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#7758ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {noCreditsUpgradeLoading
                ? 'Upgrading...'
                : 'Upgrade to Pro — 100 credits/month — EUR 25/mo'}
            </button>
            {noCreditsModal.plan === 'free' && (
              <button
                onClick={closeNoCreditsModal}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
              >
                Wait for reset (free users only)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



