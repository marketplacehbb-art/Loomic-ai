/**
 * Hard Style Policy Gate (Enterprise Feature 3)
 * 
 * Enforces that style-related prompts produce concrete CSS token/class diffs
 * rather than vague or destructive style changes. Implements a retry loop
 * for non-compliant edits.
 */

export interface StylePolicyResult {
    compliant: boolean;
    violations: StyleViolation[];
    suggestion?: string;
}

export interface StyleViolation {
    type: 'missing_class_diff' | 'inline_style_only' | 'hardcoded_color' | 'no_style_change' | 'destructive_reset';
    message: string;
    severity: 'error' | 'warning';
}

export interface StyleDiff {
    addedClasses: string[];
    removedClasses: string[];
    addedInlineStyles: string[];
    removedInlineStyles: string[];
    cssRuleChanges: number;
}

// Patterns that indicate style-related prompts
const STYLE_PROMPT_PATTERNS = [
    /\b(change|update|modify|set|make|adjust)\s+(the\s+)?(color|background|font|size|margin|padding|border|shadow|opacity|radius|spacing)/i,
    /\b(style|css|design|theme|look|appearance)\b/i,
    /\b(dark\s*mode|light\s*mode|theme)\b/i,
    /\b(bigger|smaller|wider|narrower|taller|shorter|bold|italic|underline)\b/i,
    /\b(center|align|left|right|justify)\b/i,
    /\b(gradient|rounded|flat|outline)\b/i,
];

// Forbidden patterns in style outputs
const FORBIDDEN_STYLE_PATTERNS = [
    { pattern: /style=\{\{[^}]*color:\s*['"]#[0-9a-f]{3,8}['"]/gi, type: 'hardcoded_color' as const },
    { pattern: /style=\{\{[^}]*(?:margin|padding|width|height):\s*\d+(?:px|rem|em)/gi, type: 'inline_style_only' as const },
    { pattern: /\*\s*\{[^}]*(?:margin|padding)\s*:\s*0/gi, type: 'destructive_reset' as const },
];

/**
 * Detect whether a prompt is style-related.
 */
export function isStylePrompt(prompt: string): boolean {
    return STYLE_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * Extract a diff of CSS classes between old and new code.
 */
export function extractStyleDiff(oldCode: string, newCode: string): StyleDiff {
    const extractClasses = (code: string): Set<string> => {
        const classes = new Set<string>();
        const classAttrMatches = code.matchAll(/className\s*=\s*(?:"([^"]+)"|'([^']+)'|\{([\s\S]*?)\})/g);

        const addTokens = (value: string) => {
            value
                .split(/\s+/)
                .map((token) => token.trim())
                .filter(Boolean)
                .forEach((token) => classes.add(token));
        };

        for (const match of classAttrMatches) {
            const directLiteral = match[1] || match[2];
            if (directLiteral) {
                addTokens(directLiteral);
                continue;
            }

            const expression = match[3] || '';
            // Collect quoted class chunks from clsx/cva/template or ternary expressions.
            const literalMatches = expression.matchAll(/["'`]([^"'`]+)["'`]/g);
            for (const literal of literalMatches) {
                if (literal[1]) addTokens(literal[1]);
            }
        }
        return classes;
    };

    const extractInlineStyles = (code: string): Set<string> => {
        const styles = new Set<string>();
        const styleMatches = code.matchAll(/style=\{\{([^}]+)\}\}/g);
        for (const match of styleMatches) {
            styles.add(match[1].trim());
        }
        return styles;
    };

    const oldClasses = extractClasses(oldCode);
    const newClasses = extractClasses(newCode);
    const oldStyles = extractInlineStyles(oldCode);
    const newStyles = extractInlineStyles(newCode);

    const addedClasses = [...newClasses].filter((c) => !oldClasses.has(c));
    const removedClasses = [...oldClasses].filter((c) => !newClasses.has(c));
    const addedInlineStyles = [...newStyles].filter((s) => !oldStyles.has(s));
    const removedInlineStyles = [...oldStyles].filter((s) => !newStyles.has(s));

    // Simple CSS rule change detection
    const countCssRules = (code: string): number => {
        const matches = code.match(/[.#][a-zA-Z][\w-]*\s*\{/g);
        return matches ? matches.length : 0;
    };
    const cssRuleChanges = Math.abs(countCssRules(newCode) - countCssRules(oldCode));

    return {
        addedClasses,
        removedClasses,
        addedInlineStyles,
        removedInlineStyles,
        cssRuleChanges,
    };
}

/**
 * Evaluate style policy compliance for a code change.
 */
export function evaluateStylePolicy(
    prompt: string,
    oldCode: string,
    newCode: string
): StylePolicyResult {
    if (!isStylePrompt(prompt)) {
        return { compliant: true, violations: [] };
    }

    const violations: StyleViolation[] = [];
    const diff = extractStyleDiff(oldCode, newCode);

    // Check for forbidden patterns
    for (const { pattern, type } of FORBIDDEN_STYLE_PATTERNS) {
        const matches = newCode.match(pattern);
        if (matches && matches.length > 2) {
            violations.push({
                type,
                message: `Found ${matches.length} instances of ${type.replace(/_/g, ' ')}`,
                severity: 'warning',
            });
        }
    }

    // Check that there are actual style changes
    const hasClassDiff = diff.addedClasses.length > 0 || diff.removedClasses.length > 0;
    const hasStyleDiff = diff.addedInlineStyles.length > 0 || diff.removedInlineStyles.length > 0;
    const hasCssChanges = diff.cssRuleChanges > 0;

    if (!hasClassDiff && !hasStyleDiff && !hasCssChanges) {
        violations.push({
            type: 'no_style_change',
            message: 'Style prompt produced no detectable style changes',
            severity: 'error',
        });
    }

    // Prefer class-based over inline style changes
    if (hasStyleDiff && !hasClassDiff && !hasCssChanges && diff.addedInlineStyles.length > 3) {
        violations.push({
            type: 'inline_style_only',
            message: 'Style changes use only inline styles; prefer CSS classes or utility classes',
            severity: 'warning',
        });
    }

    const hasErrors = violations.some((v) => v.severity === 'error');
    let suggestion: string | undefined;
    if (hasErrors) {
        suggestion = 'The LLM output did not produce meaningful style changes. Consider retrying with a more specific prompt that requests concrete CSS class or token modifications.';
    }

    return {
        compliant: !hasErrors,
        violations,
        suggestion,
    };
}

/**
 * Build a retry prompt for style policy failures.
 */
export function buildStyleRetryPrompt(
    originalPrompt: string,
    violations: StyleViolation[]
): string {
    const violationList = violations
        .map((v) => `- ${v.message}`)
        .join('\n');

    return `The previous attempt to apply style changes had the following issues:
${violationList}

Please retry the following request, ensuring you produce concrete CSS class additions/removals or CSS rule changes (not just inline styles):

"${originalPrompt}"

Requirements:
1. Use Tailwind utility classes or CSS classes rather than inline styles
2. Ensure the style changes are visible and meaningful
3. Do not reset global styles (e.g., * { margin: 0 })
4. Use CSS custom properties or design tokens for colors when possible`;
}
