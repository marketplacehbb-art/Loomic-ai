import ts from 'typescript';

export interface ParsedLLMOutput {
  primaryCode: string;
  extractedFiles: Array<{ path: string; content: string }>;
  detectedFormat: 'json' | 'operations' | 'fenced' | 'raw';
  parseError?: 'MALFORMED_STRUCTURED_JSON' | 'UNAPPLIED_EDIT_OPERATIONS' | 'INVALID_HTML_DOCUMENT_OUTPUT';
  operationsReport?: ParsedOperationsReport;
  /** AST-level patch operations extracted from the LLM output (Enterprise Feature 2) */
  astPatches?: Array<{
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
}

export interface ParsedOperationsReport {
  totalOperations: number;
  appliedOperations: number;
  unresolvedOperations: number;
  unresolved: Array<{
    index: number;
    path?: string;
    reason: string;
  }>;
}

const FILE_EXTENSIONS = '(?:tsx|ts|jsx|js|css|json|html|md)';
const FILE_PATH_REGEX = new RegExp(`[A-Za-z0-9_./-]+\\.${FILE_EXTENSIONS}`, 'gi');

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function normalizeGeneratedPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === 'App.tsx' || normalized === 'app.tsx') return 'src/App.tsx';
  if (normalized === 'main.tsx') return 'src/main.tsx';
  if (/^[A-Za-z0-9_-]+\.(tsx|ts|jsx|js|css)$/.test(normalized) && !normalized.startsWith('src/')) {
    return `src/${normalized}`;
  }
  return normalized;
}

function isRuntimeModulePath(path: string): boolean {
  const normalized = normalizeGeneratedPath(path || '');
  return /\.(tsx|ts|jsx|js)$/.test(normalized);
}

function looksLikeFullHtmlDocument(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const hasDoctype = /<!doctype\s+html/i.test(code);
  const hasHtmlTag = /<html[\s>]/i.test(code);
  const hasHeadTag = /<head[\s>]/i.test(code);
  const hasBodyTag = /<body[\s>]/i.test(code);
  return hasDoctype || (hasHtmlTag && (hasHeadTag || hasBodyTag));
}

function isInvalidHtmlForRuntimeModule(path: string, content: string): boolean {
  return isRuntimeModulePath(path) && looksLikeFullHtmlDocument(content);
}

function inferPathFromNearbyText(text: string): string | undefined {
  const normalized = text.replace(/\r/g, '\n');
  const matches = normalized.match(new RegExp(FILE_PATH_REGEX.source, 'gi'));
  if (!matches || matches.length === 0) return undefined;
  return matches[matches.length - 1];
}

function inferPathFromCode(code: string, languageHint?: string): string | undefined {
  const lowerLang = (languageHint || '').toLowerCase();
  if (lowerLang === 'css') return 'src/index.css';
  if (lowerLang === 'json' && /"dependencies"\s*:/.test(code)) return 'package.json';
  if (/ReactDOM\.createRoot/.test(code)) return 'src/main.tsx';
  if (/export\s+default\s+function\s+App\b/.test(code) || /const\s+App\s*[:=]/.test(code)) {
    return 'src/App.tsx';
  }
  return undefined;
}

function scoreCandidate(code: string, path?: string): number {
  let score = 0;

  if (path === 'src/App.tsx' || path === 'App.tsx') score += 120;
  if (/export\s+default\s+function\s+App\b/.test(code)) score += 100;
  if (/function\s+App\s*\(/.test(code)) score += 70;
  if (/return\s*\(/.test(code)) score += 20;
  if (/import\s+React/.test(code)) score += 20;
  if (/from\s+['"]react['"]/.test(code)) score += 20;
  if (/from\s+['"]\.\/components\//.test(code)) score += 20;

  const defaultExports = (code.match(/export\s+default\b/g) || []).length;
  if (defaultExports > 1) {
    score -= (defaultExports - 1) * 30;
  }

  if (looksLikeFullHtmlDocument(code)) {
    score -= isRuntimeModulePath(path || 'src/App.tsx') ? 600 : 250;
  }

  return score + Math.min(40, Math.floor(code.length / 250));
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
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
}

function dedupeImportLines(code: string): string {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  const seenImports = new Set<string>();
  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('import ')) return true;
      if (seenImports.has(trimmed)) return false;
      seenImports.add(trimmed);
      return true;
    })
    .join('\n');
}

function consolidateImportsByModule(code: string): string {
  try {
    const sourceFile = ts.createSourceFile(
      'parsed-imports.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
    if (importDeclarations.length === 0) return code;

    interface ImportBucket {
      moduleName: string;
      firstPos: number;
      sideEffectOnly: boolean;
      defaultImport?: string;
      namespaceImport?: string;
      namedImports: string[];
      namedImportSet: Set<string>;
    }

    const buckets = new Map<string, ImportBucket>();
    const rangesToRemove: Array<{ start: number; end: number }> = [];

    importDeclarations.forEach((decl) => {
      const moduleName = (decl.moduleSpecifier as ts.StringLiteral).text;
      const clause = decl.importClause;
      const existing = buckets.get(moduleName);
      const bucket: ImportBucket = existing || {
        moduleName,
        firstPos: decl.getStart(sourceFile),
        sideEffectOnly: false,
        namedImports: [],
        namedImportSet: new Set<string>(),
      };

      if (!clause) {
        bucket.sideEffectOnly = true;
      } else {
        if (clause.name && !bucket.defaultImport) {
          bucket.defaultImport = clause.name.text;
        }

        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            if (!bucket.namespaceImport) {
              bucket.namespaceImport = clause.namedBindings.name.text;
            }
          } else if (ts.isNamedImports(clause.namedBindings)) {
            clause.namedBindings.elements.forEach((element) => {
              const importText = element.propertyName
                ? `${element.propertyName.text} as ${element.name.text}`
                : element.name.text;
              if (!bucket.namedImportSet.has(importText)) {
                bucket.namedImportSet.add(importText);
                bucket.namedImports.push(importText);
              }
            });
          }
        }
      }

      if (!existing) {
        buckets.set(moduleName, bucket);
      }

      rangesToRemove.push({
        start: decl.getFullStart(),
        end: decl.getEnd(),
      });
    });

    const consolidatedImportLines: string[] = [];
    const orderedBuckets = [...buckets.values()].sort((a, b) => a.firstPos - b.firstPos);

    orderedBuckets.forEach((bucket) => {
      const hasBindings =
        Boolean(bucket.defaultImport) ||
        Boolean(bucket.namespaceImport) ||
        bucket.namedImports.length > 0;

      if (bucket.sideEffectOnly && !hasBindings) {
        consolidatedImportLines.push(`import '${bucket.moduleName}';`);
        return;
      }

      if (bucket.namespaceImport) {
        if (bucket.defaultImport) {
          consolidatedImportLines.push(
            `import ${bucket.defaultImport}, * as ${bucket.namespaceImport} from '${bucket.moduleName}';`
          );
        } else {
          consolidatedImportLines.push(`import * as ${bucket.namespaceImport} from '${bucket.moduleName}';`);
        }

        if (bucket.namedImports.length > 0) {
          consolidatedImportLines.push(
            `import { ${bucket.namedImports.join(', ')} } from '${bucket.moduleName}';`
          );
        }
        return;
      }

      if (bucket.defaultImport && bucket.namedImports.length > 0) {
        consolidatedImportLines.push(
          `import ${bucket.defaultImport}, { ${bucket.namedImports.join(', ')} } from '${bucket.moduleName}';`
        );
        return;
      }

      if (bucket.defaultImport) {
        consolidatedImportLines.push(`import ${bucket.defaultImport} from '${bucket.moduleName}';`);
        return;
      }

      if (bucket.namedImports.length > 0) {
        consolidatedImportLines.push(`import { ${bucket.namedImports.join(', ')} } from '${bucket.moduleName}';`);
      }
    });

    let body = code;
    rangesToRemove
      .sort((a, b) => b.start - a.start)
      .forEach(({ start, end }) => {
        let adjustedEnd = end;
        while (adjustedEnd < body.length && (body[adjustedEnd] === '\n' || body[adjustedEnd] === '\r')) {
          adjustedEnd += 1;
        }
        body = body.slice(0, start) + body.slice(adjustedEnd);
      });

    const importBlock = consolidatedImportLines.join('\n').trim();
    const trimmedBody = body.trimStart();
    if (!importBlock) return trimmedBody;
    if (!trimmedBody) return `${importBlock}\n`;

    return `${importBlock}\n\n${trimmedBody}`;
  } catch {
    return code;
  }
}

function removeExtraDefaultExports(code: string): string {
  const matches = Array.from(code.matchAll(/export\s+default\b/g));
  if (matches.length <= 1) return code;

  let keepIndex = matches[0].index || 0;
  const appMatch = code.match(/export\s+default\s+function\s+App\b/);
  if (appMatch && typeof appMatch.index === 'number') {
    keepIndex = appMatch.index;
  }

  let output = code;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const start = matches[i].index || 0;
    if (start === keepIndex) continue;

    const after = output.slice(start);
    const fnMatch = after.match(/^export\s+default\s+function\b/);
    if (fnMatch) {
      const openBrace = output.indexOf('{', start);
      if (openBrace === -1) continue;
      const closeBrace = findMatchingBrace(output, openBrace);
      if (closeBrace === -1) continue;
      output = output.slice(0, start) + output.slice(closeBrace + 1);
      continue;
    }

    const statementEnd = output.indexOf('\n', start);
    if (statementEnd === -1) {
      output = output.slice(0, start);
    } else {
      output = output.slice(0, start) + output.slice(statementEnd + 1);
    }
  }

  return output;
}

function removeDuplicateTopLevelDeclarations(code: string): string {
  try {
    const sourceFile = ts.createSourceFile(
      'parsed-output.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const seen = new Set<string>();
    const removals: Array<{ start: number; end: number }> = [];

    const getStatementNames = (statement: ts.Statement): string[] => {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        return [statement.name.text];
      }
      if (ts.isClassDeclaration(statement) && statement.name) {
        return [statement.name.text];
      }
      if (ts.isInterfaceDeclaration(statement)) {
        return [statement.name.text];
      }
      if (ts.isTypeAliasDeclaration(statement)) {
        return [statement.name.text];
      }
      if (ts.isEnumDeclaration(statement)) {
        return [statement.name.text];
      }
      if (ts.isVariableStatement(statement)) {
        const names: string[] = [];
        statement.declarationList.declarations.forEach((declaration) => {
          if (ts.isIdentifier(declaration.name)) {
            names.push(declaration.name.text);
          }
        });
        return names;
      }
      return [];
    };

    sourceFile.statements.forEach((statement) => {
      const names = getStatementNames(statement);
      if (names.length === 0) return;

      const hasDuplicate = names.some((name) => seen.has(name));
      if (hasDuplicate) {
        removals.push({
          start: statement.getFullStart(),
          end: statement.getEnd(),
        });
        return;
      }

      names.forEach((name) => seen.add(name));
    });

    if (removals.length === 0) return code;

    let output = code;
    removals
      .sort((a, b) => b.start - a.start)
      .forEach(({ start, end }) => {
        output = output.slice(0, start) + output.slice(end);
      });

    return output;
  } catch {
    return code;
  }
}

function sanitizePrimaryCode(code: string): string {
  let sanitized = code.replace(/\r\n/g, '\n').trim();
  sanitized = dedupeImportLines(sanitized);
  sanitized = consolidateImportsByModule(sanitized);
  sanitized = removeExtraDefaultExports(sanitized);
  sanitized = removeDuplicateTopLevelDeclarations(sanitized);
  return `${sanitized.trim()}\n`;
}

export function sanitizeGeneratedModuleCode(code: string): string {
  return sanitizePrimaryCode(code);
}

function parseFencedBlocks(raw: string): Array<{ path?: string; content: string }> {
  const blocks: Array<{ path?: string; content: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(raw)) !== null) {
    const language = (match[1] || '').trim();
    const content = (match[2] || '').trim();
    if (!content) continue;

    const beforeFence = raw.slice(Math.max(0, match.index - 260), match.index);
    const nearbyPath = inferPathFromNearbyText(beforeFence);
    const fallbackPath = inferPathFromCode(content, language);

    blocks.push({
      path: nearbyPath || fallbackPath,
      content,
    });
  }

  return blocks;
}

function tryParseJsonLenient(candidate: string): unknown | null {
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // tolerate simple trailing commas from LLM output
    try {
      const relaxed = trimmed.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(relaxed) as unknown;
    } catch {
      try {
        const normalizedQuotes = trimmed
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'");
        const withoutComments = normalizedQuotes
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        const withQuotedKeys = withoutComments.replace(
          /([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g,
          '$1"$2"$3'
        );
        const withDoubleStrings = withQuotedKeys.replace(
          /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
          (_full, inner: string) => `"${inner.replace(/"/g, '\\"')}"`
        );
        const recovered = withDoubleStrings.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(recovered) as unknown;
      } catch {
        return null;
      }
    }
  }
}

function collectJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    candidates.push(trimmed);
  }

  const fencedRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fencedRegex.exec(raw)) !== null) {
    const language = (fenceMatch[1] || '').trim().toLowerCase();
    const content = (fenceMatch[2] || '').trim();
    if (!content) continue;
    if (language.includes('json') || (content.startsWith('{') && content.endsWith('}'))) {
      candidates.push(content);
    }
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1).trim());
  }

  return Array.from(new Set(candidates));
}

function tryParseStructuredJsonObject(raw: string): Record<string, unknown> | null {
  const candidates = collectJsonCandidates(raw);
  for (const candidate of candidates) {
    const parsed = tryParseJsonLenient(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return null;
}

function looksLikeStructuredOutput(raw: string): boolean {
  const trimmed = raw.trim();
  const directMarker = /["'](?:operations|files|edits|changes|patches)["']\s*:/i;
  if (trimmed.startsWith('{') && directMarker.test(trimmed.slice(0, 240))) {
    return true;
  }

  const fencedRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fencedRegex.exec(raw)) !== null) {
    const language = (match[1] || '').trim().toLowerCase();
    const content = (match[2] || '').trim();
    if (!content) continue;
    if (!language.includes('json')) continue;
    if (directMarker.test(content)) return true;
  }

  return false;
}

function tryParseJsonOutput(raw: string): Array<{ path: string; content: string }> {
  const parsed = tryParseStructuredJsonObject(raw);
  if (!parsed) return [];

  const filesArray = (parsed as { files?: Array<{ path?: string; content?: string }> }).files;
  if (!Array.isArray(filesArray)) return [];

  return filesArray
    .map((file) => ({
      path: normalizeGeneratedPath(file.path || ''),
      content: typeof file.content === 'string' ? file.content : '',
    }))
    .filter((file) => {
      if (file.path.length === 0 || file.content.trim().length === 0) return false;
      if (isInvalidHtmlForRuntimeModule(file.path, file.content)) return false;
      return true;
    });
}

interface JsonOperationsParseResult {
  files: Array<{ path: string; content: string }>;
  hasOperationPayload: boolean;
  report?: ParsedOperationsReport;
}

const AST_OPERATION_TYPES = new Set([
  'set_prop',
  'remove_prop',
  'replace_text',
  'add_class',
  'remove_class',
  'wrap_element',
  'insert_child',
  'ast_patch',
]);

function tryParseJsonOperations(
  raw: string,
  existingFiles: Record<string, string> = {}
): JsonOperationsParseResult {
  const parsed = tryParseStructuredJsonObject(raw);
  if (!parsed) return { files: [], hasOperationPayload: false };

  const container = parsed as {
    operations?: JsonEditOperation[];
    edits?: JsonEditOperation[];
    changes?: JsonEditOperation[];
    patches?: JsonEditOperation[];
  };

  const operationList =
    (Array.isArray(container.operations) && container.operations) ||
    (Array.isArray(container.edits) && container.edits) ||
    (Array.isArray(container.changes) && container.changes) ||
    (Array.isArray(container.patches) && container.patches) ||
    [];

  if (!Array.isArray(operationList) || operationList.length === 0) {
    return { files: [], hasOperationPayload: false };
  }

  const stagedFiles = new Map<string, string>();
  const unresolved: ParsedOperationsReport['unresolved'] = [];
  let appliedOperations = 0;
  let standardOperations = 0;

  const markUnresolved = (index: number, path: string | undefined, reason: string) => {
    unresolved.push({ index, path, reason });
  };

  const readCurrent = (path: string): string => {
    if (stagedFiles.has(path)) return stagedFiles.get(path) || '';
    return typeof existingFiles[path] === 'string' ? existingFiles[path] : '';
  };

  operationList.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      markUnresolved(index, undefined, 'operation must be an object');
      return;
    }

    const path = normalizeGeneratedPath(entry.path || entry.file || entry.target || '');
    if (!path) {
      markUnresolved(index, undefined, 'missing target path');
      return;
    }

    const operation = (entry.op || entry.type || 'patch').toLowerCase();
    if (AST_OPERATION_TYPES.has(operation)) {
      // AST operations are executed in the dedicated AST patch pipeline.
      return;
    }
    standardOperations += 1;
    const isDelete =
      operation === 'delete' ||
      operation === 'delete_file' ||
      operation === 'remove' ||
      operation === 'remove_file';
    let operationApplied = false;

    if (isDelete) {
      const hadExistingValue = stagedFiles.has(path) || typeof existingFiles[path] === 'string';
      stagedFiles.delete(path);
      if (hadExistingValue) {
        operationApplied = true;
      } else {
        markUnresolved(index, path, 'delete target does not exist');
      }
      if (operationApplied) appliedOperations += 1;
      return;
    }

    if (typeof entry.content === 'string') {
      const currentContent = readCurrent(path);
      const nextContent = entry.content;
      if (nextContent.trim().length === 0) {
        markUnresolved(index, path, 'content payload is empty');
      } else if (isInvalidHtmlForRuntimeModule(path, nextContent)) {
        markUnresolved(index, path, 'content payload is full HTML document for TS/JS module target');
      } else if (nextContent !== currentContent) {
        stagedFiles.set(path, nextContent);
        operationApplied = true;
      } else {
        markUnresolved(index, path, 'content payload identical to existing content');
      }
      if (operationApplied) appliedOperations += 1;
      return;
    }

    const currentContent = readCurrent(path);
    let nextContent = currentContent;

    if (typeof entry.prepend === 'string' && entry.prepend.length > 0) {
      nextContent = `${entry.prepend}${nextContent}`;
    }

    const patchPairs = extractPatchPairs(entry);
    const replaceAll = entry.replaceAll === true || entry.global === true;
    if (patchPairs.length > 0) {
      patchPairs.forEach((pair) => {
        const patchResult = applyPatchPair(nextContent, pair, replaceAll);
        nextContent = patchResult.content;
      });
    }

    const appendText = typeof entry.append === 'string'
      ? entry.append
      : (typeof entry.appendContent === 'string' ? entry.appendContent : '');
    if (appendText.length > 0) {
      nextContent = `${nextContent}${appendText}`;
    }

    if (nextContent !== currentContent && nextContent.trim().length > 0) {
      if (isInvalidHtmlForRuntimeModule(path, nextContent)) {
        markUnresolved(index, path, 'operation produced full HTML document for TS/JS module target');
      } else {
        stagedFiles.set(path, nextContent);
        operationApplied = true;
      }
    } else if (nextContent.trim().length === 0) {
      markUnresolved(index, path, 'operation produced empty content');
    } else {
      markUnresolved(index, path, 'operation produced no changes');
    }

    if (operationApplied) appliedOperations += 1;
  });

  const files = Array.from(stagedFiles.entries())
    .map(([path, content]) => ({ path, content }))
    .filter((file) => file.path.length > 0 && file.content.trim().length > 0);

  return {
    files,
    hasOperationPayload: standardOperations > 0,
    report: {
      totalOperations: standardOperations,
      appliedOperations,
      unresolvedOperations: Math.max(0, standardOperations - appliedOperations),
      unresolved,
    },
  };
}

function containsInvalidHtmlStructuredOutput(raw: string): boolean {
  const parsed = tryParseStructuredJsonObject(raw);
  if (!parsed) return false;

  const filesArray = (parsed as { files?: Array<{ path?: string; content?: string }> }).files;
  if (Array.isArray(filesArray)) {
    const hasInvalidFile = filesArray.some((file) => {
      const path = normalizeGeneratedPath(file?.path || '');
      const content = typeof file?.content === 'string' ? file.content : '';
      return path.length > 0 && content.length > 0 && isInvalidHtmlForRuntimeModule(path, content);
    });
    if (hasInvalidFile) return true;
  }

  const operationContainer = parsed as {
    operations?: JsonEditOperation[];
    edits?: JsonEditOperation[];
    changes?: JsonEditOperation[];
    patches?: JsonEditOperation[];
  };
  const operationList =
    (Array.isArray(operationContainer.operations) && operationContainer.operations) ||
    (Array.isArray(operationContainer.edits) && operationContainer.edits) ||
    (Array.isArray(operationContainer.changes) && operationContainer.changes) ||
    (Array.isArray(operationContainer.patches) && operationContainer.patches) ||
    [];

  return operationList.some((entry) => {
    const path = normalizeGeneratedPath(entry?.path || entry?.file || entry?.target || '');
    if (!path || !isRuntimeModulePath(path)) return false;
    if (typeof entry?.content !== 'string') return false;
    return looksLikeFullHtmlDocument(entry.content);
  });
}

interface PatchPair {
  find: string;
  replace: string;
}

interface JsonEditOperation {
  op?: string;
  type?: string;
  path?: string;
  file?: string;
  target?: string;
  content?: string;
  append?: string;
  appendContent?: string;
  prepend?: string;
  find?: string;
  search?: string;
  replace?: string;
  patch?: {
    find?: string;
    search?: string;
    replace?: string;
  };
  patches?: Array<{
    find?: string;
    search?: string;
    replace?: string;
  }>;
  replaceAll?: boolean;
  global?: boolean;
  // AST patch fields (Enterprise Feature 2)
  selector?: string;
  prop?: string;
  value?: string;
  classes?: string[];
  text?: string;
  wrapTag?: string;
  jsx?: string;
  position?: string;
}

function extractPatchPairs(operation: JsonEditOperation): PatchPair[] {
  const pairs: PatchPair[] = [];

  if (Array.isArray(operation.patches)) {
    operation.patches.forEach((entry) => {
      const find = typeof entry.find === 'string'
        ? entry.find
        : (typeof entry.search === 'string' ? entry.search : '');
      if (!find) return;
      pairs.push({
        find,
        replace: typeof entry.replace === 'string' ? entry.replace : '',
      });
    });
  }

  if (operation.patch && typeof operation.patch === 'object') {
    const find = typeof operation.patch.find === 'string'
      ? operation.patch.find
      : (typeof operation.patch.search === 'string' ? operation.patch.search : '');
    if (find) {
      pairs.push({
        find,
        replace: typeof operation.patch.replace === 'string' ? operation.patch.replace : '',
      });
    }
  }

  const inlineFind = typeof operation.find === 'string'
    ? operation.find
    : (typeof operation.search === 'string' ? operation.search : '');
  if (inlineFind) {
    pairs.push({
      find: inlineFind,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
    });
  }

  return pairs;
}

function applyPatchPair(
  content: string,
  pair: PatchPair,
  replaceAll: boolean = false
): { content: string; replaced: boolean } {
  if (!pair.find || !content.includes(pair.find)) {
    return { content, replaced: false };
  }

  if (replaceAll) {
    return {
      content: content.split(pair.find).join(pair.replace),
      replaced: true,
    };
  }

  const firstIndex = content.indexOf(pair.find);
  if (firstIndex < 0) {
    return { content, replaced: false };
  }

  return {
    content: `${content.slice(0, firstIndex)}${pair.replace}${content.slice(firstIndex + pair.find.length)}`,
    replaced: true,
  };
}

function choosePrimaryCode(
  candidates: Array<{ path?: string; content: string }>,
  fallback: string,
  preferredPath: string
): string {
  if (candidates.length === 0) {
    return sanitizePrimaryCode(fallback);
  }

  const normalizedPreferred = normalizeGeneratedPath(preferredPath);
  const preferred = candidates.find((entry) => normalizeGeneratedPath(entry.path || '') === normalizedPreferred);
  if (preferred) {
    return sanitizePrimaryCode(preferred.content);
  }

  let best = candidates[0];
  let bestScore = scoreCandidate(best.content, best.path);
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const candidateScore = scoreCandidate(candidate.content, candidate.path);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return sanitizePrimaryCode(best.content);
}

function extractAstPatchesFromRaw(raw: string): ParsedLLMOutput['astPatches'] {
  const parsed = tryParseStructuredJsonObject(raw);
  if (!parsed) return undefined;

  const container = parsed as {
    operations?: JsonEditOperation[];
    edits?: JsonEditOperation[];
    patches?: JsonEditOperation[];
  };

  const ops =
    (Array.isArray(container.operations) && container.operations) ||
    (Array.isArray(container.edits) && container.edits) ||
    (Array.isArray(container.patches) && container.patches) ||
    [];

  const astOps = ops.filter((op) => {
    const opType = (op.op || op.type || '').toLowerCase();
    return AST_OPERATION_TYPES.has(opType) && op.selector;
  });

  if (astOps.length === 0) return undefined;

  return astOps.map((op) => ({
    op: (op.op || op.type || 'set_prop').toLowerCase(),
    file: normalizeGeneratedPath(op.path || op.file || op.target || 'src/App.tsx'),
    selector: op.selector || '',
    prop: op.prop,
    value: op.value,
    classes: op.classes,
    text: op.text,
    wrapTag: op.wrapTag,
    jsx: op.jsx,
    position: op.position,
  }));
}

export function parseLLMOutput(
  rawCode: string,
  preferredPath: string = 'src/App.tsx',
  existingFiles: Record<string, string> = {}
): ParsedLLMOutput {
  if (containsInvalidHtmlStructuredOutput(rawCode)) {
    return {
      primaryCode: '',
      extractedFiles: [],
      detectedFormat: 'raw',
      parseError: 'INVALID_HTML_DOCUMENT_OUTPUT',
    };
  }

  const jsonFiles = tryParseJsonOutput(rawCode);
  if (jsonFiles.length > 0) {
    const runtimeCandidates = jsonFiles.filter((file) => isRuntimeModulePath(file.path));
    const primaryCode = runtimeCandidates.length > 0
      ? choosePrimaryCode(
        runtimeCandidates.map((f) => ({ path: f.path, content: f.content })),
        rawCode,
        preferredPath
      )
      : '';
    return {
      primaryCode,
      extractedFiles: jsonFiles,
      detectedFormat: 'json',
    };
  }

  const operationResult = tryParseJsonOperations(rawCode, existingFiles);
  const astPatches = extractAstPatchesFromRaw(rawCode);
  if (operationResult.files.length > 0) {
    const runtimeCandidates = operationResult.files.filter((file) => isRuntimeModulePath(file.path));
    const primaryCode = runtimeCandidates.length > 0
      ? choosePrimaryCode(
        runtimeCandidates.map((f) => ({ path: f.path, content: f.content })),
        rawCode,
        preferredPath
      )
      : '';
    return {
      primaryCode,
      extractedFiles: operationResult.files,
      detectedFormat: 'operations',
      operationsReport: operationResult.report,
      astPatches,
    };
  }

  if (astPatches && astPatches.length > 0) {
    const findExistingByPath = (targetPath: string): string => {
      const normalizedTarget = normalizeGeneratedPath(targetPath);
      const hit = Object.entries(existingFiles).find(
        ([path, content]) =>
          normalizeGeneratedPath(path) === normalizedTarget && typeof content === 'string'
      );
      return hit ? hit[1] : '';
    };

    const astPrimaryPath = normalizeGeneratedPath(astPatches[0].file || preferredPath);
    const firstExistingContent = Object.values(existingFiles).find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    ) || '';
    const baseCode =
      findExistingByPath(astPrimaryPath) ||
      findExistingByPath(preferredPath) ||
      findExistingByPath('src/App.tsx') ||
      firstExistingContent;

    return {
      primaryCode: sanitizePrimaryCode(baseCode),
      extractedFiles: operationResult.files,
      detectedFormat: 'operations',
      operationsReport: operationResult.report,
      astPatches,
    };
  }

  if (
    operationResult.hasOperationPayload &&
    operationResult.report &&
    operationResult.report.totalOperations > 0 &&
    operationResult.report.appliedOperations === 0
  ) {
    return {
      primaryCode: '',
      extractedFiles: [],
      detectedFormat: 'operations',
      parseError: 'UNAPPLIED_EDIT_OPERATIONS',
      operationsReport: operationResult.report,
    };
  }

  const fencedBlocks = parseFencedBlocks(rawCode);
  if (fencedBlocks.length > 0) {
    const dedupedByPath = new Map<string, string>();
    const unassignedBlocks: Array<{ content: string }> = [];

    fencedBlocks.forEach((block) => {
      const normalizedPath = block.path ? normalizeGeneratedPath(block.path) : '';
      if (!normalizedPath) {
        if (looksLikeFullHtmlDocument(block.content)) {
          return;
        }
        unassignedBlocks.push({ content: block.content });
        return;
      }
      if (isInvalidHtmlForRuntimeModule(normalizedPath, block.content)) {
        return;
      }

      const existing = dedupedByPath.get(normalizedPath);
      if (!existing || block.content.length >= existing.length) {
        dedupedByPath.set(normalizedPath, block.content);
      }
    });

    const extractedFiles = Array.from(dedupedByPath.entries()).map(([path, content]) => ({
      path,
      content: `${content.trim()}\n`,
    }));

    const candidates = [
      ...extractedFiles.map((file) => ({ path: file.path, content: file.content })),
      ...unassignedBlocks.map((block) => ({ content: block.content })),
    ];

    if (candidates.length === 0) {
      return {
        primaryCode: '',
        extractedFiles,
        detectedFormat: 'fenced',
        parseError: 'INVALID_HTML_DOCUMENT_OUTPUT',
      };
    }

    return {
      primaryCode: choosePrimaryCode(candidates, rawCode, preferredPath),
      extractedFiles,
      detectedFormat: 'fenced',
    };
  }

  if (looksLikeStructuredOutput(rawCode)) {
    return {
      primaryCode: '',
      extractedFiles: [],
      detectedFormat: 'raw',
      parseError: 'MALFORMED_STRUCTURED_JSON',
    };
  }

  if (looksLikeFullHtmlDocument(rawCode)) {
    return {
      primaryCode: '',
      extractedFiles: [],
      detectedFormat: 'raw',
      parseError: 'INVALID_HTML_DOCUMENT_OUTPUT',
    };
  }

  return {
    primaryCode: sanitizePrimaryCode(rawCode),
    extractedFiles: [],
    detectedFormat: 'raw',
  };
}
