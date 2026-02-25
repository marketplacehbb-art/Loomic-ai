import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MonacoEditor } from '../components/MonacoEditor';
import { CodePreview } from '../components/CodePreview';
import { ThinkingProcess } from '../components/ThinkingProcess';
import {
  api,
  Project,
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
import SupabaseConnectModal from '../components/SupabaseConnectModal';
import { supabase } from '../lib/supabase';

import { useUsage } from '../contexts/UsageContext';

const LUCIDE_ALIAS_CANONICAL: Record<string, string> = {
  Cup: 'CupSoda',
  Trash: 'Trash2',
  Person: 'User',
  HelpCircle: 'Info',
  AlertCircle: 'CircleAlert',
};

const MODEL_OPTIONS: Array<{
  id: 'gemini' | 'deepseek' | 'openai';
  name: string;
  icon: string;
  tone: string;
}> = [
    { id: 'gemini', name: 'Gemini 2.0 Flash', icon: 'psychology', tone: 'text-blue-400' },
    { id: 'openai', name: 'ChatGPT 4o', icon: 'auto_awesome', tone: 'text-green-400' },
    { id: 'deepseek', name: 'DeepSeek Coder', icon: 'code', tone: 'text-violet-400' },
  ];

interface VisualEditAnchorPayload {
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
  sourceId?: string; // data-source-id from Vite plugin: "file:line:col"
  selected?: VisualEditAnchorPayload[];
  appendMode?: boolean;
  activeSelectionKey?: string;
  text?: string;
}

interface PendingInlineDraft {
  key: string;
  anchor: VisualEditAnchorPayload;
  text: string;
}

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
  const [pendingInlineEdits, setPendingInlineEdits] = useState<PendingInlineDraft[]>([]);
  const [visualSaveNotice, setVisualSaveNotice] = useState<string | null>(null);
  const [isApplyingVisualPatch, setIsApplyingVisualPatch] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [knowledgeFiles, setKnowledgeFiles] = useState<Array<{ name: string, content: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [workspaceMode, setWorkspaceMode] = useState<'chat' | 'visual'>('chat');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
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

  // Use History Hook for Files
  const {
    state: files,
    set: setFiles,
    reset: resetFiles
  } = useHistory<Record<string, string>>({});

  const [dependencies, setDependencies] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<'gemini' | 'deepseek' | 'openai'>('gemini');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [lastContextCount, setLastContextCount] = useState<number | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Project Dropdown State
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showModelSwitcher, setShowModelSwitcher] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<Record<SupabaseIntegrationEnvironment, SupabaseIntegrationEnvStatus>>(defaultSupabaseIntegrationStatus);
  const [supabaseStatusLoading, setSupabaseStatusLoading] = useState(false);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelSwitcherRef = useRef<HTMLDivElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const lastLocalProjectWriteAtRef = useRef(0);
  const lastAppliedFileMapRef = useRef('{}');
  const liveChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const liveClientIdRef = useRef<string>(`client-${Math.random().toString(36).slice(2, 10)}`);
  const [liveEnabled] = useState(true);
  const [, setLivePeerCount] = useState(1);

  const commitPreviewPath = useCallback((nextPath: string) => {
    const normalized = normalizePreviewPath(nextPath);
    setPreviewPath(normalized);
    setPreviewPathInput(normalized);
  }, []);

  const refreshPreview = useCallback(() => {
    setPreviewRefreshToken((value) => value + 1);
  }, []);

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
        setSupabaseStatus({
          test: response.status.test || defaultSupabaseIntegrationStatus.test,
          live: response.status.live || defaultSupabaseIntegrationStatus.live,
        });
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

  const startSupabaseConnect = useCallback(async (input: { environment: SupabaseIntegrationEnvironment; projectRef?: string }) => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }

    try {
      setError(null);
      const response = await api.createSupabaseConnectLink({
        projectId: currentProject.id,
        environment: input.environment,
        projectRef: input.projectRef,
      });

      if (!response.success || !response.authorizeUrl) {
        throw new Error(response.error || 'Supabase OAuth konnte nicht gestartet werden.');
      }

      window.location.href = response.authorizeUrl;
    } catch (connectError: any) {
      console.error('Failed to start Supabase OAuth:', connectError);
      setError(connectError?.message || 'Supabase OAuth konnte nicht gestartet werden.');
    }
  }, [currentProject?.id]);

  const disconnectSupabaseConnection = useCallback(async (environment: SupabaseIntegrationEnvironment) => {
    if (!currentProject?.id) {
      setError('Bitte zuerst ein Projekt laden oder erstellen.');
      return;
    }

    try {
      setError(null);
      const response = await api.disconnectSupabaseIntegration({
        projectId: currentProject.id,
        environment,
      });
      if (!response.success) {
        throw new Error(response.error || 'Supabase konnte nicht getrennt werden.');
      }

      await loadSupabaseIntegrationStatus(currentProject.id);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Supabase (${environment.toUpperCase()}) wurde getrennt.`,
        },
      ]);
    } catch (disconnectError: any) {
      console.error('Failed to disconnect Supabase:', disconnectError);
      setError(disconnectError?.message || 'Supabase konnte nicht getrennt werden.');
    }
  }, [currentProject?.id, loadSupabaseIntegrationStatus]);

  const normalizeAnchor = useCallback((anchor: VisualEditAnchorPayload): VisualEditAnchorPayload => ({
    nodeId: (anchor.nodeId || '').trim(),
    tagName: (anchor.tagName || '').trim(),
    className: (anchor.className || '').trim(),
    id: (anchor.id || '').trim(),
    innerText: (anchor.innerText || '').trim(),
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

  const clearVisualSelection = useCallback(() => {
    setSelectedEditAnchor(null);
    setSelectedEditAnchors([]);
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
      const nextDependencies = extractDependenciesFromFiles(nextFiles) || dependencies;
      const changedPaths = Array.from(new Set([...Object.keys(files), ...Object.keys(nextFiles)]))
        .filter((path) => files[path] !== nextFiles[path]);

      applyOperationEntry({
        files: nextFiles,
        dependencies: nextDependencies,
        message: 'Inline text updates applied.',
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
  }, [applyOperationEntry, currentProject?.id, dependencies, files, operationHistory, resolveAnchorProjectFile, selectorForAnchor]);

  const handleUndoOperation = useCallback(() => {
    const op = operationHistory.undo();
    if (!op) return;
    const beforeDependencies = op.beforeDependencies || extractDependenciesFromFiles(op.beforeFiles);
    applyOperationEntry({
      files: op.beforeFiles,
      dependencies: beforeDependencies,
      message: `Undo: ${op.label}`,
    });
  }, [applyOperationEntry, operationHistory]);

  const handleRedoOperation = useCallback(() => {
    const op = operationHistory.redo();
    if (!op) return;
    const afterDependencies = op.afterDependencies || extractDependenciesFromFiles(op.afterFiles);
    applyOperationEntry({
      files: op.afterFiles,
      dependencies: afterDependencies,
      message: `Redo: ${op.label}`,
    });
  }, [applyOperationEntry, operationHistory]);

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
          setDependencies(extractDependenciesFromFiles(sanitizedLoaded));
          try {
            lastAppliedFileMapRef.current = JSON.stringify(sanitizedLoaded);
          } catch {
            lastAppliedFileMapRef.current = '{}';
          }
        }
      } catch (e) {
        console.log('Project code is not JSON file map');
      }

      // Load Chat History
      try {
        const history = await api.getMessages(id);
        if (history && history.length > 0) {
          setMessages(history.map(m => ({
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
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
    }
  }, [resetFiles]);

  // Load project if ID is present
  useEffect(() => {
    const projectId = searchParams.get('project_id');
    if (projectId && user) {
      loadProject(projectId);
    }
  }, [searchParams, user, loadProject]);

  useEffect(() => {
    void loadSupabaseIntegrationStatus(currentProject?.id);
  }, [currentProject?.id, loadSupabaseIntegrationStatus]);

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
      }
    } else {
      setError(oauthMessage || 'Supabase OAuth fehlgeschlagen.');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('supabase_oauth');
    nextParams.delete('supabase_env');
    nextParams.delete('supabase_message');
    setSearchParams(nextParams);
  }, [loadSupabaseIntegrationStatus, searchParams, setSearchParams]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (modelSwitcherRef.current && !modelSwitcherRef.current.contains(event.target as Node)) {
        setShowModelSwitcher(false);
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
      const nextDependencies = incoming.dependencies || extractDependenciesFromFiles(sanitized);

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
        const payload = (event.data.payload || {}) as VisualEditAnchorPayload;
        const selected = Array.isArray(payload.selected) && payload.selected.length > 0
          ? payload.selected.map(normalizeAnchor)
          : [normalizeAnchor(payload)];
        const primary = selected[0] || normalizeAnchor(payload);
        const tagName = (primary.tagName || '').trim();
        const className = (primary.className || '').trim();
        const innerText = (primary.innerText || '').trim();
        const selector = (primary.selector || '').trim();
        const routePath = (primary.routePath || '').trim();
        const sectionId = (primary.sectionId || '').trim();
        const nodeId = (primary.nodeId || '').trim();
        const sourceId = (primary.sourceId || '').trim();
        setSelectedEditAnchor(primary);
        setSelectedEditAnchors(selected);
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
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [commitPreviewPath, isReliableVisualAnchor, normalizeAnchor, selectorForAnchor, workspaceMode]);

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
      iframe.contentWindow.postMessage({ type: 'SET_AUTO_INLINE_EDIT', payload: autoInlineEdit }, '*');
    }
  }, [autoInlineEdit, previewRefreshToken, files]);

  // Clear image when switching away from Gemini
  useEffect(() => {
    if (provider !== 'gemini') {
      setAttachedImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [provider]);

  useEffect(() => {
    if (workspaceMode === 'visual') {
      setView('preview');
      setIsInspectMode(true);
      return;
    }
    setIsInspectMode(false);
    setPendingInlineEdits([]);
    setVisualSaveNotice(null);
  }, [workspaceMode]);

  useEffect(() => {
    if (!visualSaveNotice) return;
    const timer = window.setTimeout(() => setVisualSaveNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [visualSaveNotice]);


  const handleToggleProjects = async () => {
    const newState = !showProjectDropdown;
    setShowProjectDropdown(newState);
    if (newState) {
      try {
        const { data: projects } = await api.getProjects(1, 100);
        setProjectList(projects);
      } catch (error) {
        console.error('Failed to load projects list', error);
      }
    }
  };

  // Image Upload Handlers
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size too large. Please upload an image smaller than 5MB.');
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
        alert(`File ${file.name} is too large (max 1MB).`);
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
        if (!loading && promptInput.trim()) {
          handleGenerate();
        }
      }
      // Ctrl+S or Cmd+S: Save (if project exists)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Save logic could be added here if needed
      }
      // Ctrl/Cmd+Z: Operation undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z: redo
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
  }, [loading, promptInput, showProjectDropdown, showModelSwitcher, isInspectMode, handleUndoOperation, handleRedoOperation, selectedEditAnchors.length, clearVisualSelection]);

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

      const nextDependencies = extractDependenciesFromFiles(nextFiles) || dependencies;
      const beforeFiles = { ...files };
      const beforeDependencies = { ...dependencies };
      applyOperationEntry({
        files: nextFiles,
        dependencies: nextDependencies,
        message: 'Visual patch wurde angewendet.',
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
    selectedEditAnchor?.selector,
    applyOperationEntry,
  ]);

  const handleGenerate = async () => {
    if (!promptInput.trim() || loading) return; // Guard against race conditions
    const accessToken = session?.access_token || null;
    if (!accessToken) {
      setError('Session abgelaufen. Bitte erneut einloggen.');
      return;
    }
    if (workspaceMode === 'visual') {
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

    const userMessage = promptInput;
    const strictVisualAnchors = selectedEditAnchors.filter(isReliableVisualAnchor);
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
    const requestPrompt = `${userMessage}${visualSelectionPromptAddon}`;
    const keepSelectionAfterRun = workspaceMode === 'visual';
    const autoGenerationMode: 'new' | 'edit' = currentProject?.id ? 'edit' : 'new';
    const hasEditableFiles = files && Object.keys(files).length > 0;
    const useEditContext = autoGenerationMode === 'edit' && hasEditableFiles;
    const generationProjectId = autoGenerationMode === 'edit' ? currentProject?.id : undefined;
    const supabaseGenerateContext = buildSupabaseGenerateContext(supabaseStatus);
    const backendIntentDetected = detectBackendIntent(requestPrompt);

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

    // 1. Optimistic Update
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setPromptInput('');
    setLoading(true);
    setError(null);
    setIsRateLimited(false);
    if (workspaceMode === 'visual') {
      setPendingPatch(null);
      setLastVisualDiagnostics(null);
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider,
          generationMode: autoGenerationMode,
          prompt: requestPrompt,
          validate: true,
          bundle: true,
          files: useEditContext ? files : undefined,
          editAnchor: useEditContext
            ? (isReliableVisualAnchor(selectedEditAnchor || {}) ? selectedEditAnchor : strictVisualAnchors[0])
            : undefined,

          image: attachedImage, // Send image if present
          knowledgeBase: knowledgeFiles.length > 0 ? knowledgeFiles.map(f => ({ path: f.name, content: f.content })) : undefined,
          userId: user?.id, // Pass User ID for logging
          projectId: generationProjectId, // Pass Project ID for persistence only in edit mode
          featureFlags: { enterprise: defaultEnterpriseFlags },
          integrations: {
            supabase: supabaseGenerateContext,
          },
        }),
      });

      const text = await response.text();
      const data = parseJsonPayload(text, `Generate-Response (${response.status})`);

      // Update Rate Limit Info
      if (data.rateLimit) {
        updateRateLimit(data.rateLimit);
      }

      if (!response.ok || !data.success) {
        // Special Handling for Rate Limits (Gemini 429) & Quotas
        if (response.status === 429 || (data.code && (
          data.code === 'RATE_LIMIT_EXCEEDED' ||
          data.code === 'DAILY_REQUEST_LIMIT_EXCEEDED' ||
          data.code === 'DAILY_TOKEN_LIMIT_EXCEEDED'
        ))) {
          setIsRateLimited(true);

          if (data.code === 'DAILY_REQUEST_LIMIT_EXCEEDED') {
            setError(`Daily Request Limit Reached (${data.limit} requests/day). Upgrade plan for more.`);
          } else if (data.code === 'DAILY_TOKEN_LIMIT_EXCEEDED') {
            setError(`Daily Token Limit Reached. Please try again tomorrow or upgrade.`);
          } else if (typeof data.error === 'string' && data.error.includes('Generation rate limit exceeded')) {
            setError('Server-Limit erreicht (max. 10 Generierungen pro Minute). Warte kurz und versuche es erneut.');
          } else if (typeof data.error === 'string' && data.error.includes('OpenRouter API error: 429')) {
            setError('Gemini/OpenRouter Rate Limit erreicht. Bitte kurz warten oder Modell wechseln.');
          } else if (typeof data.error === 'string' && data.error.includes('OpenAI API error: 429')) {
            setError('OpenAI Rate Limit erreicht. Bitte kurz warten oder Modell wechseln.');
          } else if (provider === 'gemini') {
            setError("Gemini is currently overloaded (Free Tier Limit Reached).");
          } else {
            setError(`${provider === 'openai' ? 'OpenAI' : provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} Rate Limit Reached. Please switch models.`);
          }
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
        return;
      }

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

      const applyChanges = () => {
        const beforeFiles = { ...files };
        const beforeDependencies = { ...dependencies };
        const nextDependencies = data.dependencies || extractDependenciesFromFiles(filesObj) || {};
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
      setError(errorMessage);
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
    } finally {
      setLoading(false);
      setAttachedImage(null); // Clear image after generation
      if (!keepSelectionAfterRun) {
        clearVisualSelection();
      }
    }
  };

  const contextFileCount = Object.keys(files || {}).filter((path) => path.startsWith('src/')).length;
  const isEditMode = Boolean(currentProject?.id);
  const sidebarContextCount = lastContextCount ?? contextFileCount;
  const sidebarTitle = isEditMode ? (currentProject?.name || 'Current Project') : 'AI Architect';
  const sidebarModeLabel = workspaceMode === 'visual'
    ? 'VISUAL EDIT MODE'
    : (isEditMode ? 'EDIT MODE' : 'NEW PROJECT');
  const isVisualMode = workspaceMode === 'visual';
  const supabaseConnectedCount = Number(Boolean(supabaseStatus.test?.connected)) + Number(Boolean(supabaseStatus.live?.connected));
  const supabaseConnectionLabel =
    supabaseConnectedCount === 2
      ? 'Supabase: Test + Live'
      : supabaseConnectedCount === 1
        ? (supabaseStatus.live?.connected ? 'Supabase: Live' : 'Supabase: Test')
        : 'Supabase: Disconnected';
  const reliableVisualSelectionCount = selectedEditAnchors.filter(isReliableVisualAnchor).length;
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

  return (
    <div className="font-display bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 h-screen overflow-hidden flex transition-colors duration-300">
      <style>{`
        .glass-effect {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
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
        <aside className="w-96 h-full flex flex-col border-r border-slate-800 bg-[#0b0c10] text-slate-100 z-20 shrink-0 flex-1 max-w-sm transition-colors duration-300">
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
                      disabled={!operationHistory.canUndo}
                      className="rounded-lg border border-slate-600 bg-[#0f1118] px-2.5 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Undo
                    </button>
                    <button
                      onClick={handleRedoOperation}
                      disabled={!operationHistory.canRedo}
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
                <div className="rounded-2xl border border-slate-700 bg-[#171922] p-6 shadow-sm">
                  <p className="text-[15px] leading-relaxed text-slate-300">Describe your first change to get started.</p>
                </div>
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
                        if (!loading && promptInput.trim()) {
                          handleGenerate();
                        }
                      }
                    }}
                    rows={2}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={loading || reliableVisualSelectionCount === 0 || pendingInlineEdits.length > 0}
                    className={`absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 ${(loading || reliableVisualSelectionCount === 0 || pendingInlineEdits.length > 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  <span className="material-icons-round text-sm">close</span>
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
              <div className="flex items-end gap-3">
              <button
                onClick={() => knowledgeInputRef.current?.click()}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                title="Add context"
              >
                <span className="material-icons-round text-[28px]">add_circle</span>
              </button>
              <div className="relative flex-1 rounded-xl border border-slate-700 bg-[#171922] focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/25 transition-all">
                <textarea
                  className="w-full resize-none border-none bg-transparent p-3 pr-12 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="Describe your changes..."
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!loading && promptInput.trim()) {
                        handleGenerate();
                      }
                    }
                  }}
                  rows={1}
                />
                {provider === 'gemini' && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || !!attachedImage}
                    className={`absolute bottom-2.5 right-10 text-slate-500 transition-colors hover:text-primary ${loading || attachedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Attach screenshot"
                  >
                    <span className="material-icons-round text-[18px]">attach_file</span>
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className={`absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Send"
                >
                  <span className="material-icons-round text-[20px]">arrow_upward</span>
                </button>
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

            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-[10px] text-slate-600">
                {isVisualMode ? 'Visual mode active' : 'Press Enter to send'}
              </p>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-slate-500">
                  {isVisualMode ? `${reliableVisualSelectionCount}/${selectedEditAnchors.length} valid selected` : 'Model ready'}
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                <div className="flex items-start gap-2">
                  <span className="material-icons-round text-sm mt-0.5">error_outline</span>
                  <span className="whitespace-pre-wrap">{typeof error === 'string' ? error : JSON.stringify(error)}</span>
                </div>
                {isRateLimited && (
                  <button
                    onClick={() => setProvider('openai')}
                    className="mt-2 ml-6 inline-flex items-center gap-1 rounded-lg bg-red-900/30 px-3 py-1.5 text-red-200 transition-colors hover:bg-red-900/50"
                  >
                    <span className="material-icons-round text-xs">sync_alt</span>
                    Try with OpenAI
                  </button>
                )}
              </div>
            )}
          </footer>
        </aside>

        {/* Main Content (Preview/Code) */}
        <main className="flex-1 flex flex-col relative bg-slate-50 dark:bg-background-dark overflow-hidden min-w-0 transition-colors duration-300">
          <header className="h-[68px] flex items-center justify-between px-4 z-20 shrink-0 border-b border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-[#0a0a0f]/70 backdrop-blur-xl sticky top-0 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2.5">
              {/* View Controls Group */}
              <div className="flex bg-slate-100/80 dark:bg-white/[0.04] p-1 rounded-xl border border-slate-200/60 dark:border-white/10">
                <button
                  onClick={() => setView('preview')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'preview'
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10'
                    }`}
                >
                  <span className="material-icons-round text-sm">visibility</span>
                  Preview
                </button>
                <button
                  onClick={() => setView('code')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'code'
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10'
                    }`}
                >
                  <span className="material-icons-round text-sm">code</span>
                  Code
                </button>
              </div>

              <button
                onClick={() => setWorkspaceMode((prev) => (prev === 'visual' ? 'chat' : 'visual'))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  isVisualMode
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-slate-100/80 dark:bg-white/[0.04] border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-icons-round text-sm">gesture</span>
                {isVisualMode ? 'Design' : 'Visual edits'}
              </button>

              {isVisualMode && visualStatus && (
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${visualStatus.tone}`}>
                  <span className="material-icons-round text-sm">tune</span>
                  {visualStatus.label}
                  <span className="text-[10px] opacity-80">
                    {reliableVisualSelectionCount} valid
                  </span>
                </div>
              )}

              {view === 'preview' && (
                <>
                  <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>
                  <div className="flex items-center gap-2 h-10 px-2.5 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center bg-slate-100/90 dark:bg-black/30 p-1 rounded-xl border border-slate-200/70 dark:border-white/10">
                      <button
                        onClick={() => setPreviewMode('desktop')}
                        title="Desktop"
                        className={`p-1.5 rounded-lg transition-all ${previewMode === 'desktop' ? 'bg-white dark:bg-white/15 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10'}`}
                      >
                        <span className="material-icons-round text-[15px]">desktop_windows</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode('tablet')}
                        title="Tablet"
                        className={`p-1.5 rounded-lg transition-all ${previewMode === 'tablet' ? 'bg-white dark:bg-white/15 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10'}`}
                      >
                        <span className="material-icons-round text-[15px]">tablet_mac</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode('mobile')}
                        title="Mobile"
                        className={`p-1.5 rounded-lg transition-all ${previewMode === 'mobile' ? 'bg-white dark:bg-white/15 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10'}`}
                      >
                        <span className="material-icons-round text-[15px]">smartphone</span>
                      </button>
                    </div>

                    <div className="flex items-center h-8 min-w-[220px] w-[260px] px-2.5 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/90 dark:bg-black/30">
                      <span className="material-icons-round text-[15px] text-slate-500 dark:text-slate-400 mr-1.5">language</span>
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
                        className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
                      />
                    </div>

                    <div className="flex items-center bg-slate-100/90 dark:bg-black/30 p-1 rounded-xl border border-slate-200/70 dark:border-white/10">
                      <button
                        onClick={openPreviewInNewTab}
                        disabled={!latestPreviewHtml}
                        title="Open in new tab"
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-[15px]">open_in_new</span>
                      </button>
                      <button
                        onClick={refreshPreview}
                        title="Refresh preview"
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
                      >
                        <span className="material-icons-round text-[15px]">refresh</span>
                      </button>
                    </div>

                    {isVisualMode && (
                      <button
                        onClick={() => setIsInspectMode((prev) => !prev)}
                        title={isInspectMode ? 'Disable visual inspect' : 'Enable visual inspect'}
                        className={`h-8 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
                          isInspectMode
                            ? 'bg-primary/20 text-primary border border-primary/35'
                            : 'border border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                        }`}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowSupabaseModal(true)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                  supabaseConnectedCount > 0
                    ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                    : 'border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-white/8'
                }`}
                title="Connect Supabase"
              >
                <span className="material-icons-round text-sm">database</span>
                {supabaseConnectionLabel}
              </button>

              {/* Navigation Links */}
              <div className="flex items-center pr-3 border-r border-slate-200/70 dark:border-white/10 mr-1 gap-1.5">
                <Link
                  to="/dashboard"
                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded-xl hover:bg-slate-100/80 dark:hover:bg-white/8"
                  title="Go to Dashboard"
                >
                  <span className="material-icons-round text-xl">dashboard</span>
                </Link>

                {/* Model Selector removed from here */}


                {/* Project Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={handleToggleProjects}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${showProjectDropdown
                      ? 'bg-primary/12 text-primary border border-primary/20'
                      : 'text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-200/70 dark:hover:border-white/10 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/8'}`}
                  >
                    <span className="material-icons-round text-base">folder</span>
                    Projects
                    <span className={`material-icons-round text-sm transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`}>expand_more</span>
                  </button>

                  {/* Dropdown Content */}
                  {showProjectDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1e1e2e] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50 flex flex-col max-h-[400px] animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-3 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your Projects</h3>
                        <Link to="/dashboard" className="text-[10px] text-primary hover:underline">View All</Link>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {projectList.length === 0 ? (
                          <p className="text-center text-slate-500 py-6 text-sm">No recent projects.</p>
                        ) : (
                          projectList.map(p => (
                            <button
                              key={p.id}
                              onClick={() => loadProject(p.id)}
                              className={`w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group flex items-start gap-3 ${currentProject?.id === p.id ? 'bg-primary/5 dark:bg-primary/20' : ''}`}
                            >
                              <div className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${currentProject?.id === p.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                <span className="material-icons-round text-sm">terminal</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className={`text-xs font-medium truncate ${currentProject?.id === p.id ? 'text-primary' : 'text-slate-900 dark:text-white group-hover:text-primary'} transition-colors`}>
                                  {p.name || 'Untitled'}
                                </h4>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {new Date(p.updated_at).toLocaleDateString()}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="p-2 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                        <button
                          onClick={() => {
                            setCurrentProject(null);
                            resetFiles({});
                            setDependencies({});
                            setSelectedEditAnchor(null);
                            setSelectedEditAnchors([]);
                            setPromptInput('');
                            setMessages([]);
                            setPreviewPath('/');
                            setPreviewPathInput('/');
                            setSearchParams({});
                            setShowProjectDropdown(false);
                          }}
                          className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                        >
                          <span className="material-icons-round text-sm">add</span>
                          New Project
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </header>


          <div className="flex-1 p-8 pt-0 overflow-hidden flex flex-col items-center">
            <div className={`w-full h-full glass-effect rounded-2xl shadow-2xl relative overflow-hidden flex flex-col bg-white dark:bg-editor-bg border border-slate-200 dark:border-white/10 transition-all duration-300 ${previewMode === 'mobile'
              ? 'max-w-[390px] max-h-[844px] my-auto !h-auto aspect-[390/844] border-8 border-slate-800 rounded-[3rem] shadow-xl'
              : previewMode === 'tablet'
                ? 'max-w-[834px] max-h-[1112px] my-auto !h-auto aspect-[834/1112] border-[10px] border-slate-800 rounded-[2.2rem] shadow-xl'
                : ''
              }`}>
              {Object.keys(files).length > 0 ? (
                view === 'code' ? (
                  <MonacoEditor files={files} />
                ) : (
                  <CodePreview
                    files={files}
                    dependencies={dependencies}
                    previewPath={previewPath}
                    refreshToken={previewRefreshToken}
                    onPreviewDocument={setLatestPreviewHtml}
                  />
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <span className="material-icons-round text-6xl opacity-20 animate-pulse">
                    {view === 'code' ? 'code_off' : 'browser_updated'}
                  </span>
                  <p className="text-xl font-medium text-slate-600 dark:text-slate-400">{view === 'code' ? 'Kein Code vorhanden' : 'Preview Mode'}</p>
                  <p className="text-sm max-w-md text-center text-slate-500 dark:text-slate-500">Beschreibe links eine Idee, um den leistungsstarken Builder zu starten.</p>
                </div>
              )}

              {view === 'preview' && isVisualMode && pendingInlineEdits.length > 0 && (
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

              {/* Status Bar - Hide in mobile mode or clean up */}
              <div className={`h-8 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0 ${previewMode === 'mobile' ? 'hidden' : ''}`}>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className={`material-icons-round text-[12px] ${Object.keys(files).length > 0 ? 'text-green-500' : 'text-slate-500'}`}>
                      {Object.keys(files).length > 0 ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    {Object.keys(files).length > 0 ? 'Code Ready' : 'Standby'}
                  </span>
                  <span className="flex items-center gap-1">UTF-8</span>
                </div>
                <div>{Object.keys(files).length > 0 ? `Files: ${Object.keys(files).length}` : 'Ready'}</div>
              </div>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none opacity-40 dark:opacity-20 z-0"></div>
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/20 blur-[100px] rounded-full -ml-32 -mb-32 pointer-events-none opacity-30 dark:opacity-10 z-0"></div>
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
      <SupabaseConnectModal
        open={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        projectId={currentProject?.id}
        projectName={currentProject?.name}
        status={supabaseStatus}
        loading={supabaseStatusLoading}
        onRefresh={() => void loadSupabaseIntegrationStatus(currentProject?.id)}
        onConnect={startSupabaseConnect}
        onDisconnect={disconnectSupabaseConnection}
      />
    </div>
  );
}



