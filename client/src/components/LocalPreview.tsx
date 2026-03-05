import React, { useEffect, useRef, useState } from 'react';
import { bundleCode } from '../lib/bundler';
import { getDefaultImportMap, getEsmUrlForDependency } from '../config/dependencies';

interface LocalPreviewProps {
  code: string;
  files?: Record<string, string>;
  entryPath?: string;
  dependencies?: Record<string, string>;
  previewPath?: string;
  refreshToken?: number;
  previewMode?: 'desktop' | 'tablet' | 'mobile';
  onPreviewDocument?: (html: string) => void;
  onPreviewIssue?: (issue: {
    type: 'bundler' | 'runtime';
    message: string;
    stack?: string;
    source?: string;
    category?: string;
    fingerprint?: string;
    routePath?: string;
    timestamp: number;
  }) => void;
}

const isBareSpecifier = (specifier: string): boolean => {
  const value = String(specifier || '').trim();
  if (!value) return false;
  if (value.startsWith('.') || value.startsWith('/')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('node:')) return false;
  return true;
};

const collectBareImportSpecifiers = (code: string): string[] => {
  const results = new Set<string>();
  if (!code || typeof code !== 'string') return [];

  const staticImportRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of code.matchAll(staticImportRegex)) {
    const spec = match[1];
    if (isBareSpecifier(spec)) results.add(spec);
  }
  for (const match of code.matchAll(dynamicImportRegex)) {
    const spec = match[1];
    if (isBareSpecifier(spec)) results.add(spec);
  }

  return Array.from(results);
};

function detectRouterRequirements(code: string, files: Record<string, string>): {
  needsRouterContext: boolean;
  hasRouterProvider: boolean;
} {
  const corpus = [code, ...Object.values(files || {})]
    .filter((entry): entry is string => typeof entry === 'string')
    .join('\n');

  const hasRouterImport = /from\s+['"]react-router-dom['"]/.test(corpus);
  const hasRouterConsumers =
    /\b(Link|NavLink|useNavigate|useLocation|useParams|useHref|useResolvedPath)\b/.test(corpus) ||
    /<\s*(Routes|Route)\b/.test(corpus);

  // Important: preview renders only the entry component (`code`), not app bootstrap files like main.tsx.
  // So provider detection must be entry-focused to avoid false positives from unrelated files.
  // The generated entry may be either TSX/JSX (<HashRouter>) or factory output (jsx/jsxs/createElement).
  const hasJsxRouterProvider =
    /<\s*(HashRouter|BrowserRouter|MemoryRouter|RouterProvider)\b/.test(code) ||
    /\buseRoutes\s*\(/.test(code);

  const hasFactoryRouterProvider =
    /\b(?:jsx|jsxs|React\.createElement)\s*\(\s*(?:HashRouter|BrowserRouter|MemoryRouter|RouterProvider)\b/.test(code);

  const escapedAlias = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const routerAliasNames = new Set<string>();
  const aliasImportRegex = /import\s*{([^}]*)}\s*from\s*['"]react-router-dom['"]/g;
  let aliasMatch: RegExpExecArray | null;
  while ((aliasMatch = aliasImportRegex.exec(code)) !== null) {
    const specifiers = aliasMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const specifier of specifiers) {
      const alias = specifier.match(/^(HashRouter|BrowserRouter|MemoryRouter|RouterProvider)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (alias?.[2]) {
        routerAliasNames.add(alias[2]);
      }
    }
  }

  const hasAliasedFactoryRouterProvider = Array.from(routerAliasNames).some((aliasName) => {
    const token = escapedAlias(aliasName);
    const usagePattern = new RegExp(`\\b(?:jsx|jsxs|React\\.createElement)\\s*\\(\\s*${token}\\b`);
    return usagePattern.test(code);
  });

  const hasRouterProvider =
    hasJsxRouterProvider ||
    hasFactoryRouterProvider ||
    hasAliasedFactoryRouterProvider;

  return {
    needsRouterContext: hasRouterImport && hasRouterConsumers,
    hasRouterProvider,
  };
}

const LocalPreview: React.FC<LocalPreviewProps> = ({
  code,
  files = {},
  entryPath = 'src/App.tsx',
  dependencies = {},
  previewPath = '/',
  refreshToken = 0,
  previewMode = 'desktop',
  onPreviewDocument,
  onPreviewIssue
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onPreviewDocumentRef = useRef(onPreviewDocument);
  const onPreviewIssueRef = useRef(onPreviewIssue);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    onPreviewDocumentRef.current = onPreviewDocument;
  }, [onPreviewDocument]);

  useEffect(() => {
    onPreviewIssueRef.current = onPreviewIssue;
  }, [onPreviewIssue]);

  useEffect(() => {
    const updatePreview = async () => {
      try {
        setIsUpdating(true);
        setError(null);
        const compiled = await bundleCode(code, { files, entryPath });
        const routerSignals = detectRouterRequirements(code, files);

        const defaultImports = getDefaultImportMap();

        // Process dependencies to ensure they are valid URLs for the import map
        const processedDependencies: Record<string, string> = {};

        Object.entries(dependencies).forEach(([pkg, version]) => {
          // Skip if it's already in defaultImports (to preserve carefully crafted URLs with ?external=react)
          if (defaultImports.hasOwnProperty(pkg)) return;

          const versionValue = typeof version === 'string' ? version.trim() : '';

          // If it looks like a URL, use it as is
          if (versionValue.startsWith('http') || versionValue.startsWith('/')) {
            processedDependencies[pkg] = version;
          } else {
            processedDependencies[pkg] = getEsmUrlForDependency(pkg, versionValue);
          }
        });

        // Safety net: auto-map bare imports that appear in the compiled bundle
        // but were not present in the dependency payload (common with multi-file edits).
        for (const specifier of collectBareImportSpecifiers(compiled)) {
          if (defaultImports.hasOwnProperty(specifier)) continue;
          if (processedDependencies.hasOwnProperty(specifier)) continue;
          processedDependencies[specifier] = getEsmUrlForDependency(specifier);
        }

        const finalImports = { ...defaultImports, ...processedDependencies };

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
              <script src="https://cdn.tailwindcss.com"></script>
              <script type="importmap">
                {
                  "imports": ${JSON.stringify(finalImports, null, 2)}
                }
              </script>
              <style>
                html, body { margin: 0; width: 100%; min-height: 100%; overscroll-behavior: contain; }
                body { background: white; font-family: sans-serif; height: 100vh; width: 100vw; overflow-x: hidden; touch-action: pan-x pan-y; }
                #root { width: 100%; min-height: 100%; display: flex; flex-direction: column; }
                #bundle-error-overlay {
                  position: fixed;
                  left: 12px;
                  right: 12px;
                  top: 12px;
                  z-index: 99999;
                  display: none;
                  max-height: 40vh;
                  overflow: auto;
                  border: 1px solid rgba(220, 38, 38, 0.45);
                  border-radius: 10px;
                  background: rgba(127, 29, 29, 0.95);
                  color: #fecaca;
                  padding: 10px 12px;
                  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                  white-space: pre-wrap;
                }
                
                /* Inspector Styles */
                .ai-builder-inspect-active * {
                  cursor: crosshair !important;
                }
                .ai-builder-highlight {
                  outline: 2px solid #3b82f6 !important;
                  outline-offset: -2px;
                  background-color: rgba(59, 130, 246, 0.1) !important;
                  transition: all 0.1s;
                }
                .ai-builder-selected {
                  outline: 2px solid #10b981 !important;
                  outline-offset: -2px;
                  background-color: rgba(16, 185, 129, 0.14) !important;
                }
              </style>
            </head>
            <body>
              <div id="bundle-error-overlay"></div>
              <div id="root"></div>
              <script type="module">
                import React from 'react';
                import { createRoot } from 'react-dom/client';
                import { HashRouter } from 'react-router-dom';

                // React Router (Browser/Hash history) may call new URL(href, window.location.href).
                // In srcdoc sandbox this base is often about:srcdoc, which is not hierarchical.
                // Provide a safe fallback base only for that case.
                (() => {
                  const NativeURL = URL;
                  const SAFE_PREVIEW_BASE = 'http://preview.local/';
                  class PreviewSafeURL extends NativeURL {
                    constructor(url, base) {
                      if (typeof base === 'string' && base.startsWith('about:')) {
                        super(url, SAFE_PREVIEW_BASE);
                        return;
                      }
                      super(url, base);
                    }
                  }
                  try {
                    window.URL = PreviewSafeURL;
                    globalThis.URL = PreviewSafeURL;
                  } catch (e) {
                    // Ignore if environment prevents overriding URL.
                  }
                })();

                // In sandboxed srcdoc environments localStorage may throw SecurityError.
                // Provide a deterministic in-memory fallback to keep stateful demos working.
                (() => {
                  const makeStorage = () => {
                    const store = new Map();
                    return {
                      getItem(key) {
                        const value = store.get(String(key));
                        return value === undefined ? null : value;
                      },
                      setItem(key, value) {
                        store.set(String(key), String(value));
                      },
                      removeItem(key) {
                        store.delete(String(key));
                      },
                      clear() {
                        store.clear();
                      },
                      key(index) {
                        const keys = Array.from(store.keys());
                        return typeof index === 'number' && index >= 0 && index < keys.length ? keys[index] : null;
                      },
                      get length() {
                        return store.size;
                      }
                    };
                  };

                  const ensureSafeStorage = (storageName) => {
                    try {
                      const probe = '__ai_builder_probe__';
                      window[storageName].setItem(probe, '1');
                      window[storageName].removeItem(probe);
                    } catch (_error) {
                      try {
                        Object.defineProperty(window, storageName, {
                          configurable: true,
                          enumerable: false,
                          writable: false,
                          value: makeStorage(),
                        });
                      } catch {
                        // Ignore when host disallows descriptor overrides.
                      }
                    }
                  };

                  ensureSafeStorage('localStorage');
                  ensureSafeStorage('sessionStorage');
                })();

                // --- Inspector Logic ---
                let isInspectMode = false;
                let currentHighlight = null;
                const selectedNodes = new Map();
                let activeSelectionKey = '';
                let inlineEditState = null;
                let autoInlineTextEdit = true;
                const INITIAL_PREVIEW_PATH = ${JSON.stringify(previewPath)};
                let lastInternalPreviewPath = null;
                const PARENT_ORIGIN = ${JSON.stringify(window.location.origin)};
                const MAX_RUNTIME_ERROR_REPORTS = 8;
                let runtimeErrorReportCount = 0;
                const reportedRuntimeFingerprints = new Set();
                const errorOverlayElement = document.getElementById('bundle-error-overlay');
                const SHOULD_WRAP_IN_HASH_ROUTER = ${JSON.stringify(
          routerSignals.needsRouterContext && !routerSignals.hasRouterProvider
        )};

                function renderBundleErrorOverlay(message) {
                  const normalized = typeof message === 'string' ? message.trim() : '';
                  window.__BUNDLE_ERROR__ = normalized;
                  if (!errorOverlayElement) return;
                  if (!normalized) {
                    errorOverlayElement.style.display = 'none';
                    errorOverlayElement.textContent = '';
                    return;
                  }
                  errorOverlayElement.style.display = 'block';
                  errorOverlayElement.textContent = normalized;
                }

                if (typeof window.__BUNDLE_ERROR__ === 'string' && window.__BUNDLE_ERROR__) {
                  renderBundleErrorOverlay(window.__BUNDLE_ERROR__);
                }

                function normalizePreviewPathInput(value) {
                  if (!value) return '/';
                  const trimmed = String(value).trim();
                  if (!trimmed) return '/';
                  if (trimmed.startsWith('#')) return trimmed;
                  if (/^https?:\\/\\//i.test(trimmed)) {
                    try {
                      const parsed = new URL(trimmed);
                      return \`\${parsed.pathname || '/'}\${parsed.search || ''}\${parsed.hash || ''}\`;
                    } catch {
                      return '/';
                    }
                  }
                  if (trimmed.startsWith('/')) return trimmed;
                  if (trimmed.startsWith('./')) return \`/\${trimmed.slice(2)}\`;
                  return \`/\${trimmed.replace(/^\\/+/, '')}\`;
                }

                function toParentPreviewPath(path) {
                  const normalizedPath = normalizePreviewPathInput(path);
                  if (normalizedPath.startsWith('#/')) {
                    return normalizedPath.slice(1);
                  }
                  return normalizedPath;
                }

                function postPreviewPath(path) {
                  const normalizedPath = toParentPreviewPath(path);
                  lastInternalPreviewPath = normalizedPath;
                  window.parent.postMessage({
                    type: 'PREVIEW_PATH_CHANGED',
                    payload: { path: normalizedPath }
                  }, PARENT_ORIGIN);
                }

                function normalizeIssueMessage(value) {
                  if (!value) return 'Unknown runtime error';
                  if (typeof value === 'string') return value;
                  if (value && typeof value.message === 'string') return value.message;
                  try {
                    return String(value);
                  } catch {
                    return 'Unknown runtime error';
                  }
                }

                function deriveIssueCategory(message) {
                  const lower = String(message || '').toLowerCase();
                  if (/failed to resolve module specifier|cannot find module|module not found/.test(lower)) return 'missing-module';
                  if (/does not provide an export named/.test(lower)) return 'invalid-export';
                  if (/cannot destructure property 'basename'|cannot read properties of null \\(reading 'usecontext'\\)/.test(lower)) return 'router-context';
                  if (/is not defined/.test(lower)) return 'undefined-symbol';
                  if (/cannot read properties of null|cannot read properties of undefined/.test(lower)) return 'null-access';
                  return 'runtime';
                }

                function reportRuntimeIssue(rawIssue) {
                  const message = normalizeIssueMessage(rawIssue?.message || rawIssue);
                  renderBundleErrorOverlay(message);
                  const stack = typeof rawIssue?.stack === 'string' ? rawIssue.stack : '';
                  const source = typeof rawIssue?.source === 'string' ? rawIssue.source : 'runtime';
                  const routePath = getCurrentPreviewRoutePath();
                  const fingerprint = [message, stack.split('\\n')[0] || '', source, routePath].join(' | ').slice(0, 600);

                  if (reportedRuntimeFingerprints.has(fingerprint)) return;
                  if (runtimeErrorReportCount >= MAX_RUNTIME_ERROR_REPORTS) return;

                  reportedRuntimeFingerprints.add(fingerprint);
                  runtimeErrorReportCount += 1;

                  window.parent.postMessage({
                    type: 'PREVIEW_RUNTIME_ERROR',
                    payload: {
                      message,
                      stack: stack || undefined,
                      source,
                      category: deriveIssueCategory(message),
                      fingerprint,
                      routePath,
                      timestamp: Date.now(),
                    },
                  }, PARENT_ORIGIN);
                }

                function clearAllSelectedNodes() {
                  cleanupInlineTextEdit(false);
                  for (const entry of selectedNodes.values()) {
                    if (entry && entry.element && entry.element.classList) {
                      entry.element.classList.remove('ai-builder-selected');
                    }
                  }
                  selectedNodes.clear();
                  activeSelectionKey = '';
                }

                function selectorFromElement(element) {
                  if (!element || !(element instanceof Element)) return '';
                  if (element.getAttribute('data-source-id')) {
                    return '[data-source-id=\"' + element.getAttribute('data-source-id') + '\"]';
                  }
                  if (element.id) {
                    return '#' + element.id;
                  }
                  const tag = element.tagName.toLowerCase();
                  const firstClass = Array.from(element.classList || [])[0];
                  return firstClass ? (tag + '.' + firstClass) : tag;
                }

                function getCurrentPreviewRoutePath() {
                  const hash = window.location.hash || '';
                  if (hash.startsWith('#/')) return hash.slice(1);
                  if (hash.startsWith('#')) return '/' + hash;
                  return window.location.pathname || '/';
                }

                function buildVisualTargetInfo(element) {
                  const sourceId = element.getAttribute('data-source-id') || element.closest('[data-source-id]')?.getAttribute('data-source-id') || '';
                  const selector = sourceId
                    ? ('[data-source-id="' + sourceId.replace(/"/g, '\\"') + '"]')
                    : '';
                  const section = element.closest('[data-section-id], section[id], [id^=\"section\"], header[id], footer[id], nav[id], main[id]');
                  const sectionId = section
                    ? (section.getAttribute('data-section-id') || section.id || '')
                    : '';
                  return {
                    nodeId: element.getAttribute('data-ai-node-id') || '',
                    sourceId,
                    tagName: element.tagName.toLowerCase(),
                    className: element.className || '',
                    id: element.id || '',
                    innerText: element.innerText ? element.innerText.substring(0, 120) : '',
                    selector,
                    domPath: element.getAttribute('data-ai-node-id') || '',
                    sectionId,
                    routePath: getCurrentPreviewRoutePath(),
                    href: element.getAttribute('href') || (element.closest('a[href]')?.getAttribute('href') || ''),
                    role: element.getAttribute('role') || '',
                  };
                }

                function selectSingleElement(element, appendMode = false) {
                  if (!element || !(element instanceof Element)) return;
                  const targetInfo = buildVisualTargetInfo(element);
                  const selectionKey = targetInfo.nodeId || targetInfo.sourceId || targetInfo.selector || '';
                  if (!selectionKey) return;

                  if (!appendMode) {
                    clearAllSelectedNodes();
                  }

                  element.classList.add('ai-builder-selected');
                  selectedNodes.set(selectionKey, { element, info: targetInfo });
                  activeSelectionKey = selectionKey;

                  const selected = Array.from(selectedNodes.values())
                    .map((entry) => entry?.info)
                    .filter(Boolean);

                  window.parent.postMessage({
                    type: 'ELEMENT_SELECTED',
                    payload: {
                      ...targetInfo,
                      selected,
                      appendMode,
                      activeSelectionKey: selectionKey,
                    },
                  }, PARENT_ORIGIN);
                }

                function isInlineEditableElement(element) {
                  if (!element || !(element instanceof Element)) return false;
                  const tag = element.tagName.toLowerCase();
                  if (tag === 'html' || tag === 'body') return false;
                  if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'path') return false;
                  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return false;
                  if (element.id === 'root') return false;
                  return true;
                }

                function shouldAutoInlineEdit(element) {
                  if (!autoInlineTextEdit) return false;
                  if (!isInlineEditableElement(element)) return false;

                  const text = (element.innerText || '').trim();
                  if (!text) return false;

                  const tag = element.tagName.toLowerCase();
                  const textTags = new Set(['span', 'p', 'a', 'button', 'label', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'small']);
                  if (textTags.has(tag)) return true;

                  const childElementCount = element.children ? element.children.length : 0;
                  return childElementCount === 0;
                }

                function placeCaretAtEnd(element) {
                  try {
                    const selection = window.getSelection();
                    if (!selection) return;
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  } catch {
                    // Ignore selection placement failures.
                  }
                }

                function cleanupInlineTextEdit(restoreText) {
                  if (!inlineEditState) return;
                  const state = inlineEditState;
                  inlineEditState = null;

                  const element = state.element;
                  try {
                    element.removeEventListener('blur', state.onBlur);
                    element.removeEventListener('keydown', state.onKeyDown);
                    element.removeEventListener('input', state.onInput);
                  } catch {
                    // Ignore cleanup failures.
                  }

                  if (restoreText) {
                    element.innerText = state.previousText;
                  }

                  if (state.previousContentEditable === null) {
                    element.removeAttribute('contenteditable');
                  } else {
                    element.setAttribute('contenteditable', state.previousContentEditable);
                  }

                  element.spellcheck = state.previousSpellcheck;
                  element.style.userSelect = state.previousUserSelect;
                  element.style.cursor = state.previousCursor;
                  element.style.outline = state.previousOutline;
                  element.style.minWidth = state.previousMinWidth;
                  element.style.whiteSpace = state.previousWhiteSpace;
                  element.style.padding = state.previousPadding;
                  element.style.borderRadius = state.previousBorderRadius;

                  isInspectMode = Boolean(state.wasInspectMode);
                  document.body.classList.toggle('ai-builder-inspect-active', isInspectMode);
                }

                function commitInlineTextEdit() {
                  if (!inlineEditState) return;
                  const state = inlineEditState;
                  const element = state.element;
                  const committedText = (element.innerText || '').replace(/\\u00a0/g, ' ').replace(/\\r/g, '');

                  const targetInfo = buildVisualTargetInfo(element);
                  targetInfo.innerText = committedText.substring(0, 120);

                  const existing = selectedNodes.get(state.selectionKey);
                  if (existing) {
                    selectedNodes.set(state.selectionKey, {
                      element,
                      info: {
                        ...existing.info,
                        ...targetInfo,
                      },
                    });
                  } else {
                    element.classList.add('ai-builder-selected');
                    selectedNodes.set(state.selectionKey, { element, info: targetInfo });
                    activeSelectionKey = state.selectionKey;
                  }

                  const selected = Array.from(selectedNodes.values())
                    .map((entry) => entry?.info)
                    .filter(Boolean);

                  cleanupInlineTextEdit(false);

                  if (committedText !== state.previousText) {
                    window.parent.postMessage({
                      type: 'INLINE_TEXT_EDIT_COMMIT',
                      payload: {
                        ...targetInfo,
                        selected,
                        appendMode: false,
                        activeSelectionKey: state.selectionKey,
                        text: committedText,
                      },
                    }, PARENT_ORIGIN);
                  }
                }

                function activateInlineTextEdit(selectionKey) {
                  const requestedKey = selectionKey || activeSelectionKey;
                  const selectedEntry = selectedNodes.get(requestedKey) || Array.from(selectedNodes.values())[0];
                  const element = selectedEntry?.element;
                  if (!element || !(element instanceof Element)) return;
                  if (!isInlineEditableElement(element)) return;

                  if (inlineEditState && inlineEditState.element === element) {
                    requestAnimationFrame(() => placeCaretAtEnd(element));
                    return;
                  }

                  cleanupInlineTextEdit(false);

                  const wasInspectMode = isInspectMode;
                  isInspectMode = false;
                  document.body.classList.remove('ai-builder-inspect-active');
                  if (currentHighlight) {
                    currentHighlight.classList.remove('ai-builder-highlight');
                    currentHighlight = null;
                  }

                  const previousText = element.innerText || '';
                  const previousContentEditable = element.getAttribute('contenteditable');
                  const previousSpellcheck = element.spellcheck;
                  const previousUserSelect = element.style.userSelect;
                  const previousCursor = element.style.cursor;
                  const previousOutline = element.style.outline;
                  const previousMinWidth = element.style.minWidth;
                  const previousWhiteSpace = element.style.whiteSpace;
                  const previousPadding = element.style.padding;
                  const previousBorderRadius = element.style.borderRadius;

                  element.setAttribute('contenteditable', 'true');
                  element.spellcheck = false;
                  element.style.userSelect = 'text';
                  element.style.cursor = 'text';
                  element.style.outline = '2px solid rgba(59, 130, 246, 0.55)';
                  element.style.minWidth = element.style.minWidth || '8px';
                  element.style.whiteSpace = element.style.whiteSpace || 'pre-wrap';
                  element.style.padding = element.style.padding || '1px 2px';
                  element.style.borderRadius = element.style.borderRadius || '3px';

                  const onBlur = () => {
                    commitInlineTextEdit();
                  };
                  const emitInlineDraft = () => {
                    const draftText = (element.innerText || '').replace(/\\u00a0/g, ' ').replace(/\\r/g, '');
                    const targetInfo = buildVisualTargetInfo(element);
                    targetInfo.innerText = draftText.substring(0, 120);
                    const selected = Array.from(selectedNodes.values())
                      .map((entry) => entry?.info)
                      .filter(Boolean);
                    window.parent.postMessage({
                      type: 'INLINE_TEXT_EDIT_DRAFT',
                      payload: {
                        ...targetInfo,
                        selected,
                        appendMode: false,
                        activeSelectionKey: requestedKey,
                        text: draftText,
                      },
                    }, PARENT_ORIGIN);
                  };
                  const onInput = () => {
                    emitInlineDraft();
                  };
                  const onKeyDown = (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cleanupInlineTextEdit(true);
                      return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      commitInlineTextEdit();
                    }
                  };

                  element.addEventListener('blur', onBlur);
                  element.addEventListener('input', onInput);
                  element.addEventListener('keydown', onKeyDown);

                  inlineEditState = {
                    selectionKey: requestedKey,
                    element,
                    previousText,
                    previousContentEditable,
                    previousSpellcheck,
                    previousUserSelect,
                    previousCursor,
                    previousOutline,
                    previousMinWidth,
                    previousWhiteSpace,
                    previousPadding,
                    previousBorderRadius,
                    wasInspectMode,
                    onBlur,
                    onInput,
                    onKeyDown,
                  };

                  requestAnimationFrame(() => {
                    element.focus();
                    placeCaretAtEnd(element);
                  });
                }

                window.addEventListener('message', (event) => {
                  if (event.source !== window.parent || event.origin !== PARENT_ORIGIN) {
                    return;
                  }
                  if (event.data.type === 'TOGGLE_INSPECT') {
                    isInspectMode = event.data.payload;
                    document.body.classList.toggle('ai-builder-inspect-active', isInspectMode);
                    if (!isInspectMode && currentHighlight) {
                       currentHighlight.classList.remove('ai-builder-highlight');
                       currentHighlight = null;
                    }
                    return;
                  }

                  if (event.data.type === 'SET_PREVIEW_PATH') {
                    const incomingPath = normalizePreviewPathInput(event.data?.payload?.path);
                    if (lastInternalPreviewPath && incomingPath === lastInternalPreviewPath) {
                      // Avoid echo-loop: path was already applied inside iframe and sent to parent.
                      lastInternalPreviewPath = null;
                      return;
                    }
                    applyPreviewPath(incomingPath, false);
                    return;
                  }

                  if (event.data.type === 'CLEAR_SELECTION') {
                    clearAllSelectedNodes();
                    return;
                  }

                  if (event.data.type === 'SELECT_PARENT') {
                    const requestedKey = event.data?.payload?.activeSelectionKey || activeSelectionKey;
                    const selectedEntry = selectedNodes.get(requestedKey) || Array.from(selectedNodes.values())[0];
                    const currentElement = selectedEntry?.element;
                    if (!currentElement || !(currentElement instanceof Element)) return;

                    let parent = currentElement.parentElement;
                    while (parent && (parent === document.body || parent.id === 'root')) {
                      parent = parent.parentElement;
                    }
                    if (!parent) return;

                    selectSingleElement(parent, false);
                    return;
                  }

                  if (event.data.type === 'ACTIVATE_INLINE_TEXT_EDIT') {
                    const requestedKey = event.data?.payload?.activeSelectionKey || activeSelectionKey;
                    activateInlineTextEdit(requestedKey);
                    return;
                  }

                  if (event.data.type === 'SET_AUTO_INLINE_EDIT') {
                    autoInlineTextEdit = Boolean(event.data?.payload);
                    return;
                  }

                  if (event.data.type === 'DISCARD_INLINE_TEXT_EDITS') {
                    cleanupInlineTextEdit(true);
                    return;
                  }
                });

                // Keep anchor navigation inside preview document.
                // Without this, hash links can navigate the iframe to the host route
                // (e.g. /generator#features), which breaks in sandboxed origin-null mode.
                function scrollToHashTarget(hashValue) {
                  if (!hashValue) return;
                  const decoded = decodeURIComponent(hashValue);
                  const directTarget = document.getElementById(decoded);
                  if (directTarget && typeof directTarget.scrollIntoView === 'function') {
                    const scrollingElement = document.scrollingElement || document.documentElement || document.body;
                    const rect = directTarget.getBoundingClientRect();
                    const currentTop = scrollingElement.scrollTop || 0;
                    const stickyOffset = 8;
                    const nextTop = Math.max(0, currentTop + rect.top - stickyOffset);
                    scrollingElement.scrollTo({ top: nextTop, behavior: 'smooth' });
                    return;
                  }

                  if (window.CSS && typeof window.CSS.escape === 'function') {
                    const escaped = window.CSS.escape(decoded);
                    const namedTarget = document.querySelector('[name=\"' + escaped + '\"]');
                    if (namedTarget && typeof namedTarget.scrollIntoView === 'function') {
                      namedTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }
                }

                function isHashRouterRoute(href) {
                  return href.startsWith('#/');
                }

                function isLikelyInPreviewHashLink(href) {
                  return (href.startsWith('#') || href.startsWith('/#') || href.startsWith('./#')) && !href.startsWith('#/');
                }

                function resolvePreviewHref(href) {
                  if (!href) return null;
                  const trimmed = String(href).trim();
                  if (!trimmed) return null;
                  if (trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
                    return null;
                  }
                  if (isHashRouterRoute(trimmed) || isLikelyInPreviewHashLink(trimmed)) return trimmed;
                  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
                  if (/^https?:\\/\\//i.test(trimmed)) {
                    try {
                      const parsed = new URL(trimmed);
                      const hash = parsed.hash || '';
                      if (hash.startsWith('#/')) return hash;
                      return \`\${parsed.pathname || '/'}\${parsed.search || ''}\${hash}\`;
                    } catch {
                      return null;
                    }
                  }
                  return null;
                }

                function applyPreviewPath(rawPath, notifyParent = true) {
                  const normalized = normalizePreviewPathInput(rawPath);

                  if (normalized.startsWith('#/')) {
                    if (window.location.hash !== normalized) {
                      window.location.hash = normalized;
                    }
                    if (notifyParent) postPreviewPath(normalized);
                    return;
                  }

                  if (normalized.startsWith('#')) {
                    scrollToHashTarget(normalized.slice(1));
                    if (notifyParent) postPreviewPath(normalized);
                    return;
                  }

                  const hashIndex = normalized.indexOf('#');
                  const routePath = hashIndex >= 0
                    ? (normalized.slice(0, hashIndex) || '/')
                    : normalized;
                  const hash = hashIndex >= 0 ? normalized.slice(hashIndex + 1) : '';

                  const isSandboxedSrcdoc = window.origin === 'null' || location.protocol === 'about:';
                  if (!isSandboxedSrcdoc) {
                    try {
                      history.replaceState({}, '', routePath);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    } catch (error) {
                      console.warn('[Preview] Failed to update route path:', routePath, error);
                    }
                  } else {
                    if (routePath === '/') {
                      if (window.location.hash.startsWith('#/')) {
                        window.location.hash = '';
                      }
                    } else {
                      const hashRoute = routePath.startsWith('/') ? \`#\${routePath}\` : \`#/\${routePath}\`;
                      if (window.location.hash !== hashRoute) {
                        window.location.hash = hashRoute;
                      }
                    }
                  }

                  if (hash) {
                    requestAnimationFrame(() => scrollToHashTarget(hash));
                  }

                  if (notifyParent) {
                    postPreviewPath(normalized);
                  }
                }

                function navigateInsidePreview(href, notifyParent = true) {
                  const resolved = resolvePreviewHref(href);
                  if (!resolved) return false;
                  if (isHashRouterRoute(resolved)) {
                    applyPreviewPath(resolved, notifyParent);
                    return true;
                  }
                  if (isLikelyInPreviewHashLink(resolved)) {
                    const hashIndex = resolved.indexOf('#');
                    const hash = hashIndex >= 0 ? resolved.slice(hashIndex + 1) : '';
                    if (hash) {
                      scrollToHashTarget(hash);
                    }
                    if (notifyParent) {
                      postPreviewPath(resolved);
                    }
                    return true;
                  }
                  applyPreviewPath(resolved, notifyParent);
                  return true;
                }

                document.addEventListener('click', (event) => {
                  if (inlineEditState) return;
                  if (isInspectMode) return;

                  const rawTarget = event.target;
                  const targetElement =
                    rawTarget instanceof Element
                      ? rawTarget
                      : rawTarget instanceof Node
                        ? rawTarget.parentElement
                        : null;
                  if (!targetElement) return;
                  const anchor = targetElement.closest('a[href]');
                  if (!anchor) return;

                  const href = anchor.getAttribute('href') || '';
                  if (!href) return;

                  event.preventDefault();
                  event.stopPropagation();
                  if (typeof event.stopImmediatePropagation === 'function') {
                    event.stopImmediatePropagation();
                  }

                  const navigated = navigateInsidePreview(href, true);
                  if (!navigated) {
                    console.warn('[Preview] Navigation blocked in sandboxed iframe:', href);
                  }
                }, true);

                document.addEventListener('submit', (event) => {
                  if (inlineEditState) return;
                  if (isInspectMode) return;
                  const form = event.target && event.target.closest ? event.target.closest('form') : null;
                  if (!form) return;
                  event.preventDefault();
                  event.stopPropagation();

                  const action = form.getAttribute('action') || '';
                  const navigated = navigateInsidePreview(action || '/', true);
                  if (!navigated) {
                    console.warn('[Preview] Form submission blocked in sandboxed iframe:', action);
                  }
                }, true);

                const originalWindowOpen = window.open;
                window.open = function(url, target, features) {
                  const navigated = navigateInsidePreview(String(url || ''), true);
                  if (navigated) return null;
                  console.warn('[Preview] window.open blocked in sandboxed iframe:', url);
                  return null;
                };

                window.addEventListener('hashchange', () => {
                  const currentHash = window.location.hash || '';
                  if (!currentHash) {
                    postPreviewPath('/');
                    return;
                  }
                  if (currentHash.startsWith('#/')) {
                    postPreviewPath(currentHash.slice(1));
                    return;
                  }
                  postPreviewPath(currentHash);
                });

                window.addEventListener('error', (event) => {
                  reportRuntimeIssue({
                    message: event?.error?.message || event?.message || 'Window error',
                    stack: event?.error?.stack || '',
                    source: 'window.error',
                  });
                });

                window.addEventListener('unhandledrejection', (event) => {
                  const reason = event?.reason;
                  reportRuntimeIssue({
                    message: reason?.message || normalizeIssueMessage(reason),
                    stack: reason?.stack || '',
                    source: 'window.unhandledrejection',
                  });
                });

                // Block zoom interactions inside preview iframe.
                document.addEventListener('wheel', (event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                  }
                }, { passive: false });

                document.addEventListener('keydown', (event) => {
                  if (!(event.ctrlKey || event.metaKey)) return;
                  const key = event.key;
                  if (key === '+' || key === '-' || key === '=' || key === '0') {
                    event.preventDefault();
                  }
                }, true);

                window.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
                window.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
                window.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });

                document.addEventListener('mouseover', (e) => {
                  if (!isInspectMode) return;
                  e.preventDefault();
                  e.stopPropagation();

                  function getElementTarget(target) {
                    if (target instanceof Element) return target;
                    if (target instanceof Node) return target.parentElement;
                    return null;
                  }

                  function ensureElementTraceIds() {
                    const root = document.getElementById('root');
                    if (!root) return;

                    const walk = (element, path) => {
                      if (!(element instanceof Element)) return;
                      if (element !== root) {
                        element.setAttribute('data-ai-node-id', 'n-' + path);
                      }
                      const children = Array.from(element.children);
                      children.forEach((child, index) => {
                        const childPath = path ? (path + '.' + index) : String(index);
                        walk(child, childPath);
                      });
                    };

                    walk(root, '0');
                  }

                  const hoverTarget = getElementTarget(e.target);
                  if (!hoverTarget) return;
                  ensureElementTraceIds();

                  if (currentHighlight && currentHighlight !== hoverTarget) {
                    currentHighlight.classList.remove('ai-builder-highlight');
                  }
                  
                  // Don't highlight root or body
                  if (hoverTarget !== document.body && hoverTarget.id !== 'root') {
                    currentHighlight = hoverTarget;
                    currentHighlight.classList.add('ai-builder-highlight');
                  }
                }, true);

                document.addEventListener('click', (e) => {
                  if (!isInspectMode) return;
                  e.preventDefault();
                  e.stopPropagation();

                  function getElementTarget(target) {
                    if (target instanceof Element) return target;
                    if (target instanceof Node) return target.parentElement;
                    return null;
                  }

                  function cssEscape(value) {
                    if (window.CSS && typeof window.CSS.escape === 'function') {
                      return window.CSS.escape(value);
                    }
                    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
                  }

                  function getElementSelector(el) {
                    if (el.id) return '#' + cssEscape(el.id);
                    const parts = [];
                    let current = el;
                    let depth = 0;
                    while (current && current !== document.body && depth < 6) {
                      let part = current.tagName.toLowerCase();
                      const classNames = Array.from(current.classList || []).slice(0, 2);
                      if (classNames.length > 0) {
                        part += '.' + classNames.map(cssEscape).join('.');
                      }
                      if (current.parentElement) {
                        const sameTagSiblings = Array.from(current.parentElement.children)
                          .filter((child) => child.tagName === current.tagName);
                        if (sameTagSiblings.length > 1) {
                          const index = sameTagSiblings.indexOf(current) + 1;
                          part += ':nth-of-type(' + index + ')';
                        }
                      }
                      parts.unshift(part);
                      if (current.parentElement && current.parentElement.id) {
                        parts.unshift('#' + cssEscape(current.parentElement.id));
                        break;
                      }
                      current = current.parentElement;
                      depth += 1;
                    }
                    return parts.join(' > ');
                  }

                  function findSectionHint(el) {
                    const section = el.closest('[data-section-id], section[id], [id^=\"section\"], header[id], footer[id], nav[id], main[id]');
                    if (!section) return '';
                    if (section.getAttribute('data-section-id')) return section.getAttribute('data-section-id') || '';
                    return section.id || '';
                  }

                  function getCurrentPreviewRoutePath() {
                    const hash = window.location.hash || '';
                    if (hash.startsWith('#/')) return hash.slice(1);
                    if (hash.startsWith('#')) return '/' + hash;
                    return window.location.pathname || '/';
                  }

                  function ensureElementTraceIds() {
                    const root = document.getElementById('root');
                    if (!root) return;
                    const walk = (element, path) => {
                      if (!(element instanceof Element)) return;
                      if (element !== root) {
                        element.setAttribute('data-ai-node-id', 'n-' + path);
                      }
                      Array.from(element.children).forEach((child, index) => {
                        const childPath = path ? (path + '.' + index) : String(index);
                        walk(child, childPath);
                      });
                    };
                    walk(root, '0');
                  }

                  const clickedElement = getElementTarget(e.target);
                  if (!clickedElement || clickedElement === document.body || clickedElement.id === 'root') return;
                  ensureElementTraceIds();

                  const appendMode = Boolean(e.metaKey || e.ctrlKey || e.shiftKey);
                  const targetInfo = buildVisualTargetInfo(clickedElement);

                  const selectionKey = targetInfo.nodeId || targetInfo.sourceId || targetInfo.selector || '';
                  if (!selectionKey) return;

                  const alreadySelected = selectedNodes.has(selectionKey);
                  if (appendMode && alreadySelected) {
                    const previous = selectedNodes.get(selectionKey);
                    if (previous && previous.element && previous.element.classList) {
                      previous.element.classList.remove('ai-builder-selected');
                    }
                    selectedNodes.delete(selectionKey);
                    activeSelectionKey = Array.from(selectedNodes.keys())[0] || '';
                  } else {
                    selectSingleElement(clickedElement, appendMode);
                    if (!appendMode && shouldAutoInlineEdit(clickedElement)) {
                      requestAnimationFrame(() => activateInlineTextEdit(selectionKey));
                    }
                    return;
                  }

                  const selected = Array.from(selectedNodes.values())
                    .map((entry) => entry?.info)
                    .filter(Boolean);

                  const lead = selected[0] || targetInfo;
                  
                  window.parent.postMessage({
                    type: 'ELEMENT_SELECTED',
                    payload: {
                      ...lead,
                      selected,
                      appendMode,
                      activeSelectionKey,
                    }
                  }, PARENT_ORIGIN);
                }, true);
                
                // --- End Inspector Logic ---

                async function init() {
                  const rootElement = document.getElementById('root');
                  if (!rootElement) {
                    throw new Error('Preview root element not found.');
                  }
                  let blobUrl = null;

                  const hasRenderedPreviewContent = () => {
                    if (rootElement.children.length > 0) return true;
                    const textContent = (rootElement.textContent || '').trim();
                    return textContent.length > 0;
                  };

                  const annotatePreviewTree = () => {
                    requestAnimationFrame(() => {
                      const rootElement = document.getElementById('root');
                      if (!rootElement) return;
                      const walk = (element, path) => {
                        if (!(element instanceof Element)) return;
                        if (element !== rootElement) {
                          element.setAttribute('data-ai-node-id', 'n-' + path);
                        }
                        Array.from(element.children).forEach((child, index) => {
                          const childPath = path ? (path + '.' + index) : String(index);
                          walk(child, childPath);
                        });
                      };
                      walk(rootElement, '0');
                    });
                  };

                  const reportRuntimeOk = () => {
                    renderBundleErrorOverlay('');
                    window.parent.postMessage({
                      type: 'PREVIEW_RUNTIME_OK',
                      payload: {
                        routePath: getCurrentPreviewRoutePath(),
                        timestamp: Date.now(),
                      },
                    }, PARENT_ORIGIN);
                    annotatePreviewTree();
                  };

                  const renderMissingComponentError = () => {
                    rootElement.innerHTML = '';
                    const container = document.createElement('div');
                    container.className = 'p-8 text-red-500 font-bold bg-red-50 rounded-lg m-4 border border-red-200';
                    container.textContent = 'Fehler: Keine React-Komponente (default export oder "App") im generierten Code gefunden.';
                    rootElement.appendChild(container);
                  };

                  try {
                    applyPreviewPath(INITIAL_PREVIEW_PATH, true);

                    // Wir nutzen einen Blob-URL Import, um das Modul-Scope-Problem zu lösen
                    globalThis.React = React;
                    const code = ${JSON.stringify(compiled)};
                    const blob = new Blob([code], { type: 'text/javascript' });
                    blobUrl = URL.createObjectURL(blob);
                    
                    const AppModule = await import(blobUrl);

                    // Suche nach der Komponente im Modul
                    const MainComponent = AppModule.default || AppModule.App || Object.values(AppModule).find(v => typeof v === 'function');

                    if (MainComponent) {
                      const root = createRoot(rootElement);
                      const appElement = React.createElement(MainComponent);
                      const renderElement = SHOULD_WRAP_IN_HASH_ROUTER
                        ? React.createElement(HashRouter, null, appElement)
                        : appElement;
                      root.render(renderElement);
                      reportRuntimeOk();
                    } else {
                      if (!hasRenderedPreviewContent()) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                      }
                      if (hasRenderedPreviewContent()) {
                        reportRuntimeOk();
                      } else {
                        renderMissingComponentError();
                      }
                    }
                  } catch (e) {
                    console.error('Render Error:', e);
                    renderBundleErrorOverlay(e?.stack || e?.message || 'Render error');
                    reportRuntimeIssue({
                      message: e?.message || 'Render error',
                      stack: e?.stack || '',
                      source: 'render.catch',
                    });
                    rootElement.innerHTML = '';
                    const container = document.createElement('div');
                    container.className = 'p-4 bg-red-50 border border-red-200 m-4 rounded';
                    const title = document.createElement('h2');
                    title.className = 'text-red-700 font-bold mb-2';
                    title.textContent = 'Render-Fehler';
                    const pre = document.createElement('pre');
                    pre.className = 'text-red-600 text-xs overflow-auto';
                    pre.textContent = e?.stack || e?.message || 'Render error';
                    container.appendChild(title);
                    container.appendChild(pre);
                    rootElement.appendChild(container);
                  } finally {
                    // Always revoke blob URL to prevent memory leaks
                    if (blobUrl) {
                      URL.revokeObjectURL(blobUrl);
                    }
                  }
                }

                init();
              </script>
            </body>
          </html>
        `;

        if (onPreviewDocumentRef.current) {
          onPreviewDocumentRef.current(html);
        }

        if (iframeRef.current) {
          iframeRef.current.srcdoc = html;
        }
      } catch (err: any) {
        setError(err.message);
        onPreviewIssueRef.current?.({
          type: 'bundler',
          message: err?.message || 'Bundling error',
          stack: err?.stack,
          source: 'local-preview.bundler',
          category: 'bundler',
          timestamp: Date.now(),
        });
      } finally {
        setIsUpdating(false);
      }
    };

    const timer = setTimeout(updatePreview, 800); // Debounce - increased for better performance
    return () => clearTimeout(timer);
  }, [code, files, entryPath, dependencies, refreshToken]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_PREVIEW_PATH',
        payload: { path: previewPath }
      }, '*');
    }
  }, [previewPath]);

  const iframeInlineStyle: React.CSSProperties | undefined = previewMode === 'mobile'
    ? { width: '390px', maxWidth: '100%', display: 'block', margin: '0 auto' }
    : undefined;

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg overflow-auto h-full font-mono text-sm">
        <h3 className="font-bold mb-2 underline">Bundling Error:</h3>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Live Update Indicator */}
      {isUpdating && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-blue-500/90 text-white px-3 py-1.5 rounded-full shadow-lg animate-pulse">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-xs font-medium">Updating...</span>
        </div>
      )}

      <iframe
        ref={iframeRef}
        className="w-full h-full border-none bg-white rounded-lg shadow-inner"
        style={iframeInlineStyle}
        title="Local Preview"
        sandbox="allow-scripts"
      />
    </div>
  );
};

export default LocalPreview;
