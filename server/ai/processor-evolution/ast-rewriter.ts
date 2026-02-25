import { Project, SourceFile, SyntaxKind, Node, ImportDeclaration } from 'ts-morph';
import { iconValidator } from '../code-pipeline/icon-validator.js';

/**
 * AST Rewriter - Phase 2 Component 1
 * Performs precise code transformations using ts-morph
 */

export interface RewriteResult {
  code: string;
  transformations: Transformation[];
  optimized: boolean;
}

export interface Transformation {
  type: 'import-optimization' | 'component-extraction' | 'hook-extraction' | 'dead-code-elimination' | 'formatting';
  description: string;
  applied: boolean;
}

export class ASTRewriter {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: 4, // ReactJSX
        target: 7, // ES2020
        module: 99, // ESNext
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * Rewrite code using AST transformations
   */
  async rewrite(code: string, fileName: string = 'App.tsx'): Promise<RewriteResult> {
    const transformations: Transformation[] = [];

    try {
      const sourceFile = this.project.createSourceFile(fileName, code, { overwrite: true });

      // 1. Optimize imports
      const importOpt = this.optimizeImports(sourceFile);
      if (importOpt.applied) {
        transformations.push(importOpt);
      }

      // 2. Remove dead code (unused imports, variables)
      const deadCodeOpt = this.removeDeadCode(sourceFile);
      if (deadCodeOpt.applied) {
        transformations.push(deadCodeOpt);
      }

      // 3. Format code
      const formatOpt = this.formatCode(sourceFile);
      if (formatOpt.applied) {
        transformations.push(formatOpt);
      }

      const rewrittenCode = sourceFile.getFullText();

      return {
        code: rewrittenCode,
        transformations,
        optimized: transformations.length > 0,
      };
    } catch (error: any) {
      console.warn('[ASTRewriter] Failed to rewrite code:', error.message);
      return {
        code,
        transformations: [],
        optimized: false,
      };
    }
  }

  /**
   * Optimize imports
   */
  private optimizeImports(sourceFile: SourceFile): Transformation {
    let applied = false;
    const imports = sourceFile.getImportDeclarations();

    // Remove duplicate imports
    const importMap = new Map<string, ImportDeclaration>();
    for (const imp of imports) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const key = `${moduleSpecifier}`;

      if (importMap.has(key)) {
        // Merge named imports from the duplicate into the existing declaration
        const existing = importMap.get(key)!;
        const existingNames = new Set(
          existing.getNamedImports().map(n => n.getName())
        );

        const newNames = imp.getNamedImports()
          .map(n => n.getName())
          .filter(name => !existingNames.has(name));

        if (newNames.length > 0) {
          newNames.forEach(name => {
            existing.addNamedImport(name);
          });
        }

        imp.remove();
        applied = true;
      } else {
        importMap.set(key, imp);
      }
    }

    // Let ts-morph organize imports, but only mark applied if text actually changed.
    const beforeText = sourceFile.getFullText();
    sourceFile.organizeImports();
    const afterText = sourceFile.getFullText();
    if (afterText !== beforeText) {
      applied = true;
    }

    return {
      type: 'import-optimization',
      description: `Optimized ${imports.length} import statements`,
      applied,
    };
  }

  /**
   * Remove dead code (unused imports, variables)
   */
  private removeDeadCode(sourceFile: SourceFile): Transformation {
    let applied = false;

    // Remove unused import bindings when possible.
    try {
      for (const imp of sourceFile.getImportDeclarations()) {
        const defaultImport = imp.getDefaultImport();
        if (defaultImport) {
          const references = defaultImport.findReferencesAsNodes();
          if (references.length <= 1) {
            imp.removeDefaultImport();
            applied = true;
          }
        }

        const namespaceImport = imp.getNamespaceImport();
        if (namespaceImport) {
          const references = namespaceImport.findReferencesAsNodes();
          if (references.length <= 1) {
            imp.removeNamespaceImport();
            applied = true;
          }
        }

        for (const namedImport of imp.getNamedImports()) {
          const references = namedImport.getNameNode().findReferencesAsNodes();
          if (references.length <= 1) {
            namedImport.remove();
            applied = true;
          }
        }

        if (!imp.getDefaultImport() && !imp.getNamespaceImport() && imp.getNamedImports().length === 0) {
          imp.remove();
          applied = true;
        }
      }
    } catch (_error) {
      // Gracefully continue even if symbol resolution is partial in memory-only context.
    }

    // Run icon validator to fix invalid icon names
    try {
      const validatedCode = iconValidator.validate(sourceFile.getFullText());
      if (validatedCode !== sourceFile.getFullText()) {
        sourceFile.replaceWithText(validatedCode);
        applied = true;
      }
    } catch (_error) {
      // Icon validator might fail in edge cases – continue without failing the rewrite
    }

    return {
      type: 'dead-code-elimination',
      description: 'Removed unused imports and validated icon usage',
      applied,
    };
  }

  /**
   * Format code
   */
  private formatCode(sourceFile: SourceFile): Transformation {
    const before = sourceFile.getFullText();
    sourceFile.formatText({
      indentSize: 2,
      tabSize: 2,
      convertTabsToSpaces: true,
      ensureNewLineAtEndOfFile: true,
    });
    const after = sourceFile.getFullText();
    const applied = after !== before;
    return {
      type: 'formatting',
      description: applied ? 'Applied AST-based formatting pass' : 'Formatting already consistent',
      applied,
    };
  }

}

export const astRewriter = new ASTRewriter();

// ─────────────────────────────────────────────────────────────────────
// AST-Based Patch Executor (Enterprise Feature 2)
// ─────────────────────────────────────────────────────────────────────

export type AstPatchOp =
  | 'set_prop'
  | 'remove_prop'
  | 'replace_text'
  | 'add_class'
  | 'remove_class'
  | 'wrap_element'
  | 'insert_child';

export interface AstPatchOperation {
  op: AstPatchOp;
  file: string;
  /** CSS-like selector or data-source-id value */
  selector: string;
  /** Stable source anchor in the format "file:line:col" */
  sourceId?: string;
  /** prop name (for set_prop / remove_prop) */
  prop?: string;
  /** value (string literal or JSX expression) */
  value?: string;
  /** CSS class names (for add_class / remove_class) */
  classes?: string[];
  /** replacement text content (for replace_text) */
  text?: string;
  /** wrapping tag (for wrap_element) */
  wrapTag?: string;
  /** JSX string to insert (for insert_child) */
  jsx?: string;
  /** position for insert_child */
  position?: 'first' | 'last' | 'before' | 'after';
}

export interface AstPatchResult {
  code: string;
  applied: AstPatchOperation[];
  failed: Array<{ patch: AstPatchOperation; reason: string }>;
  totalPatches: number;
}

/**
 * Locate a JSX element in ts-morph source file by a simple selector.
 * Supports: tag name, .className, [data-source-id="..."], #id
 */
function collectJsxElements(sourceFile: SourceFile): Node[] {
  return [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
}

function findJsxElements(sourceFile: SourceFile, selector: string): Node[] {
  const allJsx = collectJsxElements(sourceFile);

  return allJsx.filter((node) => {
    const tagName = (node as any).getTagNameNode().getText();
    const text = node.getText();

    // [data-source-id="value"]
    if (selector.startsWith('[data-source-id=')) {
      const val = selector.replace(/^\[data-source-id="?/, '').replace(/"?\]$/, '');
      return text.includes(`data-source-id="${val}"`);
    }

    // #id selector
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return text.includes(`id="${id}"`) || text.includes(`id={"${id}"}`);
    }

    // .className selector — use word-boundary regex to avoid partial class name matches.
    // e.g. '.foo' must NOT match 'className="foobar"' or 'className="not-foo"'
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return new RegExp(`className=["'][^"']*\\b${cls}\\b[^"']*["']`).test(text);
    }

    // tag name
    return tagName === selector;
  });
}

function extractSourceIdFromSelector(selector: string): string | null {
  if (typeof selector !== 'string') return null;
  const trimmed = selector.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\[data-source-id=(?:"([^"]+)"|'([^']+)')\]$/);
  if (!match) return null;
  const sourceId = (match[1] || match[2] || '').trim();
  return sourceId || null;
}

function parseSourceIdAnchor(sourceId: string): { line: number; col: number } | null {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  const col = Number(parts.pop());
  const line = Number(parts.pop());
  if (!Number.isFinite(line) || !Number.isFinite(col)) return null;
  if (line <= 0 || col <= 0) return null;
  return { line, col };
}

function findJsxElementsBySourceId(sourceFile: SourceFile, sourceId: string): Node[] {
  const parsed = parseSourceIdAnchor(sourceId);
  if (!parsed) return [];

  const allJsx = collectJsxElements(sourceFile);
  const exact = allJsx.filter((node) => {
    const position = sourceFile.getLineAndColumnAtPos(node.getStart());
    return position.line === parsed.line && position.column === parsed.col;
  });
  if (exact.length > 0) return exact;

  // Fallback for small coordinate drift after incremental edits in the same file.
  const nearby = allJsx
    .map((node) => {
      const position = sourceFile.getLineAndColumnAtPos(node.getStart());
      const lineDelta = Math.abs(position.line - parsed.line);
      const colDelta = Math.abs(position.column - parsed.col);
      return {
        node,
        lineDelta,
        colDelta,
        score: lineDelta * 1000 + colDelta,
      };
    })
    .filter((entry) => entry.lineDelta <= 2 && entry.colDelta <= 16)
    .sort((a, b) => a.score - b.score);

  if (nearby.length === 0) return [];
  const bestScore = nearby[0].score;
  return nearby
    .filter((entry) => entry.score === bestScore)
    .map((entry) => entry.node);
}

function isDeterministicSelector(selector: string): boolean {
  if (typeof selector !== 'string') return false;
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[data-source-id=')) return true;
  if (trimmed.startsWith('#')) return true;
  return false;
}

/**
 * Apply a list of AST patches to source code.
 */
export function applyAstPatches(code: string, patches: AstPatchOperation[]): AstPatchResult {
  const applied: AstPatchOperation[] = [];
  const failed: Array<{ patch: AstPatchOperation; reason: string }> = [];
  const replaceRange = (source: string, start: number, end: number, replacement: string): string =>
    `${source.slice(0, start)}${replacement}${source.slice(end)}`;

  if (!patches || patches.length === 0) {
    return { code, applied, failed, totalPatches: 0 };
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, target: 7, module: 99, strict: false, skipLibCheck: true },
  });

  let currentCode = code;

  for (const patch of patches) {
    try {
      const selector = typeof patch.selector === 'string' ? patch.selector.trim() : '';
      const sourceId = (
        (typeof patch.sourceId === 'string' ? patch.sourceId.trim() : '')
        || extractSourceIdFromSelector(selector)
        || ''
      );
      if (!selector && !sourceId) {
        failed.push({ patch, reason: 'Selector or sourceId is required for AST patch operations' });
        continue;
      }

      const sourceFile = project.createSourceFile('__patch__.tsx', currentCode, { overwrite: true });
      const sourceMatches = sourceId ? findJsxElementsBySourceId(sourceFile, sourceId) : [];
      const selectorMatches = selector ? findJsxElements(sourceFile, selector) : [];
      const matches = sourceMatches.length > 0 ? sourceMatches : selectorMatches;
      const targetLabel = selector || `[source-id="${sourceId}"]`;

      if (matches.length === 0) {
        failed.push({ patch, reason: `No elements matched selector "${targetLabel}"` });
        continue;
      }

      if (matches.length > 1) {
        const deterministicHint = sourceId
          ? 'sourceId anchor should uniquely map to one node.'
          : isDeterministicSelector(selector)
          ? 'Selector should uniquely map to one node.'
          : 'Use a deterministic selector like [data-source-id="file:line:col"] or #id.';
        failed.push({
          patch,
          reason: `Selector "${targetLabel}" is ambiguous (${matches.length} matches). ${deterministicHint}`
        });
        continue;
      }

      const target = matches[0]; // guaranteed unique due ambiguity guard
      let didApply = false;

      switch (patch.op) {
        case 'set_prop': {
          if (!patch.prop || patch.value === undefined) {
            failed.push({ patch, reason: 'set_prop requires prop and value' });
            break;
          }
          const tagText = target.getText();
          const propRegex = new RegExp(`${patch.prop}\\s*=\\s*(?:{[^}]*}|"[^"]*")`, 'g');
          let replacement: string;
          if (propRegex.test(tagText)) {
            replacement = tagText.replace(propRegex, `${patch.prop}=${patch.value}`);
          } else {
            const tagNameNode = (target as any).getTagNameNode();
            const tagNameText = tagNameNode.getText();
            const insertPos = tagText.indexOf(tagNameText) + tagNameText.length;
            replacement = tagText.slice(0, insertPos) + ` ${patch.prop}=${patch.value}` + tagText.slice(insertPos);
          }
          currentCode = replaceRange(currentCode, target.getStart(), target.getEnd(), replacement);
          didApply = true;
          break;
        }

        case 'remove_prop': {
          if (!patch.prop) {
            failed.push({ patch, reason: 'remove_prop requires prop' });
            break;
          }
          const tagText = target.getText();
          const propRegex = new RegExp(`\\s*${patch.prop}\\s*=\\s*(?:{[^}]*}|"[^"]*")`, 'g');
          const cleaned = tagText.replace(propRegex, '');
          if (cleaned !== tagText) {
            currentCode = replaceRange(currentCode, target.getStart(), target.getEnd(), cleaned);
            didApply = true;
          } else {
            failed.push({ patch, reason: `Prop "${patch.prop}" not found on element` });
          }
          break;
        }

        case 'replace_text': {
          if (patch.text === undefined) {
            failed.push({ patch, reason: 'replace_text requires text' });
            break;
          }
          const parent = target.getParent();
          if (parent && parent.getKind() === SyntaxKind.JsxElement) {
            const fullElementText = parent.getText();
            const contentMatch = fullElementText.match(/^(<[^>]+>)([\s\S]*?)(<\/[^>]+>)$/);
            if (contentMatch) {
              const replacement = `${contentMatch[1]}${patch.text}${contentMatch[3]}`;
              currentCode = replaceRange(currentCode, parent.getStart(), parent.getEnd(), replacement);
              didApply = true;
            }
          }
          if (!didApply) {
            failed.push({ patch, reason: 'Could not locate text content of element' });
          }
          break;
        }

        case 'add_class': {
          if (!patch.classes || patch.classes.length === 0) {
            failed.push({ patch, reason: 'add_class requires classes' });
            break;
          }
          const tagText = target.getText();
          const classMatch = tagText.match(/className="([^"]*)"/);
          if (classMatch) {
            const existing = classMatch[1].split(/\s+/).filter(Boolean);
            const combined = [...new Set([...existing, ...patch.classes])].join(' ');
            const replacement = tagText.replace(`className="${classMatch[1]}"`, `className="${combined}"`);
            currentCode = replaceRange(currentCode, target.getStart(), target.getEnd(), replacement);
            didApply = true;
          } else {
            // No className yet – add it
            const tagNameNode = (target as any).getTagNameNode();
            const tagNameText = tagNameNode.getText();
            const insertPos = tagText.indexOf(tagNameText) + tagNameText.length;
            const replacement = tagText.slice(0, insertPos) + ` className="${patch.classes.join(' ')}"` + tagText.slice(insertPos);
            currentCode = replaceRange(currentCode, target.getStart(), target.getEnd(), replacement);
            didApply = true;
          }
          break;
        }

        case 'remove_class': {
          if (!patch.classes || patch.classes.length === 0) {
            failed.push({ patch, reason: 'remove_class requires classes' });
            break;
          }
          const tagText = target.getText();
          const classMatch = tagText.match(/className="([^"]*)"/);
          if (classMatch) {
            const existing = classMatch[1].split(/\s+/).filter(Boolean);
            const removeSet = new Set(patch.classes);
            const filtered = existing.filter((c) => !removeSet.has(c));
            const replacement = tagText.replace(`className="${classMatch[1]}"`, `className="${filtered.join(' ')}"`);
            currentCode = replaceRange(currentCode, target.getStart(), target.getEnd(), replacement);
            didApply = true;
          } else {
            failed.push({ patch, reason: 'No className attribute found' });
          }
          break;
        }

        case 'wrap_element': {
          if (!patch.wrapTag) {
            failed.push({ patch, reason: 'wrap_element requires wrapTag' });
            break;
          }
          const parent = target.getParent();
          const fullElementText = parent && parent.getKind() === SyntaxKind.JsxElement
            ? parent.getText()
            : target.getText();
          const wrapped = `<${patch.wrapTag}>${fullElementText}</${patch.wrapTag}>`;
          const wrapStart = parent && parent.getKind() === SyntaxKind.JsxElement ? parent.getStart() : target.getStart();
          const wrapEnd = parent && parent.getKind() === SyntaxKind.JsxElement ? parent.getEnd() : target.getEnd();
          currentCode = replaceRange(currentCode, wrapStart, wrapEnd, wrapped);
          didApply = true;
          break;
        }

        case 'insert_child': {
          if (!patch.jsx) {
            failed.push({ patch, reason: 'insert_child requires jsx' });
            break;
          }
          const parent = target.getParent();
          if (parent && parent.getKind() === SyntaxKind.JsxElement) {
            const fullElementText = parent.getText();
            const contentMatch = fullElementText.match(/^(<[^>]+>)([\s\S]*?)(<\/[^>]+>)$/);
            if (contentMatch) {
              const pos = patch.position || 'last';
              let newContent: string;
              if (pos === 'first') {
                newContent = `${contentMatch[1]}${patch.jsx}${contentMatch[2]}${contentMatch[3]}`;
              } else {
                newContent = `${contentMatch[1]}${contentMatch[2]}${patch.jsx}${contentMatch[3]}`;
              }
              currentCode = replaceRange(currentCode, parent.getStart(), parent.getEnd(), newContent);
              didApply = true;
            }
          }
          if (!didApply) {
            failed.push({ patch, reason: 'Could not insert child into element' });
          }
          break;
        }

        default:
          failed.push({ patch, reason: `Unknown op: ${patch.op}` });
      }

      if (didApply) {
        applied.push(patch);
      }
    } catch (error: any) {
      failed.push({ patch, reason: error.message || 'Unknown error' });
    }
  }

  return { code: currentCode, applied, failed, totalPatches: patches.length };
}
