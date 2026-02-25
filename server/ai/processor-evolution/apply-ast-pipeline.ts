/**
 * AST Patch Pipeline Integration (Enterprise Feature 2)
 * 
 * Applies AST-level patches extracted from LLM output to source code.
 * Called from generate.ts after parseLLMOutput().
 */

import { applyAstPatches, type AstPatchOperation } from './ast-rewriter.js';

export interface AstPipelineInput {
    astPatches: Array<{
        op: string;
        file: string;
        selector: string;
        prop?: string;
        value?: string;
        classes?: string[];
        text?: string;
        wrapTag?: string;
        jsx?: string;
        position?: string;
    }>;
    codeToProcess: string;
    normalizedGeneratedCode: string;
    orchestrationFiles: Array<{ path: string; content: string }>;
    scopedContextFiles: Record<string, string>;
    validationTargetPath: string;
    normalizeGeneratedPath: (p: string) => string;
}

export interface AstPipelineResult {
    codeToProcess: string;
    normalizedGeneratedCode: string;
    orchestrationFiles: Array<{ path: string; content: string }>;
    stats: { applied: number; failed: number; total: number };
}

export function runAstPatchPipeline(input: AstPipelineInput): AstPipelineResult {
    const {
        astPatches,
        scopedContextFiles,
        validationTargetPath,
        normalizeGeneratedPath,
    } = input;

    let { codeToProcess, normalizedGeneratedCode, orchestrationFiles } = input;

    // Group patches by file
    const patchesByFile = new Map<string, AstPatchOperation[]>();
    for (const p of astPatches) {
        const file = p.file || 'src/App.tsx';
        if (!patchesByFile.has(file)) patchesByFile.set(file, []);
        patchesByFile.get(file)!.push(p as AstPatchOperation);
    }

    let totalApplied = 0;
    let totalFailed = 0;

    const findContentByNormalizedPath = (
        fileMap: Record<string, string>,
        normalizedPath: string
    ): string => {
        const hit = Object.entries(fileMap).find(
            ([path, content]) =>
                normalizeGeneratedPath(path) === normalizedPath && typeof content === 'string'
        );
        return hit ? hit[1] : '';
    };

    for (const [filePath, patches] of patchesByFile) {
        const normalizedFilePath = normalizeGeneratedPath(filePath);
        const orchestrationHit = orchestrationFiles.find(
            (file) => normalizeGeneratedPath(file.path) === normalizedFilePath
        );
        const targetCode =
            orchestrationHit?.content ||
            findContentByNormalizedPath(scopedContextFiles, normalizedFilePath) ||
            codeToProcess;
        const result = applyAstPatches(targetCode, patches);
        totalApplied += result.applied.length;
        totalFailed += result.failed.length;

        if (result.applied.length > 0) {
            const normalizedValidation = normalizeGeneratedPath(validationTargetPath);
            if (
                normalizedFilePath === 'src/App.tsx' ||
                normalizedFilePath === 'App.tsx' ||
                normalizedFilePath === normalizedValidation
            ) {
                codeToProcess = result.code;
                normalizedGeneratedCode = result.code;
            } else {
                orchestrationFiles = [
                    ...orchestrationFiles.filter(
                        (f) => normalizeGeneratedPath(f.path) !== normalizedFilePath
                    ),
                    { path: normalizedFilePath, content: result.code },
                ];
            }
        }

        if (result.failed.length > 0) {
            console.warn(
                `[AST Patch] ${result.failed.length} patches failed for ${filePath}:`,
                result.failed.map((f) => f.reason)
            );
        }
    }

    const stats = {
        applied: totalApplied,
        failed: totalFailed,
        total: astPatches.length,
    };

    if (totalApplied > 0) {
        console.log(
            `🔧 AST Patches: ${totalApplied}/${astPatches.length} applied`
        );
    }

    return {
        codeToProcess,
        normalizedGeneratedCode,
        orchestrationFiles,
        stats,
    };
}
