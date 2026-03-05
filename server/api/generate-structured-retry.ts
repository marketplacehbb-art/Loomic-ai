import { llmManager } from './llm/manager.js';
import { type SupportedProvider } from './generate-validation.js';
import { type TokenBudgetDecision } from './generate-token-budget.js';
import {
    isRuntimeUiSourcePath,
    normalizeGeneratedPath,
} from './generate-path-utils.js';
import {
    APP_DEFAULT_EXPORT_FALLBACK,
    ensureAppDefaultExportInFiles,
    looksLikeHtmlDocument,
} from './generate-shared.js';
import { withTimeout, TIMEOUT_MS } from './generate-edit-mode-utils.js';
import {
    type ParsedLLMOutput,
    sanitizeGeneratedModuleCode,
    ensureLastResortRenderableOutput,
} from '../ai/project-pipeline/llm-response-parser.js';

export function decodeEscapedJsonString(value: string): string {
    if (!value) return '';
    try {
        return JSON.parse(`"${value}"`);
    } catch {
        return value
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }
}

export function looksLikeRuntimeTsxModule(code: string): boolean {
    if (!code || typeof code !== 'string') return false;
    const trimmed = code.trim();
    if (!trimmed || looksLikeHtmlDocument(trimmed)) return false;
    return /export\s+default|function\s+[A-Z][A-Za-z0-9_]*\s*\(|const\s+[A-Z][A-Za-z0-9_]*\s*=\s*\(|import\s+.*from|useState|useEffect|return\s*\(/m.test(trimmed);
}

export function extractRuntimeModuleFromMalformedStructured(rawOutput: string): string | null {
    if (!rawOutput || typeof rawOutput !== 'string') return null;

    const candidates: string[] = [];
    const contentRegex = /"content"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let contentMatch: RegExpExecArray | null;
    while ((contentMatch = contentRegex.exec(rawOutput)) !== null) {
        const decoded = decodeEscapedJsonString(contentMatch[1] || '').trim();
        if (decoded) candidates.push(decoded);
    }

    const fencedRegex = /```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/gi;
    let fencedMatch: RegExpExecArray | null;
    while ((fencedMatch = fencedRegex.exec(rawOutput)) !== null) {
        const block = (fencedMatch[1] || '').trim();
        if (block) candidates.push(block);
    }

    if (looksLikeRuntimeTsxModule(rawOutput)) {
        candidates.push(rawOutput.trim());
    }

    const runtimeCandidates = candidates
        .map((candidate) => sanitizeGeneratedModuleCode(candidate))
        .filter((candidate) => looksLikeRuntimeTsxModule(candidate));

    if (runtimeCandidates.length === 0) return null;

    runtimeCandidates.sort((a, b) => b.length - a.length);
    return runtimeCandidates[0];
}

export function createRuntimePlaceholder(path: string): string {
    const normalized = normalizeGeneratedPath(path || '');
    if (!normalized) return '';
    if (normalized.endsWith('.tsx')) {
        const baseName = normalized.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || 'Component';
        const componentName = baseName.replace(/[^a-zA-Z0-9_]/g, '') || 'Component';
        return `export default function ${componentName}() {\n  return <div />;\n}\n`;
    }
    if (normalized.endsWith('.ts') || normalized.endsWith('.js') || normalized.endsWith('.jsx')) {
        return `export {};\n`;
    }
    if (normalized.endsWith('.css')) {
        return `/* ${normalized} */\n`;
    }
    return '';
}

export function coerceToStructuredFilesFallback(input: {
    parsedOutput: ParsedLLMOutput;
    generationMode: 'new' | 'edit';
    fallbackPath: string;
    existingFiles: Record<string, string>;
    rawOutput?: string;
    allowSingleFileWrap?: boolean;
    preferredPaths?: (string | undefined)[];
}): { parsedOutput: ParsedLLMOutput; reason: string } | null {
    const allowSingleFileWrap = input.allowSingleFileWrap !== false;
    const preferredPaths = Array.isArray(input.preferredPaths)
        ? input.preferredPaths.filter((p): p is string => Boolean(p)).map((path) => normalizeGeneratedPath(path)).filter(Boolean)
        : [];
    const parsedOutput = input.parsedOutput;
    if (parsedOutput.parseError && parsedOutput.parseError !== 'MALFORMED_STRUCTURED_JSON') return null;
    if (parsedOutput.detectedFormat === 'json' || parsedOutput.detectedFormat === 'operations') {
        return null;
    }

    if (parsedOutput.parseError === 'MALFORMED_STRUCTURED_JSON') {
        const recoveredRuntime = extractRuntimeModuleFromMalformedStructured(input.rawOutput || '');
        if (recoveredRuntime) {
            let targetPath = normalizeGeneratedPath(input.fallbackPath || 'src/App.tsx');
            if (!isRuntimeUiSourcePath(targetPath)) {
                const preferredExistingRuntime = Object.keys(input.existingFiles || {})
                    .map((path) => normalizeGeneratedPath(path))
                    .find((path) => isRuntimeUiSourcePath(path));
                targetPath = preferredExistingRuntime || 'src/App.tsx';
            }

            const extractedFiles = [{ path: targetPath, content: recoveredRuntime }];
            if (!allowSingleFileWrap && preferredPaths.length > 0) {
                for (const candidatePath of preferredPaths.slice(0, 12)) {
                    if (candidatePath === targetPath) continue;
                    extractedFiles.push({
                        path: candidatePath,
                        content: createRuntimePlaceholder(candidatePath),
                    });
                }
            }
            if (!allowSingleFileWrap) {
                const ensuredApp = ensureAppDefaultExportInFiles(extractedFiles);
                const scaffoldMap = new Map<string, string>();
                ensuredApp.files.forEach((file) => {
                    const normalizedPath = normalizeGeneratedPath(file.path || '');
                    if (!normalizedPath) return;
                    scaffoldMap.set(normalizedPath, file.content);
                });
                if (!ensuredApp.hasAppFile) {
                    scaffoldMap.set('src/App.tsx', APP_DEFAULT_EXPORT_FALLBACK);
                }
                extractedFiles.length = 0;
                scaffoldMap.forEach((content, path) => {
                    extractedFiles.push({ path, content });
                });
            }

            return {
                reason: allowSingleFileWrap
                    ? 'rescued_malformed_structured_to_raw_module'
                    : 'rescued_malformed_structured_to_scaffolded_files',
                parsedOutput: {
                    primaryCode: recoveredRuntime,
                    extractedFiles,
                    detectedFormat: 'json',
                },
            };
        }
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
    if (!allowSingleFileWrap && input.generationMode === 'new') {
        const scaffoldPaths = preferredPaths.length > 0
            ? preferredPaths.slice(0, 12)
            : ['src/App.tsx', normalizeGeneratedPath(input.fallbackPath || 'src/App.tsx')];
        const normalizedPrimaryPath = normalizeGeneratedPath(input.fallbackPath || 'src/App.tsx') || 'src/App.tsx';
        const extractedFiles = Array.from(new Set(scaffoldPaths)).map((path) => ({
            path,
            content: path === normalizedPrimaryPath ? primaryCode : createRuntimePlaceholder(path),
        }));
        const ensuredApp = ensureAppDefaultExportInFiles(extractedFiles);
        const normalizedScaffoldMap = new Map<string, string>();
        ensuredApp.files.forEach((file) => {
            const normalizedPath = normalizeGeneratedPath(file.path || '');
            if (!normalizedPath) return;
            normalizedScaffoldMap.set(normalizedPath, file.content);
        });
        if (!ensuredApp.hasAppFile) {
            normalizedScaffoldMap.set('src/App.tsx', APP_DEFAULT_EXPORT_FALLBACK);
        }
        const normalizedExtractedFiles = Array.from(normalizedScaffoldMap.entries()).map(([path, content]) => ({
            path,
            content,
        }));
        return {
            reason: 'wrapped_raw_module_with_scaffold_files',
            parsedOutput: {
                ...parsedOutput,
                detectedFormat: 'json',
                extractedFiles: normalizedExtractedFiles,
                primaryCode,
            },
        };
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

export interface StructuredRetryInput {
    rawCode: string;
    parsedOutput: ParsedLLMOutput;
    executionProviderHint: SupportedProvider;
    effectiveGenerationMode: 'new' | 'edit';
    tokenBudget: TokenBudgetDecision;
    scopedContextFiles: Record<string, string>;
    image?: string;
    knowledgeBase?: Array<{ path: string, content: string }>;
    requiresEditStructuredOutput: boolean;
    generationSystemPrompt: string;
    generationPrompt: string;
    enforceStructuredMultiFile: boolean;
    structuredPreferredPaths: (string | undefined)[];
    requestRateLimit?: any;
    structuredOutputFormats: Set<string>;
    parseOutputWithLogsFunc: (raw: string, path: string, existing: Record<string, string>) => ParsedLLMOutput;
}

export interface StructuredRetryResult {
    rawCode: string;
    parsedOutput: ParsedLLMOutput;
    requestRateLimit?: any;
    success: boolean;
}

export interface TsxRescueInput {
    executionProviderHint: SupportedProvider;
    effectiveGenerationMode: 'new' | 'edit';
    tokenBudget: TokenBudgetDecision;
    scopedContextFiles: Record<string, string>;
    image?: string;
    knowledgeBase?: Array<{ path: string, content: string }>;
    generationSystemPrompt: string;
    generationPrompt: string;
    enforceStructuredMultiFile: boolean;
    structuredPreferredPaths: (string | undefined)[];
    requestRateLimit?: any;
    parseOutputWithLogsFunc: (raw: string, path: string, existing: Record<string, string>) => ParsedLLMOutput;
}

export async function attemptTsxRescue(input: TsxRescueInput): Promise<StructuredRetryResult> {
    console.warn('[Parser] Attempting final raw TSX rescue for new mode...');
    const rescueSystemPrompt = `${input.generationSystemPrompt || ''}\n\nCRITICAL OUTPUT ENFORCEMENT:\n- Return ONLY valid TSX module code for src/App.tsx.\n- Do NOT return JSON.\n- Do NOT use markdown code fences.\n- Include all required imports.`;
    const rescueUserPrompt = `${input.generationPrompt}\n\nYour previous responses failed structured JSON validation.\nReturn ONLY raw TSX module source for src/App.tsx now.`;
    const rescueResult = await withTimeout(
        llmManager.generate({
            provider: input.executionProviderHint,
            generationMode: input.effectiveGenerationMode,
            prompt: rescueUserPrompt,
            systemPrompt: rescueSystemPrompt,
            temperature: 0.2,
            maxTokens: input.tokenBudget.repairMaxTokens,
            stream: false,
            currentFiles: input.scopedContextFiles,
            image: input.image,
            knowledgeBase: input.knowledgeBase,
        }),
        TIMEOUT_MS
    );
    if (typeof rescueResult === 'object' && 'content' in rescueResult && !('getReader' in rescueResult)) {
        const rescueRaw = (rescueResult as any).content || '';
        const requestRateLimit = (rescueResult as any).rateLimit || input.requestRateLimit;
        const parsedRescue = input.parseOutputWithLogsFunc(rescueRaw, 'src/App.tsx', input.scopedContextFiles);
        const coercedRescue = coerceToStructuredFilesFallback({
            parsedOutput: parsedRescue,
            generationMode: input.effectiveGenerationMode,
            fallbackPath: 'src/App.tsx',
            existingFiles: input.scopedContextFiles,
            rawOutput: rescueRaw,
            allowSingleFileWrap: !input.enforceStructuredMultiFile,
            preferredPaths: input.structuredPreferredPaths,
        });
        if (coercedRescue) {
            console.warn(`[Parser] Final raw TSX rescue succeeded via ${coercedRescue.reason}.`);
            return { rawCode: rescueRaw, parsedOutput: coercedRescue.parsedOutput, requestRateLimit, success: true };
        }
    }
    return { rawCode: '', parsedOutput: { extractedFiles: [], detectedFormat: 'json', primaryCode: '' }, success: false };
}

export async function executeStructuredRetryLoop(input: StructuredRetryInput): Promise<StructuredRetryResult> {
    console.warn('[Parser] Structured output required but missing/invalid. Running strict JSON retries...');
    let repairedRaw = input.rawCode;
    let parsedOutput = input.parsedOutput;
    let requestRateLimit = input.requestRateLimit;
    let success = false;

    const structuredRetryLimit = 4;
    const structuredRetryTimeoutMs = TIMEOUT_MS;
    for (let retry = 1; retry <= structuredRetryLimit; retry += 1) {
        if (retry === 4) {
            const fallbackParsed = ensureLastResortRenderableOutput({
                primaryCode: APP_DEFAULT_EXPORT_FALLBACK,
                extractedFiles: [],
                detectedFormat: 'raw',
            }, 'src/App.tsx');
            repairedRaw = APP_DEFAULT_EXPORT_FALLBACK;
            parsedOutput = fallbackParsed;
            success = true;
            console.warn('[Parser] Structured retry exhausted. Using guaranteed fallback App.tsx on attempt 4.');
            break;
        }

        const strictContractJson = input.requiresEditStructuredOutput
            ? `{"operations":[{"op":"add_class","path":"src/App.tsx","selector":"[data-source-id=\\"src/App.tsx:12:5\\"]","classes":["bg-amber-400"]}],"notes":[]}`
            : `{"mainEntry":"src/App.tsx","dependencies":["react","react-dom"],"files":[{"path":"src/App.tsx","content":"..."}],"notes":[]}`;
        const retryInstruction =
            retry === 1
                ? 'Return ONLY valid JSON, no markdown.'
                : retry === 2
                    ? 'Simplify to just App.tsx and one component.'
                    : 'Return minimal single-file App.tsx only.';
        const strictSystemPrompt = `${input.generationSystemPrompt || ''}

CRITICAL OUTPUT ENFORCEMENT:
- You are in STRICT JSON mode (DeepSeek-safe).
- Return strict valid JSON only.
- Do not use markdown fences.
- Do not include explanatory text.
- Do not include trailing commas.
- Do not include comments.
- Allowed top-level keys:
  - edit mode: operations, files, notes
  - new mode: mainEntry, dependencies, files, notes
- If you return "files", every file content must be a valid JSON string with escaped newlines (\\n).
- Do not wrap JSON in prose.
 - ${retryInstruction}
${input.requiresEditStructuredOutput ? '- EDIT MODE: Prefer "operations" JSON. If anchors are uncertain, return "files" JSON instead of invalid operations. Never return raw code/markdown.' : '- NEW MODE: Return structured multi-file JSON, never raw code or markdown.'}
Example:
${strictContractJson}`;

        const unresolvedOperationHints = parsedOutput.operationsReport?.unresolved
            ?.slice(0, 4)
            .map((entry) => `- #${entry.index + 1}${entry.path ? ` @ ${entry.path}` : ''}: ${entry.reason}`)
            .join('\\n');

        const strictUserPrompt = input.requiresEditStructuredOutput
            ? `${input.generationPrompt}

Your previous response was invalid for edit mode or could not be applied to current files.
Use selector-based AST operations when possible (especially with sourceId/data-source-id anchors).
If you use replace operations, all "find" anchors must already exist exactly in the current file content.
${unresolvedOperationHints ? `Unapplied operations:\n${unresolvedOperationHints}\n` : ''}
Return strict valid JSON now in this exact format:
{"operations":[{"op":"add_class","path":"src/App.tsx","selector":"[data-source-id=\\"src/App.tsx:12:5\\"]","classes":["bg-amber-400"]}]}
or
{"operations":[{"op":"replace_text","path":"src/App.tsx","find":"...","replace":"..."}]}
Fallback if operations cannot be applied safely:
{"files":[{"path":"src/App.tsx","content":"..."}],"notes":[]}

Retry instruction: ${retryInstruction}`
            : `${input.generationPrompt}

Your previous response had malformed structured JSON.
Return strict valid JSON now in one of these formats:
1) {"mainEntry":"src/App.tsx","dependencies":["react","react-dom"],"files":[{"path":"src/App.tsx","content":"..."}],"notes":[]}
2) {"operations":[{"op":"replace_text","path":"src/App.tsx","find":"...","replace":"..."}],"notes":[]}
Only return JSON.
Retry instruction: ${retryInstruction}`;

        const retryResult = await withTimeout(
            llmManager.generate({
                provider: input.executionProviderHint,
                generationMode: input.effectiveGenerationMode,
                prompt: strictUserPrompt,
                systemPrompt: strictSystemPrompt,
                temperature: 0.1,
                maxTokens: input.tokenBudget.repairMaxTokens,
                stream: false,
                currentFiles: input.scopedContextFiles,
                image: input.image,
                knowledgeBase: input.knowledgeBase
            }),
            structuredRetryTimeoutMs
        );

        if (typeof retryResult === 'object' && 'content' in retryResult && !('getReader' in retryResult)) {
            repairedRaw = (retryResult as any).content || '';
            requestRateLimit = (retryResult as any).rateLimit || requestRateLimit;
        } else {
            break;
        }

        parsedOutput = input.parseOutputWithLogsFunc(repairedRaw, 'src/App.tsx', input.scopedContextFiles);
        const retryStructuredOk = input.structuredOutputFormats.has(parsedOutput.detectedFormat);
        const retryHasRuntimeModulePayload = Boolean(
            (typeof parsedOutput.primaryCode === 'string' && parsedOutput.primaryCode.trim().length > 0) ||
            parsedOutput.extractedFiles.some((file) => /\\.(tsx|ts|jsx|js)$/.test(normalizeGeneratedPath(file.path))) ||
            (parsedOutput.astPatches && parsedOutput.astPatches.length > 0)
        );
        const retryMissingRuntimeInNew = input.effectiveGenerationMode === 'new' && !retryHasRuntimeModulePayload;
        const retryValid = !parsedOutput.parseError
            && (!input.requiresEditStructuredOutput || retryStructuredOk)
            && !retryMissingRuntimeInNew;
        if (retryValid) {
            console.log(`[Parser] Strict JSON retry succeeded on attempt ${retry}.`);
            success = true;
            break;
        }

        const coercedRetry = coerceToStructuredFilesFallback({
            parsedOutput,
            generationMode: input.effectiveGenerationMode,
            fallbackPath: 'src/App.tsx',
            existingFiles: input.scopedContextFiles,
            rawOutput: repairedRaw,
            allowSingleFileWrap: !input.enforceStructuredMultiFile,
            preferredPaths: input.structuredPreferredPaths,
        });
        if (coercedRetry) {
            parsedOutput = coercedRetry.parsedOutput;
            console.warn(`[Parser] Structured retry recovered via ${coercedRetry.reason} on attempt ${retry}.`);
            success = true;
            break;
        }
    }

    return {
        rawCode: repairedRaw,
        parsedOutput,
        requestRateLimit,
        success
    };
}
