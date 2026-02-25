import { Project, SourceFile } from 'ts-morph';

/**
 * Style DNA Injector - Phase 3 Component 4
 * Analyzes existing code style and injects consistent style into new code
 */

export interface StyleDNA {
  namingConventions: {
    components: 'PascalCase' | 'camelCase' | 'kebab-case';
    functions: 'camelCase' | 'PascalCase';
    variables: 'camelCase' | 'snake_case';
    constants: 'UPPER_SNAKE_CASE' | 'camelCase';
  };
  codeStructure: {
    importOrder: string[]; // Order of import groups
    componentStructure: 'inline' | 'separated'; // Props, state, effects, handlers, render
    spacing: 'compact' | 'standard' | 'loose';
  };
  patterns: {
    hooks: 'custom' | 'standard' | 'mixed';
    stateManagement: 'useState' | 'useReducer' | 'context' | 'external';
    styling: 'tailwind' | 'css-modules' | 'styled-components' | 'inline';
  };
  preferences: {
    useTypeScript: boolean;
    useJSDoc: boolean;
    useExplicitTypes: boolean;
    preferArrowFunctions: boolean;
  };
}

export interface StyleInjectionResult {
  code: string;
  styleApplied: boolean;
  changes: string[];
}

export class StyleDNAInjector {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: 4,
        target: 7,
        module: 99,
        strict: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * Extract style DNA from existing code
   */
  async extractStyleDNA(existingCode: Record<string, string>): Promise<StyleDNA> {
    if (Object.keys(existingCode).length === 0) {
      return this.getDefaultStyleDNA();
    }

    try {
      // Analyze first few files to extract style
      const sampleFiles = Object.entries(existingCode).slice(0, 3);
      const styleDNA: Partial<StyleDNA> = {
        namingConventions: this.analyzeNamingConventions(sampleFiles),
        codeStructure: this.analyzeCodeStructure(sampleFiles),
        patterns: this.analyzePatterns(sampleFiles),
        preferences: this.analyzePreferences(sampleFiles),
      };

      return {
        ...this.getDefaultStyleDNA(),
        ...styleDNA,
      } as StyleDNA;
    } catch (error: any) {
      console.warn('[StyleDNAInjector] Failed to extract style DNA:', error.message);
      return this.getDefaultStyleDNA();
    }
  }

  /**
   * Inject style DNA into code
   */
  async injectStyle(code: string, styleDNA: StyleDNA, fileName: string = 'App.tsx'): Promise<StyleInjectionResult> {
    try {
      const sourceFile = this.project.createSourceFile(fileName, code, { overwrite: true });
      const changes: string[] = [];

      // 1. Apply naming conventions
      const namingChanges = this.applyNamingConventions(sourceFile, styleDNA.namingConventions);
      if (namingChanges.length > 0) {
        changes.push(...namingChanges);
      }

      // 2. Apply code structure
      const structureChanges = this.applyCodeStructure(sourceFile, styleDNA.codeStructure);
      if (structureChanges.length > 0) {
        changes.push(...structureChanges);
      }

      // 3. Apply patterns
      const patternChanges = this.applyPatterns(sourceFile, styleDNA.patterns);
      if (patternChanges.length > 0) {
        changes.push(...patternChanges);
      }

      // 4. Apply preferences
      const preferenceChanges = this.applyPreferences(sourceFile, styleDNA.preferences);
      if (preferenceChanges.length > 0) {
        changes.push(...preferenceChanges);
      }

      return {
        code: sourceFile.getFullText(),
        styleApplied: changes.length > 0,
        changes,
      };
    } catch (error: any) {
      console.warn('[StyleDNAInjector] Failed to inject style:', error.message);
      return {
        code,
        styleApplied: false,
        changes: [],
      };
    }
  }

  /**
   * Analyze naming conventions
   */
  private analyzeNamingConventions(files: Array<[string, string]>): StyleDNA['namingConventions'] {
    const conventions: StyleDNA['namingConventions'] = {
      components: 'PascalCase',
      functions: 'camelCase',
      variables: 'camelCase',
      constants: 'UPPER_SNAKE_CASE',
    };

    // Analyze component names
    files.forEach(([path, content]) => {
      // Check component naming
      const componentMatch = content.match(/(?:function|const)\s+([A-Z][a-zA-Z0-9]+)/);
      if (componentMatch) {
        conventions.components = 'PascalCase';
      }

      // Check function naming
      const functionMatch = content.match(/(?:function|const)\s+([a-z][a-zA-Z0-9]+)\s*[=\(]/);
      if (functionMatch) {
        conventions.functions = 'camelCase';
      }
    });

    return conventions;
  }

  /**
   * Analyze code structure
   */
  private analyzeCodeStructure(files: Array<[string, string]>): StyleDNA['codeStructure'] {
    return {
      importOrder: ['react', 'lucide-react', 'other'],
      componentStructure: 'separated',
      spacing: 'standard',
    };
  }

  /**
   * Analyze patterns
   */
  private analyzePatterns(files: Array<[string, string]>): StyleDNA['patterns'] {
    const patterns: StyleDNA['patterns'] = {
      hooks: 'standard',
      stateManagement: 'useState',
      styling: 'tailwind',
    };

    files.forEach(([path, content]) => {
      if (content.includes('useState')) {
        patterns.stateManagement = 'useState';
      }
      if (content.includes('useReducer')) {
        patterns.stateManagement = 'useReducer';
      }
      if (content.includes('className=') && content.includes('bg-')) {
        patterns.styling = 'tailwind';
      }
      if (content.includes('styled.')) {
        patterns.styling = 'styled-components';
      }
    });

    return patterns;
  }

  /**
   * Analyze preferences
   */
  private analyzePreferences(files: Array<[string, string]>): StyleDNA['preferences'] {
    const preferences: StyleDNA['preferences'] = {
      useTypeScript: true,
      useJSDoc: false,
      useExplicitTypes: false,
      preferArrowFunctions: false,
    };

    files.forEach(([path, content]) => {
      if (path.endsWith('.tsx') || path.endsWith('.ts')) {
        preferences.useTypeScript = true;
      }
      if (content.includes('/**') || content.includes('* @')) {
        preferences.useJSDoc = true;
      }
      if (content.includes(': string') || content.includes(': number')) {
        preferences.useExplicitTypes = true;
      }
      if (content.match(/const\s+\w+\s*=\s*\(/)) {
        preferences.preferArrowFunctions = true;
      }
    });

    return preferences;
  }

  /**
   * Apply naming conventions
   */
  private applyNamingConventions(
    sourceFile: SourceFile,
    conventions: StyleDNA['namingConventions']
  ): string[] {
    const changes: string[] = [];
    const toPascalCase = (value: string): string =>
      value
        .replace(/[_\-\s]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

    if (conventions.components === 'PascalCase') {
      const defaultFunction = sourceFile.getFunctions().find((fn) => fn.isDefaultExport());
      if (defaultFunction) {
        const currentName = defaultFunction.getName();
        if (currentName && /^[a-z]/.test(currentName)) {
          const nextName = toPascalCase(currentName);
          if (nextName && nextName !== currentName) {
            defaultFunction.rename(nextName);
            changes.push(`Renamed default component "${currentName}" to "${nextName}"`);
          }
        }
      }

      const exportAssignment = sourceFile.getExportAssignments().find((entry) => !entry.isExportEquals());
      const defaultIdentifier = exportAssignment?.getExpression()?.getText();
      if (defaultIdentifier && /^[a-z]/.test(defaultIdentifier)) {
        const variableDeclaration = sourceFile.getVariableDeclaration(defaultIdentifier);
        if (variableDeclaration) {
          const nextName = toPascalCase(defaultIdentifier);
          if (nextName && nextName !== defaultIdentifier) {
            variableDeclaration.rename(nextName);
            changes.push(`Renamed exported identifier "${defaultIdentifier}" to "${nextName}"`);
          }
        }
      }
    }

    return changes;
  }

  /**
   * Apply code structure
   */
  private applyCodeStructure(
    sourceFile: SourceFile,
    structure: StyleDNA['codeStructure']
  ): string[] {
    const changes: string[] = [];

    const beforeOrganize = sourceFile.getFullText();
    sourceFile.organizeImports();
    if (sourceFile.getFullText() !== beforeOrganize) {
      changes.push('Organized imports according to project conventions');
    }

    const beforeFormat = sourceFile.getFullText();
    sourceFile.formatText({
      indentSize: 2,
      tabSize: 2,
      convertTabsToSpaces: true,
      ensureNewLineAtEndOfFile: true,
    });
    if (sourceFile.getFullText() !== beforeFormat) {
      changes.push('Formatted source for consistent indentation and spacing');
    }

    if (structure.spacing === 'compact') {
      const beforeCompact = sourceFile.getFullText();
      const compact = beforeCompact.replace(/\n{3,}/g, '\n\n');
      if (compact !== beforeCompact) {
        sourceFile.replaceWithText(compact);
        changes.push('Reduced excessive blank lines (compact spacing)');
      }
    }

    return changes;
  }

  /**
   * Apply patterns
   */
  private applyPatterns(sourceFile: SourceFile, patterns: StyleDNA['patterns']): string[] {
    const changes: string[] = [];

    let next = sourceFile.getFullText();

    if (patterns.styling === 'tailwind') {
      const classToClassName = next.replace(/(\s)class="([^"]*)"/g, '$1className="$2"');
      if (classToClassName !== next) {
        next = classToClassName;
        changes.push('Converted HTML class attributes to React className');
      }
    }

    if (patterns.stateManagement === 'useState' && /\bReact\.useState\(/.test(next)) {
      next = next.replace(/\bReact\.useState\(/g, 'useState(');
      changes.push('Normalized React.useState calls to direct useState imports');
    }

    if (next !== sourceFile.getFullText()) {
      sourceFile.replaceWithText(next);

      if (patterns.stateManagement === 'useState') {
        const reactImport = sourceFile.getImportDeclaration((decl) => decl.getModuleSpecifierValue() === 'react');
        if (reactImport) {
          const hasUseState = reactImport.getNamedImports().some((entry) => entry.getName() === 'useState');
          if (!hasUseState) {
            reactImport.addNamedImport('useState');
            changes.push('Added useState import from react');
          }
        }
      }
    }

    return changes;
  }

  /**
   * Apply preferences
   */
  private applyPreferences(sourceFile: SourceFile, preferences: StyleDNA['preferences']): string[] {
    const changes: string[] = [];

    if (preferences.useJSDoc) {
      const defaultFunction = sourceFile.getFunctions().find((fn) => fn.isDefaultExport());
      if (defaultFunction && defaultFunction.getJsDocs().length === 0) {
        defaultFunction.addJsDoc({
          description: 'Auto-generated component aligned with project style DNA.',
        });
        changes.push('Added JSDoc to default component export');
      }
    }

    if (preferences.useExplicitTypes && sourceFile.getBaseName().endsWith('.tsx')) {
      sourceFile.getFunctions().forEach((fn) => {
        const name = fn.getName() || '';
        const isComponentLike = fn.isDefaultExport() || /^[A-Z]/.test(name);
        if (!isComponentLike) return;
        if (fn.getReturnTypeNode()) return;
        fn.setReturnType('JSX.Element');
        changes.push(`Added explicit return type to ${name || 'default component function'}`);
      });
    }

    return changes;
  }

  /**
   * Get default style DNA
   */
  private getDefaultStyleDNA(): StyleDNA {
    return {
      namingConventions: {
        components: 'PascalCase',
        functions: 'camelCase',
        variables: 'camelCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      codeStructure: {
        importOrder: ['react', 'lucide-react', 'other'],
        componentStructure: 'separated',
        spacing: 'standard',
      },
      patterns: {
        hooks: 'standard',
        stateManagement: 'useState',
        styling: 'tailwind',
      },
      preferences: {
        useTypeScript: true,
        useJSDoc: false,
        useExplicitTypes: true,
        preferArrowFunctions: true,
      },
    };
  }
}

export const styleDNAInjector = new StyleDNAInjector();
