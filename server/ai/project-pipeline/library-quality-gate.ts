/**
 * External Library Quality Gate (Enterprise Feature 4)
 * 
 * Enforces allowlisting for verified external libraries and blocks
 * scaffolds/placeholders/low-quality code patterns.
 */
import { isAllowlistedDependency } from '../runtime/dependency-registry.js';

export interface LibraryQualityResult {
    approved: boolean;
    blockedLibraries: BlockedLibrary[];
    scaffoldWarnings: ScaffoldWarning[];
}

export interface BlockedLibrary {
    name: string;
    reason: 'not_allowlisted' | 'known_vulnerable' | 'deprecated' | 'too_large';
    suggestion?: string;
}

export interface ScaffoldWarning {
    type: 'placeholder_text' | 'todo_comment' | 'lorem_ipsum' | 'empty_handler' | 'console_log_only';
    location: string;
    message: string;
}

// Known deprecated or problematic libraries
const BLOCKED_LIBRARIES = new Map<string, { reason: string; suggestion: string }>([
    ['moment', { reason: 'deprecated', suggestion: 'Use date-fns or dayjs instead' }],
    ['jquery', { reason: 'unnecessary in React projects', suggestion: 'Use native DOM APIs or React refs' }],
    ['request', { reason: 'deprecated', suggestion: 'Use axios or native fetch' }],
    ['node-sass', { reason: 'deprecated', suggestion: 'Use sass (Dart Sass)' }],
]);

// Scaffold/placeholder patterns to detect
const SCAFFOLD_PATTERNS = [
    // Strict allowlist of placeholder strings.
    // "Coming soon" is intentionally NOT treated as placeholder content.
    { pattern: /\bYour title here\b/gi, type: 'placeholder_text' as const },
    { pattern: /\bLorem ipsum\b/gi, type: 'lorem_ipsum' as const },
    { pattern: /\bPlaceholder text\b/gi, type: 'placeholder_text' as const },
    { pattern: /\bTODO:/g, type: 'todo_comment' as const },
    { pattern: /\bInsert text here\b/gi, type: 'placeholder_text' as const },
    { pattern: /\bYour subtitle here\b/gi, type: 'placeholder_text' as const },
];

/**
 * Extract library imports from code.
 */
function extractLibraries(code: string): string[] {
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"./][^'"]*)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g;
    const libs = new Set<string>();

    let match;
    while ((match = importRegex.exec(code)) !== null) {
        // Extract the package name (handle scoped packages correctly)
        const full = match[1];
        if (full.startsWith('@')) {
            const parts = full.split('/');
            libs.add(parts.slice(0, 2).join('/'));
        } else {
            libs.add(full.split('/')[0]);
        }
    }
    while ((match = requireRegex.exec(code)) !== null) {
        const full = match[1];
        if (full.startsWith('@')) {
            const parts = full.split('/');
            libs.add(parts.slice(0, 2).join('/'));
        } else {
            libs.add(full.split('/')[0]);
        }
    }

    return [...libs];
}

/**
 * Evaluate library quality and scaffold patterns in generated code.
 */
export function evaluateLibraryQuality(
    code: string,
    strictMode: boolean = false
): LibraryQualityResult {
    const blockedLibraries: BlockedLibrary[] = [];
    const scaffoldWarnings: ScaffoldWarning[] = [];

    // Check libraries
    const libraries = extractLibraries(code);
    for (const lib of libraries) {
        const blocked = BLOCKED_LIBRARIES.get(lib);
        if (blocked) {
            blockedLibraries.push({
                name: lib,
                reason: 'deprecated',
                suggestion: blocked.suggestion,
            });
            continue;
        }

        if (strictMode && !isAllowlistedDependency(lib)) {
            blockedLibraries.push({
                name: lib,
                reason: 'not_allowlisted',
                suggestion: `Library "${lib}" is not in the approved list. Add it to the allowlist or use an alternative.`,
            });
        }
    }

    // Check scaffold patterns
    const lines = code.split('\n');
    for (const { pattern, type } of SCAFFOLD_PATTERNS) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(code)) !== null) {
            const lineNum = code.substring(0, match.index).split('\n').length;
            scaffoldWarnings.push({
                type,
                location: `line ${lineNum}`,
                message: `Found ${type.replace(/_/g, ' ')}: "${match[0].trim().substring(0, 60)}"`,
            });
        }
    }

    return {
        approved: blockedLibraries.length === 0 && (!strictMode || scaffoldWarnings.length === 0),
        blockedLibraries,
        scaffoldWarnings,
    };
}

/**
 * Get a summary of quality issues for logging.
 */
export function getQualitySummary(result: LibraryQualityResult): string {
    const parts: string[] = [];
    if (result.blockedLibraries.length > 0) {
        parts.push(`${result.blockedLibraries.length} blocked libraries: ${result.blockedLibraries.map((l) => l.name).join(', ')}`);
    }
    if (result.scaffoldWarnings.length > 0) {
        parts.push(`${result.scaffoldWarnings.length} scaffold warnings`);
    }
    return parts.length > 0 ? parts.join('; ') : 'No quality issues';
}
