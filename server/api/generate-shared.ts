/**
 * Shared App-level helpers used by both generate.ts and llm-response-parser.ts.
 *
 * This module de-duplicates constants and functions that were previously copied
 * between the two files. Keeping a single source of truth prevents silent
 * divergence when one copy receives a bugfix the other doesn't.
 */

// ---------------------------------------------------------------------------
// normalizeGeneratedPath is imported from generate-path-utils, re-exported for
// convenience so that consumers who need both path utils AND app-export helpers
// can import from a single place.
// ---------------------------------------------------------------------------
import { normalizeGeneratedPath } from './generate-path-utils.js';
export { normalizeGeneratedPath };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const APP_DEFAULT_EXPORT_FALLBACK = `export default function App() {
  return <div className="p-8 text-red-500">Generation incomplete - please retry</div>;
}
`;

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

export function hasDefaultExport(code: string): boolean {
    const source = String(code || '');
    return /\bexport\s+default\b/.test(source) || /\bexport\s*\{\s*App\s+as\s+default\s*\}/.test(source);
}

export function tryInjectDefaultExportForApp(code: string): string | null {
    const source = String(code || '');
    if (!source.trim()) return null;
    if (hasDefaultExport(source)) return source;

    const hasNamedApp =
        /\bfunction\s+App\s*\(/.test(source) ||
        /\b(?:const|let|var)\s+App\b/.test(source) ||
        /\bclass\s+App\b/.test(source) ||
        /\bexport\s+(?:const|function|class)\s+App\b/.test(source) ||
        /\bexport\s*\{[^}]*\bApp\b[^}]*\}/.test(source);

    if (!hasNamedApp) return null;
    return `${source.replace(/\s+$/, '')}\n\nexport default App;\n`;
}

export function isAppModulePath(path: string): boolean {
    const normalized = normalizeGeneratedPath(path || '');
    return normalized === 'src/App.tsx' || normalized === 'App.tsx';
}

/**
 * Ensures every App module file in `files` has a default export.
 * Normalises the file path to `src/App.tsx` and injects a fallback if needed.
 */
export function ensureAppDefaultExportInFiles(
    files: Array<{ path: string; content: string }>
): { files: Array<{ path: string; content: string }>; patched: boolean; hasAppFile: boolean } {
    let patched = false;
    let hasAppFile = false;

    const nextFiles = files.map((file) => {
        if (!isAppModulePath(file.path)) return file;
        hasAppFile = true;
        if (hasDefaultExport(file.content)) {
            return {
                ...file,
                path: 'src/App.tsx',
            };
        }
        const injected = tryInjectDefaultExportForApp(file.content);
        if (injected) {
            patched = true;
            return {
                ...file,
                path: 'src/App.tsx',
                content: injected,
            };
        }
        patched = true;
        return {
            ...file,
            path: 'src/App.tsx',
            content: APP_DEFAULT_EXPORT_FALLBACK,
        };
    });

    return { files: nextFiles, patched, hasAppFile };
}

export function looksLikeHtmlDocument(code: string): boolean {
    if (!code || typeof code !== 'string') return false;
    return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(code);
}

export function ensureAppDefaultExportInFileMap(
    files: Record<string, string>
): { files: Record<string, string>; patched: boolean; reason: 'missing' | 'invalid_html' | 'missing_default_export' | null } {
    const nextFiles = { ...files };
    const primaryPath = 'src/App.tsx';
    const legacyPath = 'App.tsx';
    const existingAppCode = typeof nextFiles[primaryPath] === 'string'
        ? nextFiles[primaryPath]
        : (typeof nextFiles[legacyPath] === 'string' ? nextFiles[legacyPath] : '');

    let reason: 'missing' | 'invalid_html' | 'missing_default_export' | null = null;
    if (!existingAppCode.trim()) {
        reason = 'missing';
    } else if (looksLikeHtmlDocument(existingAppCode)) {
        reason = 'invalid_html';
    } else if (!hasDefaultExport(existingAppCode)) {
        const injected = tryInjectDefaultExportForApp(existingAppCode);
        if (injected) {
            nextFiles[primaryPath] = injected;
            if (nextFiles[legacyPath]) {
                delete nextFiles[legacyPath];
            }
            return { files: nextFiles, patched: true, reason: 'missing_default_export' };
        }
        reason = 'missing_default_export';
    }

    if (!reason) {
        if (!nextFiles[primaryPath] && nextFiles[legacyPath]) {
            nextFiles[primaryPath] = nextFiles[legacyPath];
            delete nextFiles[legacyPath];
            return { files: nextFiles, patched: true, reason: null };
        }
        return { files: nextFiles, patched: false, reason: null };
    }

    nextFiles[primaryPath] = APP_DEFAULT_EXPORT_FALLBACK;
    if (nextFiles[legacyPath]) {
        delete nextFiles[legacyPath];
    }

    return { files: nextFiles, patched: true, reason };
}
