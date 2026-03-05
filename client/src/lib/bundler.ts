import * as esbuild from 'esbuild-wasm';
import { injectJsxSourceIds } from '../utils/jsx-source-id-utils';

let initializationPromise: Promise<void> | null = null;

interface BundleOptions {
    files?: Record<string, string>;
    entryPath?: string;
}

interface BuildDiagnostic {
    message: string;
    file?: string;
    line?: number;
    column?: number;
    lineText?: string;
}

export interface StructuredBuildErrorItem {
    file: string;
    line: number;
    message: string;
    suggestion: string;
}

export interface StructuredBuildErrorInfo {
    type: 'build-error';
    errors: StructuredBuildErrorItem[];
}

export class BundlerBuildError extends Error {
    type: 'build-error';
    errors: StructuredBuildErrorItem[];

    constructor(message: string, errors: StructuredBuildErrorItem[]) {
        super(message);
        this.name = 'BundlerBuildError';
        this.type = 'build-error';
        this.errors = errors;
    }
}

interface MissingExportIssue {
    targetPath: string;
    importName: string;
}

export const buildVisualEditSelectionScript = (parentOrigin: string): string => `
(() => {
  if (window.__AI_BUILDER_ADVANCED_VISUAL_EDIT__) return;
  const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
  const getTargetElement = (target) => {
    if (target instanceof Element) return target;
    if (target instanceof Node) return target.parentElement;
    return null;
  };
  const isEnabled = () => Boolean(window.__AI_BUILDER_VISUAL_EDIT_ENABLED__);

  document.addEventListener('mouseover', (event) => {
    if (!isEnabled()) return;
    const el = getTargetElement(event.target);
    if (!el || el === document.body || el.id === 'root') return;
    el.style.outline = '2px solid #8b5cf6';
    el.style.cursor = 'pointer';
  }, true);

  document.addEventListener('mouseout', (event) => {
    if (!isEnabled()) return;
    const el = getTargetElement(event.target);
    if (!el || el === document.body || el.id === 'root') return;
    el.style.outline = '';
  }, true);

  document.addEventListener('click', (event) => {
    if (!isEnabled()) return;
    const el = getTargetElement(event.target);
    if (!el || el === document.body || el.id === 'root') return;
    event.preventDefault();
    event.stopPropagation();
    const rect = el.getBoundingClientRect();
    const info = {
      tagName: el.tagName,
      className: el.className || '',
      textContent: (el.textContent || '').slice(0, 100),
      id: el.id || '',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
    };
    window.parent.postMessage({ type: 'ELEMENT_SELECTED', element: info, payload: info }, PARENT_ORIGIN);
  }, true);
})();
`;

const PREVIEW_ENTRY_CANDIDATES = ['src/main.tsx', 'src/index.tsx', 'main.tsx', 'index.tsx'] as const;

const SHADCN_COMMON_EXPORTS = [
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

const normalizePath = (input: string): string => {
    const raw = input.replace(/\\/g, '/');
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
};

const dirname = (path: string): string => {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx === -1) return '';
    return normalized.slice(0, idx);
};

const joinPath = (base: string, target: string): string => {
    if (target.startsWith('/')) return normalizePath(target.slice(1));
    if (!base) return normalizePath(target);
    return normalizePath(`${base}/${target}`);
};

const hasKnownExtension = (path: string): boolean =>
    /\.(tsx|ts|jsx|js|css|json)$/.test(path);

const inferLoader = (path: string): esbuild.Loader => {
    if (path.endsWith('.tsx')) return 'tsx';
    if (path.endsWith('.ts')) return 'ts';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.js')) return 'js';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.json')) return 'json';
    return 'tsx';
};

const createSyntheticModule = (path: string): string => {
    if (path.endsWith('.css')) {
        return `/* synthetic placeholder: ${path} */\n`;
    }
    if (path.endsWith('.json')) {
        return '{}\n';
    }
    const baseName = (path.split('/').pop() || 'Stub')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_$]/g, '') || 'Stub';
    const exportName = /^[A-Za-z_$]/.test(baseName)
        ? baseName.charAt(0).toUpperCase() + baseName.slice(1)
        : `Stub${baseName}`;
    return `export default function Stub() { return null; }\nexport const [${exportName}] = [() => null];\n`;
};

const toPascalCase = (value: string): string =>
    value
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('') || 'UiComponent';

const buildShadcnUiStubModule = (specifier: string): string => {
    const moduleName = specifier.split('/').pop() || 'component';
    const primaryExport = toPascalCase(moduleName);
    const exports = Array.from(new Set([primaryExport, ...SHADCN_COMMON_EXPORTS]));

    const lines: string[] = [
        `import * as React from 'react';`,
        `const __passthrough = (tag = 'div') => React.forwardRef((props, ref) => React.createElement(tag, { ...props, ref }, props?.children));`,
        `const __withDisplayName = (name) => { const Comp = __passthrough(); Comp.displayName = name; return Comp; };`,
        `export const cn = (...parts) => parts.filter(Boolean).join(' ');`,
    ];

    for (const exportName of exports) {
        if (exportName === 'cn') continue;
        lines.push(`export const ${exportName} = __withDisplayName('${exportName}');`);
    }

    lines.push(`export default ${primaryExport};`);
    return `${lines.join('\n')}\n`;
};

const resolveFromVirtualFiles = (candidate: string, files: Record<string, string>): string | null => {
    const normalized = normalizePath(candidate);
    const alternatives = new Set<string>([normalized]);

    if (normalized.startsWith('src/')) {
        alternatives.add(normalized.slice(4));
    } else {
        alternatives.add(`src/${normalized}`);
    }

    for (const alt of alternatives) {
        if (files[alt] !== undefined) return alt;
    }

    if (!hasKnownExtension(normalized)) {
        const extensions = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
        for (const base of alternatives) {
            for (const ext of extensions) {
                const withExt = `${base}${ext}`;
                if (files[withExt] !== undefined) return withExt;
            }
            for (const ext of extensions) {
                const indexPath = `${base}/index${ext}`;
                if (files[indexPath] !== undefined) return indexPath;
            }
        }
    }

    return null;
};

const normalizeFiles = (files: Record<string, string>): Record<string, string> => {
    const normalized: Record<string, string> = {};
    Object.entries(files).forEach(([path, content]) => {
        const cleanPath = normalizePath(path.replace(/^\.?\//, ''));
        if (!cleanPath) return;
        normalized[cleanPath] = content;
    });
    return normalized;
};

const injectSourceIdsIntoVirtualFiles = (files: Record<string, string>): Record<string, string> => {
    const next: Record<string, string> = {};
    Object.entries(files).forEach(([path, content]) => {
        if (/\.[tj]sx$/i.test(path)) {
            next[path] = injectJsxSourceIds(content, path);
            return;
        }
        next[path] = content;
    });
    return next;
};

const stripNarrativePrelude = (rawCode: string): string => {
    const normalized = rawCode.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    const lines = normalized.split('\n');
    if (lines.length <= 1) return normalized.trim();

    const codeAnchorPattern = /^(?:import\s|export\s|'use client'|["']use client["'];?|const\s|let\s|var\s|function\s|class\s|interface\s|type\s|enum\s|\/\/|\/\*|\*)/;
    const firstAnchorIndex = lines.findIndex((line) => codeAnchorPattern.test(line.trim()));
    if (firstAnchorIndex <= 0) return normalized.trim();

    return lines.slice(firstAnchorIndex).join('\n').trim();
};

const stripNarrativeNoiseLines = (rawCode: string): string => {
    const lines = rawCode.split('\n');
    const cleaned = lines.filter((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return true;
        if (/^```/.test(trimmed)) return false;
        if (/^[A-Za-z][A-Za-z0-9_ ./'"-]{0,120}:\s*$/.test(trimmed)) return false;
        if (/^[-*]\s+\S+/.test(trimmed)) return false;
        if (/^\d+\.\s+\S+/.test(trimmed)) return false;
        if (/^#{1,6}\s+\S+/.test(trimmed)) return false;
        return true;
    });
    return cleaned.join('\n').trim();
};

const cleanMarkdownCode = (rawCode: string): string => {
    const fencedMatches = [...rawCode.matchAll(/```(?:tsx|jsx|typescript|javascript)?\n([\s\S]*?)```/g)];
    if (fencedMatches.length > 0) {
        const best = fencedMatches
            .map((match) => (match[1] || '').trim())
            .sort((a, b) => b.length - a.length)[0];
        if (best) return stripNarrativeNoiseLines(stripNarrativePrelude(best));
    }

    return stripNarrativeNoiseLines(stripNarrativePrelude(rawCode));
};

const isCodeFilePath = (path: string): boolean => /\.(tsx|ts|jsx|js)$/i.test(path);

const tryParseStructuredPayload = (raw: string): unknown | null => {
    const trimmed = raw.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
};

const scoreCodeCandidate = (content: string, path?: string): number => {
    let score = Math.min(120, Math.floor(content.length / 40));
    const normalizedPath = (path || '').toLowerCase();
    if (normalizedPath.endsWith('/app.tsx') || normalizedPath === 'src/app.tsx' || normalizedPath === 'app.tsx') score += 260;
    if (normalizedPath.endsWith('/main.tsx') || normalizedPath === 'src/main.tsx' || normalizedPath === 'main.tsx') score += 120;
    if (/\bexport\s+default\b/.test(content)) score += 120;
    if (/\bimport\s+/.test(content)) score += 60;
    if (/\breturn\s*\(/.test(content)) score += 35;
    if (/<[A-Za-z][^>]*>/.test(content)) score += 30;
    if (/^\s*[{[][\s\S]*["'][^"']+["']\s*:\s*/.test(content)) score -= 180;
    return score;
};

const extractCodeFromStructuredPayload = (raw: string): string | null => {
    const parsed = tryParseStructuredPayload(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidates: Array<{ content: string; path?: string }> = [];
    const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === 'string') {
                    candidates.push({ content: item });
                    return;
                }
                if (item && typeof item === 'object') {
                    const path = typeof (item as any).path === 'string' ? (item as any).path : undefined;
                    const content = typeof (item as any).content === 'string'
                        ? (item as any).content
                        : (typeof (item as any).code === 'string' ? (item as any).code : undefined);
                    if (content) {
                        candidates.push({ path, content });
                    }
                }
            });
            return;
        }

        const obj = value as Record<string, unknown>;

        const directKeys = ['code', 'content', 'primaryCode', 'appCode', 'tsx', 'jsx'];
        directKeys.forEach((key) => {
            const maybe = obj[key];
            if (typeof maybe === 'string') {
                candidates.push({ path: key.toLowerCase().includes('app') ? 'src/App.tsx' : undefined, content: maybe });
            }
        });

        Object.entries(obj).forEach(([key, val]) => {
            if (typeof val === 'string' && /\.[tj]sx?$/.test(key)) {
                candidates.push({ path: key, content: val });
            }
        });

        if (Array.isArray(obj.files)) {
            visit(obj.files);
        }
    };

    visit(parsed);
    if (candidates.length === 0) return null;

    const best = candidates
        .filter((entry) => typeof entry.content === 'string' && entry.content.trim().length > 0)
        .sort((a, b) => scoreCodeCandidate(b.content, b.path) - scoreCodeCandidate(a.content, a.path))[0];

    return best?.content?.trim() || null;
};

const normalizeLikelyModuleSource = (raw: string): string => {
    const markdownCleaned = cleanMarkdownCode(raw);
    const extracted = extractCodeFromStructuredPayload(markdownCleaned) || extractCodeFromStructuredPayload(raw);
    const normalized = (extracted ?? markdownCleaned).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
    return normalized;
};

const findMatchingBrace = (content: string, openBraceIndex: number): number => {
    let depth = 0;
    for (let i = openBraceIndex; i < content.length; i += 1) {
        const char = content[i];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
};

const stripExtraDefaultExports = (code: string): string => {
    let output = String(code || '');

    while (true) {
        const matches = Array.from(output.matchAll(/export\s+default\b/g));
        if (matches.length <= 1) break;

        let keepIndex = matches[0].index || 0;
        const appMatch = output.match(/export\s+default\s+function\s+App\b/);
        if (appMatch && typeof appMatch.index === 'number') {
            keepIndex = appMatch.index;
        }

        const removable = [...matches].reverse().find((match) => (match.index || 0) !== keepIndex);
        if (!removable) break;
        const start = removable.index || 0;

        const after = output.slice(start);
        const fnMatch = after.match(/^export\s+default\s+function\b/);
        if (fnMatch) {
            const openBrace = output.indexOf('{', start);
            if (openBrace !== -1) {
                const closeBrace = findMatchingBrace(output, openBrace);
                if (closeBrace !== -1) {
                    output = output.slice(0, start) + output.slice(closeBrace + 1);
                    continue;
                }
            }
        }

        const statementEnd = output.indexOf('\n', start);
        if (statementEnd === -1) {
            output = output.slice(0, start);
        } else {
            output = output.slice(0, start) + output.slice(statementEnd + 1);
        }
    }

    const explicitDefaultCount = (output.match(/export\s+default\b/g) || []).length;
    let aliasDefaultKept = false;
    const keepSingleAliasDefault = explicitDefaultCount === 0;

    const isDefaultExportSpecifier = (specifier: string): boolean => {
        const trimmed = specifier.trim();
        if (!trimmed) return false;
        if (trimmed === 'default') return true;
        const aliasMatch = trimmed.match(
            /^([A-Za-z_$][A-Za-z0-9_$]*|default)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*|default)$/
        );
        return Boolean(aliasMatch && aliasMatch[2] === 'default');
    };

    output = output.replace(
        /export\s*\{([^}]*)\}\s*(from\s*['"][^'"]+['"])?\s*;?/g,
        (_full, specifierBlock: string, fromClause?: string) => {
            const specifiers = String(specifierBlock || '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);

            if (specifiers.length === 0) return '';

            const remaining: string[] = [];
            for (const specifier of specifiers) {
                if (!isDefaultExportSpecifier(specifier)) {
                    remaining.push(specifier);
                    continue;
                }

                if (keepSingleAliasDefault && !aliasDefaultKept) {
                    remaining.push(specifier);
                    aliasDefaultKept = true;
                }
            }

            if (remaining.length === 0) return '';

            const normalizedFrom = fromClause ? ` ${String(fromClause).trim()}` : '';
            return `export { ${remaining.join(', ')} }${normalizedFrom};`;
        }
    );

    return output;
};

const rewriteBrowserRouterToHashRouter = (code: string): string => {
    let output = String(code || '');

    const normalizeImportSpecifiers = (specifierBlock: string): string => {
        const seen = new Set<string>();
        const normalized = String(specifierBlock || '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((specifier) => {
                const aliasMatch = specifier.match(/^BrowserRouter\s+as\s+([A-Za-z_$][\w$]*)$/);
                if (aliasMatch?.[1]) {
                    return `HashRouter as ${aliasMatch[1]}`;
                }
                return specifier === 'BrowserRouter' ? 'HashRouter' : specifier;
            })
            .filter((specifier) => {
                if (seen.has(specifier)) return false;
                seen.add(specifier);
                return true;
            });

        return normalized.join(', ');
    };

    output = output.replace(
        /import\s*{([^}]*)}\s*from\s*['"]react-router-dom['"]\s*;?/g,
        (_full, specifierBlock: string) => {
            const specifiers = normalizeImportSpecifiers(specifierBlock);
            return specifiers
                ? `import { ${specifiers} } from 'react-router-dom';`
                : `import 'react-router-dom';`;
        }
    );

    output = output.replace(/<\s*BrowserRouter\b/g, '<HashRouter');
    output = output.replace(/<\/\s*BrowserRouter\s*>/g, '</HashRouter>');
    output = output.replace(/\.BrowserRouter\b/g, '.HashRouter');
    output = output.replace(/\b(?:jsx|jsxs|React\.createElement)\s*\(\s*BrowserRouter\b/g, (match) =>
        match.replace('BrowserRouter', 'HashRouter')
    );

    return output;
};

const sanitizeVirtualFilesForBundling = (files: Record<string, string>): Record<string, string> => {
    const next: Record<string, string> = {};
    Object.entries(files).forEach(([path, content]) => {
        if (!isCodeFilePath(path)) {
            next[path] = content;
            return;
        }
        const normalized = normalizeLikelyModuleSource(content);
        next[path] = rewriteBrowserRouterToHashRouter(stripExtraDefaultExports(normalized));
    });
    return next;
};

const parseBuildDiagnostic = (error: any): BuildDiagnostic | null => {
    const first = Array.isArray(error?.errors) ? error.errors[0] : null;
    if (!first) return null;
    const location = first.location || {};
    return {
        message: String(first.text || error?.message || 'Bundling failed'),
        file: typeof location.file === 'string' ? location.file : undefined,
        line: Number.isFinite(location.line) ? location.line : undefined,
        column: Number.isFinite(location.column) ? location.column : undefined,
        lineText: typeof location.lineText === 'string' ? location.lineText : undefined,
    };
};

const parseAllBuildDiagnostics = (error: any): BuildDiagnostic[] => {
    const diagnostics = Array.isArray(error?.errors) ? error.errors : [];
    const normalized = diagnostics
        .map((entry: any): BuildDiagnostic | null => {
            if (!entry) return null;
            const location = entry.location || {};
            return {
                message: String(entry.text || error?.message || 'Bundling failed'),
                file: typeof location.file === 'string' ? location.file : undefined,
                line: Number.isFinite(location.line) ? location.line : undefined,
                column: Number.isFinite(location.column) ? location.column : undefined,
                lineText: typeof location.lineText === 'string' ? location.lineText : undefined,
            };
        })
        .filter((entry: BuildDiagnostic | null): entry is BuildDiagnostic => Boolean(entry));
    if (normalized.length > 0) return normalized;
    const single = parseBuildDiagnostic(error);
    return single ? [single] : [];
};

const buildSuggestionForDiagnostic = (diagnostic: BuildDiagnostic): string => {
    const corpus = `${diagnostic.message}\n${diagnostic.lineText || ''}`.toLowerCase();
    if (/cannot find module|module not found|failed to resolve/.test(corpus)) {
        return 'Check import path and ensure the module/dependency exists.';
    }
    if (/no matching export|does not provide an export/.test(corpus)) {
        return 'Fix named/default import to match exported symbols.';
    }
    if (/expected|unexpected token|unterminated|string literal|jsx/.test(corpus)) {
        return 'Fix syntax near the reported line.';
    }
    if (/is not exported|has no exported member/.test(corpus)) {
        return 'Export the referenced symbol or update the import.';
    }
    if (/cannot find name|is not defined/.test(corpus)) {
        return 'Add the missing import or define the symbol.';
    }
    return 'Inspect the file/line and apply the minimal compile fix.';
};

export const toStructuredBuildError = (error: any): StructuredBuildErrorInfo => {
    const diagnostics = parseAllBuildDiagnostics(error);
    const errors = diagnostics.map((diagnostic) => ({
        file: normalizePath(String((diagnostic.file || 'src/App.tsx')).replace(/^virtual:/, '')) || 'src/App.tsx',
        line: Number.isFinite(diagnostic.line) ? Number(diagnostic.line) : 1,
        message: diagnostic.message,
        suggestion: buildSuggestionForDiagnostic(diagnostic),
    }));

    return {
        type: 'build-error',
        errors: errors.length > 0
            ? errors
            : [{
                file: 'src/App.tsx',
                line: 1,
                message: String(error?.message || 'Bundling failed'),
                suggestion: 'Inspect bundler output and fix syntax/import issues.',
            }],
    };
};

const formatBuildError = (error: any): string => {
    const diagnostic = parseBuildDiagnostic(error);
    if (!diagnostic) return String(error?.message || 'Error occurred during bundling');
    const location = diagnostic.file
        ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}${diagnostic.column !== undefined ? `:${diagnostic.column + 1}` : ''}`
        : '';
    const lineText = diagnostic.lineText ? `\n${diagnostic.lineText}` : '';
    return `${location ? `${location}: ` : ''}${diagnostic.message}${lineText}`.trim();
};

const shouldAttemptColonRecovery = (error: any): boolean => {
    const diagnostic = parseBuildDiagnostic(error);
    const corpus = `${diagnostic?.message || ''}\n${diagnostic?.lineText || ''}\n${error?.message || ''}`;
    return /Expected\s+["']?;["']?\s+but\s+found\s+":"/i.test(corpus);
};

const shouldAttemptDefaultExportRecovery = (error: any): boolean => {
    const diagnostic = parseBuildDiagnostic(error);
    const corpus = `${diagnostic?.message || ''}\n${diagnostic?.lineText || ''}\n${error?.message || ''}`;
    return /multiple\s+default\s+exports/i.test(corpus)
        || /multiple exports with the same name ["']default["']/i.test(corpus)
        || /cannot have multiple default exports/i.test(corpus);
};

const fixLikelyColonSyntaxIssue = (input: string): string => {
    let fixed = input;
    // Common model typo: import lines ending with ":" instead of ";"
    fixed = fixed.replace(/(from\s+['"][^'"]+['"])\s*:/g, '$1;');
    fixed = fixed.replace(/(^\s*import[^\n;]+)\s*:\s*$/gm, '$1;');

    const extracted = extractCodeFromStructuredPayload(fixed);
    if (extracted && extracted !== fixed) {
        fixed = extracted;
    }

    return fixed;
};

const isValidIdentifier = (value: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const parseNamedExports = (source: string): Set<string> => {
    const exports = new Set<string>();

    for (const match of source.matchAll(/\bexport\s+(?:const|function|class|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        if (match[1]) exports.add(match[1]);
    }

    for (const match of source.matchAll(/\bexport\s*{([^}]*)}/g)) {
        const specifiers = String(match[1] || '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);

        specifiers.forEach((specifier) => {
            const aliasMatch = specifier.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
            if (aliasMatch?.[2]) {
                exports.add(aliasMatch[2]);
                return;
            }
            if (isValidIdentifier(specifier)) {
                exports.add(specifier);
            }
        });
    }

    return exports;
};

const parseMissingExportIssues = (error: any): MissingExportIssue[] => {
    const issues: MissingExportIssue[] = [];
    const seen = new Set<string>();
    const diagnostics = Array.isArray(error?.errors) ? error.errors : [];

    diagnostics.forEach((entry: any) => {
        const text = String(entry?.text || '');
        const match = text.match(/No matching export in "([^"]+)" for import "([^"]+)"/i);
        if (!match) return;

        const targetPath = normalizePath(String(match[1] || '').replace(/^virtual:/, ''));
        const importName = String(match[2] || '').trim();
        if (!targetPath || !importName || !isValidIdentifier(importName)) return;

        const key = `${targetPath}::${importName}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({ targetPath, importName });
    });

    return issues;
};

const applyMissingExportRecovery = (
    error: any,
    virtualFilesInput: Record<string, string>
): boolean => {
    const issues = parseMissingExportIssues(error);
    if (issues.length === 0) return false;

    let changed = false;

    issues.forEach((issue) => {
        const resolvedPath = resolveFromVirtualFiles(issue.targetPath, virtualFilesInput) || issue.targetPath;
        const source = virtualFilesInput[resolvedPath];
        if (typeof source !== 'string' || source.trim().length === 0) return;

        const hasDefaultExport = /\bexport\s+default\b/.test(source);
        if (!hasDefaultExport) return;

        const namedExports = parseNamedExports(source);
        if (namedExports.has(issue.importName)) return;

        const defaultAliasPattern = new RegExp(`\\bdefault\\s+as\\s+${issue.importName}\\b`);
        if (defaultAliasPattern.test(source)) return;

        const suffix = source.endsWith('\n') ? '' : '\n';
        virtualFilesInput[resolvedPath] = `${source}${suffix}export { default as ${issue.importName} };\n`;
        changed = true;
    });

    return changed;
};

const applyColonRecovery = (
    error: any,
    virtualFilesInput: Record<string, string>,
    normalizedEntry: string
): boolean => {
    if (!shouldAttemptColonRecovery(error)) return false;

    const diagnostic = parseBuildDiagnostic(error);
    const diagnosticFile = normalizePath((diagnostic?.file || '').replace(/^virtual:/, ''));
    const targetPath = resolveFromVirtualFiles(diagnosticFile, virtualFilesInput)
        || resolveFromVirtualFiles(normalizedEntry, virtualFilesInput)
        || normalizedEntry;
    const before = virtualFilesInput[targetPath];
    if (typeof before !== 'string') return false;

    const recovered = fixLikelyColonSyntaxIssue(before);
    if (!recovered || recovered === before) return false;

    virtualFilesInput[targetPath] = /\.[tj]sx$/i.test(targetPath)
        ? injectJsxSourceIds(recovered, targetPath)
        : recovered;
    return true;
};

const applyDuplicateDefaultExportRecovery = (
    error: any,
    virtualFilesInput: Record<string, string>,
    normalizedEntry: string
): boolean => {
    if (!shouldAttemptDefaultExportRecovery(error)) return false;

    const diagnostic = parseBuildDiagnostic(error);
    const diagnosticFile = normalizePath((diagnostic?.file || '').replace(/^virtual:/, ''));

    const candidates = new Set<string>();
    const resolvedDiagnostic = resolveFromVirtualFiles(diagnosticFile, virtualFilesInput);
    if (resolvedDiagnostic) candidates.add(resolvedDiagnostic);
    const resolvedEntry = resolveFromVirtualFiles(normalizedEntry, virtualFilesInput);
    if (resolvedEntry) candidates.add(resolvedEntry);
    if (normalizedEntry) candidates.add(normalizedEntry);
    Object.keys(virtualFilesInput)
        .filter((path) => isCodeFilePath(path))
        .forEach((path) => candidates.add(path));

    let changed = false;
    for (const path of candidates) {
        const before = virtualFilesInput[path];
        if (typeof before !== 'string') continue;
        const normalized = normalizeLikelyModuleSource(before);
        const recovered = stripExtraDefaultExports(normalized);
        if (recovered !== before) {
            virtualFilesInput[path] = /\.[tj]sx$/i.test(path)
                ? injectJsxSourceIds(recovered, path)
                : recovered;
            changed = true;
        }
    }

    if (changed) {
        console.warn('[Bundler] Recovered duplicate default export(s) in virtual files.');
    }
    return changed;
};

const resolveAliasSpecifier = (specifier: string): string | null => {
    if (specifier.startsWith('@/')) return normalizePath(`src/${specifier.slice(2)}`);
    if (specifier.startsWith('@components/')) return normalizePath(`src/components/${specifier.slice('@components/'.length)}`);
    if (specifier.startsWith('@lib/')) return normalizePath(`src/lib/${specifier.slice('@lib/'.length)}`);
    if (specifier.startsWith('@hooks/')) return normalizePath(`src/hooks/${specifier.slice('@hooks/'.length)}`);
    if (specifier.startsWith('@config/')) return normalizePath(`src/config/${specifier.slice('@config/'.length)}`);
    return null;
};

const ensurePreviewEntrypoint = (
    virtualFilesInput: Record<string, string>,
    sourceEntryPath: string,
    sourceCode: string
): { entryPath: string; sourcePath: string; synthesized: boolean } => {
    const explicitSourcePath = normalizePath(sourceEntryPath || '');
    const hasExplicitSourcePath = explicitSourcePath.length > 0;
    const resolvedSourcePath =
        resolveFromVirtualFiles(explicitSourcePath || 'src/App.tsx', virtualFilesInput) ||
        normalizePath(explicitSourcePath || 'src/App.tsx');

    if (!virtualFilesInput[resolvedSourcePath]) {
        virtualFilesInput[resolvedSourcePath] = sourceCode;
    }

    // Explicit preview entry paths (from CodePreview) must win over implicit candidates like src/main.tsx.
    if (hasExplicitSourcePath) {
        return {
            entryPath: resolvedSourcePath,
            sourcePath: resolvedSourcePath,
            synthesized: false,
        };
    }

    const existingEntry = PREVIEW_ENTRY_CANDIDATES
        .map((candidate) => resolveFromVirtualFiles(candidate, virtualFilesInput))
        .find((candidate): candidate is string => Boolean(candidate));
    if (existingEntry) {
        return {
            entryPath: existingEntry,
            sourcePath: resolvedSourcePath,
            synthesized: false,
        };
    }

    const resolvedAppPath =
        resolveFromVirtualFiles('src/App.tsx', virtualFilesInput) ||
        resolveFromVirtualFiles('App.tsx', virtualFilesInput) ||
        resolvedSourcePath;

    if (!virtualFilesInput['src/App.tsx']) {
        if (resolvedAppPath === resolvedSourcePath) {
            virtualFilesInput['src/App.tsx'] = sourceCode;
        } else {
            virtualFilesInput['src/App.tsx'] = `import AppModule from './${resolvedAppPath.replace(/^src\//, '').replace(/\.[^.]+$/, '')}';\nexport default AppModule;\n`;
        }
    }

    if (!virtualFilesInput['src/main.tsx']) {
        virtualFilesInput['src/main.tsx'] = [
            `import React from 'react';`,
            `import * as AppModule from './App';`,
            `const AppComponent = (AppModule as any).default || (AppModule as any).App || (() => null);`,
            `export default function MainEntry(){`,
            `  return <AppComponent />;`,
            `}`,
            '',
        ].join('\n');
    }

    return {
        entryPath: 'src/main.tsx',
        sourcePath: resolvedSourcePath,
        synthesized: true,
    };
};

export const initializeBundler = async () => {
    if (initializationPromise) return initializationPromise;

    initializationPromise = esbuild.initialize({
        worker: true,
        wasmURL: 'https://unpkg.com/esbuild-wasm@0.27.3/esbuild.wasm',
    });

    return initializationPromise;
};

export const bundleCode = async (rawCode: string, options: BundleOptions = {}): Promise<string> => {
    await initializeBundler();

    // Clean code formatting if the LLM provided markdown
    const code = rewriteBrowserRouterToHashRouter(stripExtraDefaultExports(normalizeLikelyModuleSource(rawCode)));

    try {
        let virtualFilesInput = options.files ? normalizeFiles(options.files) : {};
        virtualFilesInput = sanitizeVirtualFilesForBundling(virtualFilesInput);
        virtualFilesInput = injectSourceIdsIntoVirtualFiles(virtualFilesInput);
        const hasVirtualFiles = Object.keys(virtualFilesInput).length > 0;

        if (hasVirtualFiles) {
            const sourceEntryPath = normalizePath((options.entryPath || 'src/App.tsx').replace(/^\.?\//, ''));
            const entryContentWithIds = /\.[tj]sx$/i.test(sourceEntryPath)
                ? injectJsxSourceIds(code, sourceEntryPath)
                : code;
            const ensured = ensurePreviewEntrypoint(virtualFilesInput, sourceEntryPath, entryContentWithIds);
            const normalizedEntry = ensured.entryPath;

            if (!normalizedEntry) {
                throw new Error('No entry file found for preview bundling.');
            }

            // Ensure latest edited source stays in virtual FS.
            virtualFilesInput[ensured.sourcePath] = /\.[tj]sx$/i.test(ensured.sourcePath)
                ? injectJsxSourceIds(code, ensured.sourcePath)
                : code;

            const virtualFilesList = Object.keys(virtualFilesInput).sort();
            console.info('[Bundler] bundleCode() start', {
                requestedEntryPath: sourceEntryPath,
                resolvedSourcePath: ensured.sourcePath,
                entryPath: normalizedEntry,
                synthesizedEntry: ensured.synthesized,
                virtualFileCount: virtualFilesList.length,
                virtualFiles: virtualFilesList,
            });

            const virtualFilesPlugin: esbuild.Plugin = {
                name: 'virtual-files',
                setup(build) {
                    build.onResolve({ filter: /.*/ }, (args) => {
                        const specifier = args.path;

                        // Keep external dependencies for importmap loading in iframe
                        if (
                            specifier.startsWith('http://')
                            || specifier.startsWith('https://')
                            || specifier.startsWith('data:')
                            || specifier.startsWith('blob:')
                        ) {
                            return { path: specifier, external: true };
                        }

                        const aliasCandidate = resolveAliasSpecifier(specifier);
                        if (aliasCandidate) {
                            const aliasedResolved = resolveFromVirtualFiles(aliasCandidate, virtualFilesInput);
                            if (!aliasedResolved) {
                                if (/^@\/components\/ui\//.test(specifier)) {
                                    const stubPath = normalizePath(`__virtual_shadcn__/${specifier.replace(/^@\//, '').replace(/[^\w/-]/g, '')}.tsx`);
                                    return { path: stubPath, namespace: 'shadcn-stub' };
                                }
                                const missingStubPath = normalizePath(`__virtual_missing__/${specifier.replace(/[^\w/@.-]/g, '_')}.tsx`);
                                virtualFilesInput[missingStubPath] = createSyntheticModule(missingStubPath);
                                return { path: missingStubPath, namespace: 'virtual' };
                            }
                            return { path: aliasedResolved, namespace: 'virtual' };
                        }

                        const srcResolved = resolveFromVirtualFiles(specifier, virtualFilesInput);
                        if (srcResolved) {
                            return { path: srcResolved, namespace: 'virtual' };
                        }

                        if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
                            return { path: specifier, external: true };
                        }

                        const importerDir = dirname(args.importer || normalizedEntry);
                        const candidate = specifier.startsWith('/')
                            ? normalizePath(specifier.slice(1))
                            : joinPath(importerDir, specifier);
                        const resolved = resolveFromVirtualFiles(candidate, virtualFilesInput);

                        if (!resolved) {
                            const syntheticPath = hasKnownExtension(candidate)
                                ? candidate
                                : `${candidate}.tsx`;
                            const normalizedSynthetic = normalizePath(syntheticPath);
                            virtualFilesInput[normalizedSynthetic] = createSyntheticModule(normalizedSynthetic);
                            return { path: normalizedSynthetic, namespace: 'virtual' };
                        }

                        return { path: resolved, namespace: 'virtual' };
                    });

                    build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
                        const contents = virtualFilesInput[args.path];
                        if (typeof contents !== 'string') {
                            return { errors: [{ text: `Virtual file not found: ${args.path}` }] };
                        }
                        return {
                            contents,
                            loader: inferLoader(args.path),
                        };
                    });

                    build.onLoad({ filter: /.*/, namespace: 'shadcn-stub' }, (args) => {
                        const importSpecifier = args.path.includes('__virtual_shadcn__/')
                            ? `@/${args.path.split('__virtual_shadcn__/')[1].replace(/\.tsx$/, '')}`
                            : '@/components/ui/component';
                        const contents = buildShadcnUiStubModule(importSpecifier);
                        console.warn('[Bundler] Using synthetic shadcn/ui passthrough module for missing import:', importSpecifier);
                        return {
                            contents,
                            loader: 'tsx',
                        };
                    });
                },
            };

            const buildVirtualPreview = () => esbuild.build({
                entryPoints: [normalizedEntry],
                bundle: true,
                write: false,
                format: 'esm',
                platform: 'browser',
                target: 'es2020',
                jsx: 'automatic',
                jsxImportSource: 'react',
                plugins: [virtualFilesPlugin],
                outdir: 'out',
                logLevel: 'silent',
            });

            let result: esbuild.BuildResult | null = null;
            let lastBuildError: any = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    result = await buildVirtualPreview();
                    break;
                } catch (buildError: any) {
                    lastBuildError = buildError;
                    console.error('[Bundler] esbuild build attempt failed', {
                        attempt: attempt + 1,
                        entryPath: normalizedEntry,
                        warnings: buildError?.warnings,
                        errors: buildError?.errors,
                    });
                    const colonRecovered = applyColonRecovery(buildError, virtualFilesInput, normalizedEntry);
                    if (colonRecovered) continue;

                    const exportRecovered = applyMissingExportRecovery(buildError, virtualFilesInput);
                    if (exportRecovered) continue;

                    const duplicateDefaultRecovered = applyDuplicateDefaultExportRecovery(buildError, virtualFilesInput, normalizedEntry);
                    if (duplicateDefaultRecovered) continue;

                    throw buildError;
                }
            }

            if (!result) {
                throw lastBuildError || new Error('Bundler did not produce build result.');
            }

            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                console.warn('[Bundler] esbuild warnings', result.warnings);
            }

            const jsOutput = result.outputFiles?.find((file) => file.path.endsWith('.js')) || result.outputFiles?.[0];
            if (!jsOutput) {
                throw new Error('Bundler did not produce JavaScript output.');
            }

            return jsOutput.text;
        }

        const result = await esbuild.transform(code, {
            loader: 'tsx',
            target: 'es2020',
            jsx: 'automatic',
            jsxImportSource: 'react',
            minify: false,
        });

        if (Array.isArray(result.warnings) && result.warnings.length > 0) {
            console.warn('[Bundler] esbuild transform warnings', result.warnings);
        }
        console.info('[Bundler] bundleCode() transform mode', {
            entryPath: options.entryPath || 'inline',
            virtualFileCount: 0,
        });

        return result.code;
    } catch (err: any) {
        console.error('[Bundler] Bundling error', {
            message: err?.message,
            warnings: err?.warnings,
            errors: err?.errors,
        });
        const structured = toStructuredBuildError(err);
        throw new BundlerBuildError(formatBuildError(err), structured.errors);
    }
};
