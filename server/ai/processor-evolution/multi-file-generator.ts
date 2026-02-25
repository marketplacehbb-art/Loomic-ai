import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';

/**
 * Multi File Generator - Phase 2 Component 3
 * Generates structured multi-file code with intelligent file splitting
 */

export interface FileDefinition {
  path: string;
  type: 'component' | 'hook' | 'util' | 'type' | 'style' | 'config';
  content: string;
  purpose: string;
  dependencies: string[];
}

export interface MultiFileResult {
  files: FileDefinition[];
  structure: {
    root: string;
    components: string[];
    hooks: string[];
    utils: string[];
    types: string[];
  };
}

export class MultiFileGenerator {
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
   * Generate multi-file structure from code
   */
  async generate(code: string, mainFileName: string = 'App.tsx'): Promise<MultiFileResult> {
    try {
      const sourceFile = this.project.createSourceFile(mainFileName, code, { overwrite: true });
      const files: FileDefinition[] = [];

      // 1. Extract components
      const components = this.extractComponents(sourceFile);
      components.forEach(comp => {
        files.push({
          path: `components/${comp.name}.tsx`,
          type: 'component',
          content: comp.content,
          purpose: comp.purpose,
          dependencies: comp.dependencies,
        });
      });

      // 2. Extract hooks
      const hooks = this.extractHooks(sourceFile);
      hooks.forEach(hook => {
        files.push({
          path: `hooks/${hook.name}.ts`,
          type: 'hook',
          content: hook.content,
          purpose: hook.purpose,
          dependencies: hook.dependencies,
        });
      });

      // 3. Extract utilities
      const utils = this.extractUtils(sourceFile);
      utils.forEach(util => {
        files.push({
          path: `utils/${util.name}.ts`,
          type: 'util',
          content: util.content,
          purpose: util.purpose,
          dependencies: util.dependencies,
        });
      });

      // 4. Extract types
      const types = this.extractTypes(sourceFile);
      types.forEach(type => {
        files.push({
          path: `types/${type.name}.ts`,
          type: 'type',
          content: type.content,
          purpose: type.purpose,
          dependencies: type.dependencies,
        });
      });

      // 5. Create main App.tsx with imports
      const mainContent = this.createMainFile(sourceFile, components, hooks, utils, types);
      files.unshift({
        path: 'App.tsx',
        type: 'component',
        content: mainContent,
        purpose: 'Root application component',
        dependencies: [],
      });

      // 6. Generate package.json if needed
      const dependencies = this.extractDependencies(sourceFile);
      if (dependencies.length > 0) {
        files.push({
          path: 'package.json',
          type: 'config',
          content: this.createPackageJson(dependencies),
          purpose: 'Project dependencies',
          dependencies: [],
        });
      }

      return {
        files,
        structure: {
          root: 'App.tsx',
          components: components.map(c => c.name),
          hooks: hooks.map(h => h.name),
          utils: utils.map(u => u.name),
          types: types.map(t => t.name),
        },
      };
    } catch (error: any) {
      console.warn('[MultiFileGenerator] Failed to generate multi-file structure:', error.message);
      // Fallback: Return single file
      return {
        files: [{
          path: mainFileName,
          type: 'component',
          content: code,
          purpose: 'Main application file',
          dependencies: [],
        }],
        structure: {
          root: mainFileName,
          components: [],
          hooks: [],
          utils: [],
          types: [],
        },
      };
    }
  }

  /**
   * Extract React components from code
   */
  private extractComponents(sourceFile: SourceFile): Array<{ name: string; content: string; purpose: string; dependencies: string[] }> {
    const components: Array<{ name: string; content: string; purpose: string; dependencies: string[] }> = [];
    
    // Find function components and arrow function components
    const functions = sourceFile.getFunctions();
    const variables = sourceFile.getVariableDeclarations();

    // Function components: function ComponentName() {}
    functions.forEach(func => {
      const name = func.getName();
      if (name && /^[A-Z]/.test(name)) {
        // Likely a component
        const content = this.extractFunctionContent(func);
        if (content.includes('return') && (content.includes('JSX') || content.includes('<'))) {
          components.push({
            name,
            content: this.wrapComponent(name, content, sourceFile),
            purpose: `React component: ${name}`,
            dependencies: this.extractImports(sourceFile),
          });
        }
      }
    });

    // Arrow function components: const ComponentName = () => {}
    variables.forEach(variable => {
      const name = variable.getName();
      if (name && /^[A-Z]/.test(name)) {
        const initializer = variable.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
          const content = initializer.getText();
          if (content.includes('return') && (content.includes('JSX') || content.includes('<'))) {
            components.push({
              name,
              content: this.wrapComponent(name, content, sourceFile),
              purpose: `React component: ${name}`,
              dependencies: this.extractImports(sourceFile),
            });
          }
        }
      }
    });

    return components;
  }

  /**
   * Extract custom hooks
   */
  private extractHooks(sourceFile: SourceFile): Array<{ name: string; content: string; purpose: string; dependencies: string[] }> {
    const hooks: Array<{ name: string; content: string; purpose: string; dependencies: string[] }> = [];
    
    const functions = sourceFile.getFunctions();
    const variables = sourceFile.getVariableDeclarations();

    // Function hooks: function useHookName() {}
    functions.forEach(func => {
      const name = func.getName();
      if (name && name.startsWith('use') && /^[a-z]/.test(name[2])) {
        hooks.push({
          name,
          content: this.wrapHook(name, func.getText(), sourceFile),
          purpose: `Custom hook: ${name}`,
          dependencies: this.extractImports(sourceFile),
        });
      }
    });

    // Arrow function hooks: const useHookName = () => {}
    variables.forEach(variable => {
      const name = variable.getName();
      if (name && name.startsWith('use') && /^[a-z]/.test(name[2])) {
        hooks.push({
          name,
          content: this.wrapHook(name, variable.getText(), sourceFile),
          purpose: `Custom hook: ${name}`,
          dependencies: this.extractImports(sourceFile),
        });
      }
    });

    return hooks;
  }

  /**
   * Extract utility functions
   */
  private extractUtils(sourceFile: SourceFile): Array<{ name: string; content: string; purpose: string; dependencies: string[] }> {
    const utils: Array<{ name: string; content: string; purpose: string; dependencies: string[] }> = [];
    
    const functions = sourceFile.getFunctions();
    
    functions.forEach(func => {
      const name = func.getName();
      // Utility functions: lowercase, not hooks, not components
      if (name && /^[a-z]/.test(name) && !name.startsWith('use')) {
        utils.push({
          name,
          content: this.wrapUtil(name, func.getText(), sourceFile),
          purpose: `Utility function: ${name}`,
          dependencies: this.extractImports(sourceFile),
        });
      }
    });

    return utils;
  }

  /**
   * Extract TypeScript types and interfaces
   */
  private extractTypes(sourceFile: SourceFile): Array<{ name: string; content: string; purpose: string; dependencies: string[] }> {
    const types: Array<{ name: string; content: string; purpose: string; dependencies: string[] }> = [];
    
    const interfaces = sourceFile.getInterfaces();
    const typeAliases = sourceFile.getTypeAliases();

    interfaces.forEach(interf => {
      types.push({
        name: interf.getName(),
        content: this.wrapType(interf.getText(), sourceFile),
        purpose: `TypeScript interface: ${interf.getName()}`,
        dependencies: this.extractImports(sourceFile),
      });
    });

    typeAliases.forEach(typeAlias => {
      types.push({
        name: typeAlias.getName(),
        content: this.wrapType(typeAlias.getText(), sourceFile),
        purpose: `TypeScript type: ${typeAlias.getName()}`,
        dependencies: this.extractImports(sourceFile),
      });
    });

    return types;
  }

  /**
   * Extract dependencies from imports
   */
  private extractDependencies(sourceFile: SourceFile): string[] {
    const dependencies: string[] = [];
    const imports = sourceFile.getImportDeclarations();

    imports.forEach(imp => {
      const specifier = imp.getModuleSpecifierValue();
      // External dependencies (not relative imports)
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        const pkg = specifier.split('/')[0];
        if (!dependencies.includes(pkg)) {
          dependencies.push(pkg);
        }
      }
    });

    return dependencies;
  }

  /**
   * Extract imports from source file
   */
  private extractImports(sourceFile: SourceFile): string[] {
    return sourceFile.getImportDeclarations().map(imp => imp.getModuleSpecifierValue());
  }

  /**
   * Wrap component with necessary imports
   */
  private wrapComponent(name: string, content: string, sourceFile: SourceFile): string {
    const imports = this.getRequiredImports(sourceFile);
    return `${imports}\n\nexport default function ${name}() {\n${content}\n}`;
  }

  /**
   * Wrap hook with necessary imports
   */
  private wrapHook(name: string, content: string, sourceFile: SourceFile): string {
    const imports = this.getRequiredImports(sourceFile, ['react']);
    return `${imports}\n\nexport function ${name}() {\n${content}\n}`;
  }

  /**
   * Wrap utility function
   */
  private wrapUtil(name: string, content: string, sourceFile: SourceFile): string {
    const imports = this.getRequiredImports(sourceFile);
    return `${imports}\n\nexport function ${name}() {\n${content}\n}`;
  }

  /**
   * Wrap type definition
   */
  private wrapType(content: string, sourceFile: SourceFile): string {
    const imports = this.getRequiredImports(sourceFile);
    return `${imports}\n\n${content}`;
  }

  /**
   * Get required imports
   */
  private getRequiredImports(sourceFile: SourceFile, required: string[] = ['react']): string {
    const imports = sourceFile.getImportDeclarations();
    const importLines: string[] = [];

    required.forEach(req => {
      if (req === 'react') {
        importLines.push("import React from 'react';");
      }
    });

    // Add other imports that might be needed
    imports.forEach(imp => {
      const specifier = imp.getModuleSpecifierValue();
      if (specifier.includes('lucide-react')) {
        const namedImports = imp.getNamedImports().map(n => n.getName()).join(', ');
        if (namedImports) {
          importLines.push(`import { ${namedImports} } from 'lucide-react';`);
        }
      }
    });

    return importLines.join('\n');
  }

  /**
   * Create main App.tsx file with imports
   */
  private createMainFile(
    sourceFile: SourceFile,
    components: Array<{ name: string }>,
    hooks: Array<{ name: string }>,
    utils: Array<{ name: string }>,
    types: Array<{ name: string }>
  ): string {
    const imports: string[] = ["import React from 'react';"];
    
    components.forEach(comp => {
      imports.push(`import ${comp.name} from './components/${comp.name}';`);
    });

    hooks.forEach(hook => {
      imports.push(`import { ${hook.name} } from './hooks/${hook.name}';`);
    });

    utils.forEach(util => {
      imports.push(`import { ${util.name} } from './utils/${util.name}';`);
    });

    // Get original App component content
    const originalContent = sourceFile.getFullText();
    
    return `${imports.join('\n')}\n\n${originalContent}`;
  }

  /**
   * Create package.json
   */
  private createPackageJson(dependencies: string[]): string {
    const pkg = {
      name: 'generated-app',
      version: '1.0.0',
      dependencies: {} as Record<string, string>,
    };

    dependencies.forEach(dep => {
      // Default versions (could be improved)
      if (dep === 'react') pkg.dependencies[dep] = '^18.3.1';
      else if (dep === 'react-dom') pkg.dependencies[dep] = '^18.3.1';
      else if (dep === 'lucide-react') pkg.dependencies[dep] = '^0.344.0';
      else pkg.dependencies[dep] = 'latest';
    });

    return JSON.stringify(pkg, null, 2);
  }

  /**
   * Extract function content
   */
  private extractFunctionContent(func: any): string {
    const body = func.getBody();
    return body ? body.getText() : '';
  }
}

export const multiFileGenerator = new MultiFileGenerator();
