import { llmManager } from './llm/manager.js';
import { codeProcessor, type ProcessedCode } from '../utils/code-processor.js';
import { type SupportedProvider } from './generate-validation.js';
import { sanitizeGeneratedModuleCode, type ParsedLLMOutput } from '../ai/project-pipeline/llm-response-parser.js';

export interface AutoRepairAttemptLog {
  attempt: number;
  beforeErrors: number;
  afterErrors: number;
  status: 'improved' | 'resolved' | 'aborted' | 'failed';
  reason?: string;
}

export interface AutoRepairSummary {
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

function truncateForPrompt(input: string, maxLength: number): string {
  if (!input || input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}\n/* truncated */`;
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
      code.replace(/\b(React\.)?useState\s*(?:<[^>]+>)?\s*\(\s*\[\s*\]\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any[]>([])`;
      }),
      'useState_any_array_fallback'
    );

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

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*never\[\]\s*>\s*\(\s*\[\s*\]\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any[]>([])`;
      }),
      'useState_never_array_generic_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*\[\s*\]\s*>\s*\(\s*\[\s*\]\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any[]>([])`;
      }),
      'useState_empty_tuple_generic_any'
    );

    applyRepair(
      code.replace(/\bas\s+never\[\]/g, 'as any[]'),
      'cast_never_array_to_any_array'
    );

    applyRepair(
      code.replace(/:\s*never\[\]/g, ': any[]'),
      'annotation_never_array_to_any_array'
    );

    applyRepair(
      code.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*\[\s*\]\s*=/g, (_full, decl: string, name: string) => {
        return `${decl} ${name}: any[] =`;
      }),
      'empty_tuple_annotation_to_any_array'
    );

    applyRepair(
      code.replace(/(\.reduce\s*\([\s\S]*?),\s*\[\s*\]\s*\)/g, (_full, left: string) => {
        return `${left}, [] as any[])`;
      }),
      'reduce_empty_array_acc_any'
    );

    applyRepair(
      code.replace(/Array<\s*never\s*>/g, 'Array<any>'),
      'array_never_generic_to_any'
    );

    applyRepair(
      code.replace(/(\b[A-Za-z_$][\w$]*\s*:\s*)\[\s*\](\s*[,}])/g, '$1[] as any[]$2'),
      'object_property_empty_array_to_any_array'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*\{([^>]|\n)*never\[\]([^>]|\n)*\}\s*>\s*\(/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(`;
      }),
      'useState_object_never_array_generic_any'
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

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*undefined\s*>\s*\(\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(undefined)`;
      }),
      'useState_generic_undefined_no_initial_any'
    );

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*undefined\s*>\s*\(\s*undefined\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(undefined)`;
      }),
      'useState_generic_undefined_any'
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

    applyRepair(
      code.replace(/\b(React\.)?useState\s*<\s*null\s*>\s*\(\s*null\s*\)/g, (_full, reactPrefix: string | undefined) => {
        return `${reactPrefix || ''}useState<any>(null)`;
      }),
      'useState_generic_null_any'
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

export async function runStructuredAutoRepairLoop(input: {
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
  parseOutputWithLogs: (rawContent: string, preferredPath: string, existingFiles: Record<string, string>) => ParsedLLMOutput;
}): Promise<{ code: string; processed: ProcessedCode; summary: AutoRepairSummary }> {
  const maxRepairAttempts = Math.max(0, Math.min(1, Number(input.maxAttempts) || 0));
  const initialErrors = input.initialProcessed.errors.length;
  const summary: AutoRepairSummary = {
    enabled: input.enabled,
    attempted: false,
    applied: false,
    maxAttempts: maxRepairAttempts,
    attemptsExecuted: 0,
    initialErrorCount: initialErrors,
    finalErrorCount: initialErrors,
    logs: [],
  };

  if (!input.enabled || initialErrors === 0 || !input.validate) {
    return { code: input.initialCode, processed: input.initialProcessed, summary };
  }

  summary.attempted = true;

  let currentCode = sanitizeGeneratedModuleCode(input.initialCode || '');
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

  for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
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

      const parsed = input.parseOutputWithLogs(repairedRaw, input.filePath, input.currentFiles || {});
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
      const nextCodeRaw = parsed.primaryCode?.trim();
      const nextCode = nextCodeRaw ? sanitizeGeneratedModuleCode(nextCodeRaw) : '';
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
