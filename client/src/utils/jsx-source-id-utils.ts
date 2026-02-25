/**
 * Shared JSX Source ID utilities.
 * Used both by the Vite plugin (dev/build) and by the in-browser preview bundler.
 */

/**
 * Resolve a data-source-id string back to file, line, col.
 */
export function resolveSourceId(sourceId: string): { file: string; line: number; col: number } | null {
  if (!sourceId || typeof sourceId !== 'string') return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  const col = parseInt(parts.pop() || '', 10);
  const line = parseInt(parts.pop() || '', 10);
  const file = parts.join(':'); // handles Windows paths with drive letters like C:
  if (Number.isNaN(line) || Number.isNaN(col)) return null;
  return { file, line, col };
}

/**
 * Regex-based JSX source ID injection.
 * Matches self-closing and opening JSX tags and injects data-source-id.
 * Works on .tsx/.jsx files only.
 */
export function injectJsxSourceIds(code: string, fileId: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    // Match JSX opening tags: <ComponentName or <div etc.
    // We look for < followed by an uppercase letter (components) or lowercase (HTML elements)
    // but NOT closing tags (</) or fragments (<>) or comments
    const tagRegex = /(<\s*)([A-Za-z][A-Za-z0-9_.]*)([\s>\/])/g;
    let match: RegExpExecArray | null;
    let modified = '';
    let lastIndex = 0;

    while ((match = tagRegex.exec(line)) !== null) {
      const tagStart = match.index;
      const openBracket = match[1]; // "<" or "< "
      const tagName = match[2];
      const afterTag = match[3];

      // Skip if this is inside a string, comment, or already has data-source-id
      const before = line.slice(0, tagStart);
      if (before.includes('//') || /data-source-id/.test(line.slice(tagStart, tagStart + 200))) {
        continue;
      }

      // CRITICAL: Skip mathematical comparison operators
      // If the '<' is preceded by an identifier, number, or closing brace/parenthesis, it's likely a comparison
      const beforeTrimmed = before.trimEnd();
      if (beforeTrimmed.length > 0) {
        const lastChar = beforeTrimmed[beforeTrimmed.length - 1];
        // Check for alphabetic (variable), numeric, or closing group chars
        if (/[a-zA-Z0-9_$)]/.test(lastChar)) {
          // But allow if it's a keyword like 'return', 'yield', etc.
          const recentText = beforeTrimmed.slice(-20);
          if (!/\b(return|yield|default|delete|typeof|void|await|case|as)$/.test(recentText)) {
            continue;
          }
        }
      }

      // CRITICAL: Skip TypeScript generics
      // match[3] (afterTag) contains the character immediately after the tag name
      // If it's ',', this is definitely a generic type parameter
      if (afterTag === ',') {
        continue;
      }

      // Check if tag is followed by |, or & (with optional whitespace) - indicates generic
      const textAfterTagName = line.slice(tagStart + openBracket.length + tagName.length);
      if (/^\s*[|&,]/.test(textAfterTagName)) {
        continue;
      }

      // Also check text after the entire match for generic operators
      const textAfterMatch = line.slice(tagStart + match[0].length);
      if (/^\s*[|&,]/.test(textAfterMatch)) {
        continue;
      }

      // Skip if < comes directly after an identifier (no space) - common pattern: createContext<, useState<, etc.
      const beforeMatch = before.trimEnd();
      if (beforeMatch.length > 0 && !openBracket.includes(' ')) {
        const lastChar = beforeMatch[beforeMatch.length - 1];
        // If last char is alphanumeric or underscore, check for common generic patterns
        if (/[a-zA-Z0-9_]/.test(lastChar)) {
          const recentText = beforeMatch.slice(-80);
          // Extended list of generic patterns including ChangeEvent, Node, Edge, and React types
          if (/\b(ChangeEvent|Node|Edge|React\.ChangeEvent|React\.SyntheticEvent|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement|createContext|useState|useRef|useCallback|useMemo|React\.FC|React\.Component|Array|Promise|Record|Partial|Pick|Omit|keyof|typeof|useEffect|useContext|useReducer|Dispatch|SetStateAction|Map|Set|Readonly|TableNodeData|EdgeData)\s*$/.test(recentText)) {
            continue;
          }
        }
      }

      // React Fragments cannot receive arbitrary props (only key/children)
      // so never inject data-source-id on them.
      if (
        tagName === 'Fragment' ||
        tagName === 'React.Fragment' ||
        tagName.endsWith('.Fragment')
      ) {
        continue;
      }

      const sourceId = `${fileId}:${lineIndex + 1}:${tagStart + 1}`;
      const injection = `${openBracket}${tagName} data-source-id="${sourceId}"${afterTag}`;

      modified += line.slice(lastIndex, tagStart) + injection;
      lastIndex = tagStart + match[0].length;
    }

    if (lastIndex > 0) {
      modified += line.slice(lastIndex);
      result.push(modified);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}
