import { build } from 'esbuild';
import { Project, DiagnosticCategory } from 'ts-morph';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import { iconRegistry } from './icon-registry.js';
import { iconValidator } from '../ai/code-pipeline/icon-validator.js';
import { navigationTransformer } from '../ai/code-pipeline/navigation-transformer.js';
import { parseLLMOutput } from '../ai/project-pipeline/llm-response-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ProcessedFile {
  path: string;
  content: string;
  type: 'jsx' | 'tsx' | 'css' | 'json' | 'html';
  size?: number;
}

export interface ProcessedCode {
  files: ProcessedFile[];
  dependencies: Record<string, string>;
  errors: string[];
  warnings: string[];
  components: string[];
  metadata: {
    processedAt: string;
    processingTime: number;
    fileCount: number;
    hasErrors: boolean;
  };
}

class CodeProcessor {
  private project: Project;
  private defaultPackageVersions: Record<string, string> = {
    'react': '^18.3.1',
    'react-dom': '^18.3.1',
    'react-router-dom': '^6.30.3',
    'lucide-react': '^0.263.1',
    'typescript': '^5.6.3',
    'tailwindcss': '^3.4.11',
    'next': '^14.0.0',
    'zustand': '^4.4.0',
    'axios': '^1.6.0',
    'react-confetti': '^6.1.0',
    'clsx': '^2.0.0',
    'date-fns': '^2.30.0'
  };

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: 4, // JsxEmit.ReactJSX
        target: 7, // ScriptTarget.ES2020
        module: 99, // ModuleKind.ESNext
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 100, // ModuleResolutionKind.Bundler
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        baseUrl: "/",
        paths: {
          "react": ["/node_modules/react/index.d.ts"],
          "react-dom": ["/node_modules/react-dom/index.d.ts"],
          "react-router-dom": ["/node_modules/react-router-dom/index.d.ts"],
          "react/jsx-runtime": ["/node_modules/react/jsx-runtime.d.ts"],
          "react/jsx-dev-runtime": ["/node_modules/react/jsx-dev-runtime.d.ts"]
        },
        types: [],
        typeRoots: []
      },
    });

    const fsHost = this.project.getFileSystem();

    // Explicitly create core directories in the virtual FS
    try {
      if (!fsHost.directoryExists("/node_modules")) fsHost.mkdirSync("/node_modules");
      if (!fsHost.directoryExists("/node_modules/@types")) fsHost.mkdirSync("/node_modules/@types");
      if (!fsHost.directoryExists("/node_modules/typescript")) fsHost.mkdirSync("/node_modules/typescript");
      if (!fsHost.directoryExists("/node_modules/typescript/lib")) fsHost.mkdirSync("/node_modules/typescript/lib");
      console.log('📂 Virtual directories initialized');
      this.project.createSourceFile('/node_modules/react-router-dom/index.d.ts', `
declare module 'react-router-dom' {
  import * as React from 'react';
  export interface RouteProps {
    path?: string;
    element?: React.ReactNode;
    children?: React.ReactNode;
    index?: boolean;
  }
  export const BrowserRouter: React.FC<{ children?: React.ReactNode }>;
  export const HashRouter: React.FC<{ children?: React.ReactNode }>;
  export const MemoryRouter: React.FC<{ children?: React.ReactNode; initialEntries?: string[] }>;
  export const Routes: React.FC<{ children?: React.ReactNode }>;
  export const Route: React.FC<RouteProps>;
  export const Navigate: React.FC<{ to: string; replace?: boolean }>;
  export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>;
  export const NavLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>;
  export function useNavigate(): (to: string) => void;
  export function useLocation(): { pathname: string; search: string; hash: string };
}
`, { overwrite: true });
    } catch (e) {
      console.warn('⚠️ Could not initialize virtual directories:', e);
    }

    // Load React and standard types if available (ESM compatible)
    try {
      const nodeModulesPath = join(process.cwd(), 'node_modules');

      // 1. Load TypeScript Standard Libraries
      const tsPath = join(nodeModulesPath, 'typescript/lib');
      if (fs.existsSync(tsPath)) {
        const libs = ['lib.es2020.full.d.ts', 'lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.es5.d.ts', 'lib.es6.d.ts'];
        libs.forEach(lib => {
          const fullPath = join(tsPath, lib);
          if (fs.existsSync(fullPath)) {
            this.project.createSourceFile(`/node_modules/typescript/lib/${lib}`, fs.readFileSync(fullPath, 'utf8'), { overwrite: true });
          }
        });
        console.log('✅ Loaded TS standard libs into memory');
      }

      // 2. Load React Types & Metadata
      const reactTypesPath = join(nodeModulesPath, '@types/react/index.d.ts');
      const reactDomTypesPath = join(nodeModulesPath, '@types/react-dom/index.d.ts');

      // Inject virtual package.json to help module resolution
      this.project.createSourceFile('/node_modules/react/package.json', JSON.stringify({ name: "react", version: "18.3.1", main: "./index.d.ts", types: "./index.d.ts" }), { overwrite: true });

      if (fs.existsSync(reactTypesPath)) {
        this.project.createSourceFile('/node_modules/react/index.d.ts', fs.readFileSync(reactTypesPath, 'utf8'), { overwrite: true });
        this.project.createSourceFile('/node_modules/@types/react/index.d.ts', fs.readFileSync(reactTypesPath, 'utf8'), { overwrite: true });

        // Also load jsx-runtime types for react-jsx mode
        const jsxRuntimePath = join(nodeModulesPath, '@types/react/jsx-runtime.d.ts');
        const jsxDevRuntimePath = join(nodeModulesPath, '@types/react/jsx-dev-runtime.d.ts');

        if (fs.existsSync(jsxRuntimePath)) {
          this.project.createSourceFile('/node_modules/react/jsx-runtime.d.ts', fs.readFileSync(jsxRuntimePath, 'utf8'), { overwrite: true });
        }
        if (fs.existsSync(jsxDevRuntimePath)) {
          this.project.createSourceFile('/node_modules/react/jsx-dev-runtime.d.ts', fs.readFileSync(jsxDevRuntimePath, 'utf8'), { overwrite: true });
        }

        console.log('✅ Loaded @types/react and jsx-runtime into memory');
      }
      if (fs.existsSync(reactDomTypesPath)) {
        this.project.createSourceFile('/node_modules/react-dom/index.d.ts', fs.readFileSync(reactDomTypesPath, 'utf8'), { overwrite: true });
        this.project.createSourceFile('/node_modules/@types/react-dom/index.d.ts', fs.readFileSync(reactDomTypesPath, 'utf8'), { overwrite: true });
        console.log('✅ Loaded @types/react-dom into memory');
      }
    } catch (e) {
      console.warn('⚠️ Could not load types into memory:', e);
    }

    console.log('✅ CodeProcessor initialized');
  }

  /**
   * Prevent invalid hook usage caused by invoking React components at module scope.
   * Common bad pattern from LLMs: `export default App();`
   */
  private looksLikeFullHtmlDocument(code: string): boolean {
    if (!code || typeof code !== 'string') return false;
    const hasDoctype = /<!doctype\s+html/i.test(code);
    const hasHtmlTag = /<html[\s>]/i.test(code);
    const hasHeadTag = /<head[\s>]/i.test(code);
    const hasBodyTag = /<body[\s>]/i.test(code);
    return hasDoctype || (hasHtmlTag && (hasHeadTag || hasBodyTag));
  }

  private sanitizeInvalidComponentInvocations(code: string): string {
    let next = code;

    next = next.replace(
      /export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*\)\s*;?/g,
      'export default $1;'
    );

    const componentNames = new Set<string>();
    for (const match of next.matchAll(/\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
      if (match[1]) componentNames.add(match[1]);
    }
    for (const match of next.matchAll(/\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
      if (match[1]) componentNames.add(match[1]);
    }

    if (componentNames.size === 0) return next;

    for (const name of componentNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const standaloneCall = new RegExp(`^\\s*(?:void\\s+)?${escaped}\\s*\\(\\s*\\)\\s*;\\s*$`, 'gm');
      next = next.replace(standaloneCall, '');
    }

    return next;
  }

  /**
   * Remove react-router-dom dependencies and replace with state-based navigation
   */
  private removeRouterImports(code: string): string {
    // Remove react-router-dom and react-router imports
    code = code.replace(/import\s+.*\s+from\s+['"]react-router-dom['"];?\r?\n/g, '');
    code = code.replace(/import\s+.*\s+from\s+['"]react-router['"];?\r?\n/g, '');

    // Replace <Link to="X"> with <button onClick={() => setView('X')}>
    code = code.replace(/<Link\s+to=["']([^"']+)["']([^>]*)>/g,
      '<button onClick={() => setView("$1")}$2>');
    code = code.replace(/<\/Link>/g, '</button>');

    // Replace useNavigate hook
    code = code.replace(/const\s+navigate\s*=\s*useNavigate\(\);?\r?\n/g, '');
    code = code.replace(/navigate\s*\(\s*["']([^"']+)["']\s*\)/g, 'setView("$1")');

    // Replace <Navigate to="X" /> with comment
    code = code.replace(/<Navigate\s+to=["'][^"']+["']\s*\/>/g, '{/* Navigation removed */}');

    // Replace <Route> and <Routes> components
    if (code.includes('<Routes>') || code.includes('<Route')) {
      code = code.replace(/<Routes>/g, '{/* Use conditional rendering instead */}');
      code = code.replace(/<\/Routes>/g, '');
      code = code.replace(/<Route\s+[^>]*\/>/g, '');
      code = code.replace(/<Route\s+[^>]*>.*?<\/Route>/gs, '');
    }

    // Add useState if setView is used but useState not imported
    if (code.includes('setView') && !code.includes('useState')) {
      // Add useState to React import
      code = code.replace(
        /import React(,?\s*{([^}]*)})?(\s+from\s+['"]react['"])/,
        (match, p1, p2) => {
          if (p2 && p2.includes('useState')) {
            return match;
          } else if (p2) {
            return `import React, { useState, ${p2.trim()} } from 'react'`;
          } else {
            return `import React, { useState } from 'react'`;
          }
        }
      );

      // Add view state hook at start of component
      code = code.replace(
        /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*{)/,
        "$1\n  const [view, setView] = React.useState('home');"
      );
    }

    return code;
  }

  /**
   * Fix missing imports for lucide-react icons
   * Detects JSX elements that look like icon components and ensures they are imported
   */
  private fixMissingImports(code: string): string {
    // Use dynamic icon registry (imported at top)
    const commonIcons = iconRegistry.getIconNames();

    // Find all JSX elements that might be icons (PascalCase components)
    const jsxIconPattern = /<([A-Z][a-zA-Z0-9]*)\s/g;
    const usedIcons = new Set<string>();
    const corrections: Array<{ from: string, to: string }> = [];
    let match;

    while ((match = jsxIconPattern.exec(code)) !== null) {
      const componentName = match[1];

      // Check if icon exists in registry
      if (commonIcons.includes(componentName)) {
        usedIcons.add(componentName);
      } else {
        // Try fuzzy matching auto-correction
        const correction = iconRegistry.autoCorrect(componentName);

        if (correction.corrected) {
          console.log(`🔧 Auto-correcting icon: ${componentName} → ${correction.corrected} (${(correction.confidence * 100).toFixed(0)}% confidence)`);
          corrections.push({ from: componentName, to: correction.corrected });
          usedIcons.add(correction.corrected);
        } else if (correction.suggestions.length > 0) {
          console.warn(`⚠️ Unknown icon "${componentName}". Did you mean: ${correction.suggestions.join(', ')}?`);
        }
      }
    }

    // Apply corrections to code
    for (const { from, to } of corrections) {
      const regex = new RegExp(`<${from}(\\s|>|/)`, 'g');
      code = code.replace(regex, `<${to}$1`);
    }

    if (usedIcons.size === 0) {
      return code; // No icons detected
    }

    // Check which icons are already imported
    const importPattern = /import\s*{([^}]+)}\s*from\s*['"]lucide-react['"]/;
    const importMatch = code.match(importPattern);

    const alreadyImported = new Set<string>();
    if (importMatch) {
      const imports = importMatch[1].split(',').map(s => s.trim());
      imports.forEach(imp => alreadyImported.add(imp));
    }

    // Find missing imports
    const missingIcons = Array.from(usedIcons).filter(icon => !alreadyImported.has(icon));

    if (missingIcons.length === 0) {
      return code; // All icons already imported
    }

    // Add missing icons to import
    if (importMatch) {
      // Existing import found - add to it
      const existingImports = importMatch[1].trim();
      const allImports = [...new Set([...existingImports.split(',').map(s => s.trim()), ...missingIcons])];
      const newImportStatement = `import { ${allImports.join(', ')} } from 'lucide-react'`;
      code = code.replace(importPattern, newImportStatement);

      console.log(`✅ Added missing icons to import: ${missingIcons.join(', ')}`);
    } else {
      // No lucide-react import found - create new one
      const newImportStatement = `import { ${missingIcons.join(', ')} } from 'lucide-react';\n`;

      // Insert after the first import (usually React)
      const firstImportMatch = code.match(/^import\s+.*?;?\n/m);
      if (firstImportMatch) {
        const insertPosition = firstImportMatch.index! + firstImportMatch[0].length;
        code = code.slice(0, insertPosition) + newImportStatement + code.slice(insertPosition);
      } else {
        // No imports at all - add at the beginning
        code = newImportStatement + code;
      }

      console.log(`✅ Created new lucide-react import: ${missingIcons.join(', ')}`);
    }

    return code;
  }

  /**
   * Main processing method
   */
  async process(
    rawCode: string,
    fileName: string = 'App.tsx',
    options: { validate?: boolean; bundle?: boolean } = { validate: true, bundle: true }
  ): Promise<ProcessedCode> {
    const startTime = performance.now();
    const virtualPath = fileName.startsWith('/') ? fileName : `/${fileName}`;

    const result: ProcessedCode = {
      files: [],
      dependencies: {},
      errors: [],
      warnings: [],
      components: [],
      metadata: {
        processedAt: new Date().toISOString(),
        processingTime: 0,
        fileCount: 0,
        hasErrors: false
      }
    };

    try {
      console.log(`📝 Processing code file: ${fileName}`);

      // 1. Clean LLM Output: normalize multi-file/markdown responses to a single valid module
      const parsedOutput = parseLLMOutput(rawCode, fileName.startsWith('src/') ? fileName : `src/${fileName}`);
      if (parsedOutput.parseError) {
        if (parsedOutput.parseError === 'UNAPPLIED_EDIT_OPERATIONS') {
          result.errors.push(
            'LLM returned structured edit operations, but none could be applied to current file anchors. ' +
            'Response was not compiled as TSX to avoid cascading syntax errors.'
          );
        } else if (parsedOutput.parseError === 'INVALID_HTML_DOCUMENT_OUTPUT') {
          result.errors.push(
            'LLM returned a full HTML document for a TSX/TS target file. ' +
            'Response was rejected to prevent invalid React module output.'
          );
        } else {
          result.errors.push(
            'LLM returned malformed structured JSON (files/operations). ' +
            'Response was not compiled as TSX to avoid cascading syntax errors.'
          );
        }
        result.metadata.hasErrors = true;
        result.metadata.processingTime = performance.now() - startTime;
        return result;
      }
      let code = parsedOutput.primaryCode;
      if (parsedOutput.detectedFormat !== 'raw') {
        console.log(`[Parser] Normalized ${parsedOutput.detectedFormat} output (${parsedOutput.extractedFiles.length} extracted files)`);
      }

      // 1.5. Navigation Safety (Transformation Pipeline Step 1)
      console.log('🧭 Transforming navigation (Enterprise Pipeline)...');
      try {
        if (process.env.FEATURE_LEGACY_NAV_TRANSFORM === 'true') {
          code = navigationTransformer.transform(code);
        }
      } catch (navError) {
        console.error('⚠️ Navigation transformation failed:', navError);
        // Fallback or just proceed - better to have broken links than broken build
      }

      // Legacy regex router removal - can be kept as backup or removed if transformer is solid
      // code = this.removeRouterImports(code);

      // 1.6. Enterprise Icon Validation (Pipeline Step 2)
      console.log('🛡️ Validating icons (Enterprise Pipeline)...');
      try {
        code = iconValidator.validate(code);
      } catch (validatorError) {
        console.error('⚠️ Icon validation failed, using fallback regex:', validatorError);
        // Fallback to old regex method if AST fails
        code = this.fixMissingImports(code);
      }
      code = this.sanitizeInvalidComponentInvocations(code);

      if (/\.(tsx|ts|jsx|js)$/.test(fileName) && this.looksLikeFullHtmlDocument(code)) {
        result.errors.push(
          'LLM returned a full HTML document for a TSX/TS module target. ' +
          'Expected a React module (for example: export default function App).'
        );
        result.metadata.hasErrors = true;
        result.metadata.processingTime = performance.now() - startTime;
        return result;
      }

      // 2. Pattern-Check: Enthält der Output überhaupt Code?
      if (!/import|export|function|const|let|class|<\w+|React/i.test(code)) {
        result.errors.push('LLM hat keinen ausführbaren Code geliefert. Bitte formuliere deinen Prompt spezifischer oder prüfe den Systemprompt.');
        result.metadata.hasErrors = true;
        result.metadata.processingTime = performance.now() - startTime;
        return result;
      }

      // 3. Parse Code mit ts-morph
      const sourceFile = this.project.createSourceFile(virtualPath, code, { overwrite: true });

      // 4. Validierung
      if (options.validate) {
        console.log('✅ Validating TypeScript...');
        try {
          this.validateCode(sourceFile, result);
        } catch (validationError) {
          console.error('❌ Validation error:', validationError);
          result.errors.push(`Validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
        }
      }

      // 5. Extract Components
      console.log('🔍 Extracting components...');
      result.components = await this.extractComponents(code);

      // 5. Extract Dependencies
      console.log('📦 Extracting dependencies...');
      const imports = sourceFile.getImportDeclarations();
      const extractedDeps: Set<string> = new Set(['react', 'react-dom']); // Always include core React deps

      imports.forEach((imp) => {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        // Filter: only external packages (not relative imports)
        if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
          // Extract package name (handle scoped packages like @babel/core)
          const packageName = moduleSpecifier.startsWith('@')
            ? moduleSpecifier.split('/').slice(0, 2).join('/')
            : moduleSpecifier.split('/')[0];
          extractedDeps.add(packageName);
        }
      });

      // Map dependencies to versions
      extractedDeps.forEach((dep) => {
        result.dependencies[dep] = this.defaultPackageVersions[dep] || 'latest';
      });

      // 5. Bundle code if enabled
      let bundledCode = code;
      if (options.bundle) {
        console.log('📦 Bundling with esbuild...');
        try {
          const bundleResult = await this.bundleCode(code, fileName);
          bundledCode = bundleResult;
        } catch (bundleError) {
          result.warnings.push(`Bundle warning: ${bundleError instanceof Error ? bundleError.message : String(bundleError)}`);
          // Continue with original code if bundling fails
        }
      }

      // 6. Create file structure
      result.files.push({
        path: fileName,
        content: bundledCode,
        type: this.getFileType(fileName),
        size: bundledCode.length
      });

      // 7. Generate package.json if dependencies exist
      if (Object.keys(result.dependencies).length > 0) {
        console.log('📋 Generating package.json...');
        const packageJson = {
          name: this.slugify(fileName.replace(/\.[^.]+$/, '')),
          version: '0.1.0',
          type: 'module',
          description: 'Generated React application',
          dependencies: result.dependencies,
          devDependencies: {
            'typescript': '^5.6.3',
            'vite': '^5.4.11',
            '@vitejs/plugin-react': '^4.3.4'
          },
          scripts: {
            'dev': 'vite',
            'build': 'vite build',
            'preview': 'vite preview'
          }
        };

        result.files.push({
          path: 'package.json',
          content: JSON.stringify(packageJson, null, 2),
          type: 'json',
          size: JSON.stringify(packageJson).length
        });
      }

      // 8. Generate index.html if it contains React components
      if (result.components.length > 0) {
        console.log('🌐 Generating index.html...');
        const htmlContent = this.generateIndexHtml(fileName);
        result.files.push({
          path: 'index.html',
          content: htmlContent,
          type: 'html',
          size: htmlContent.length
        });
      }

      // Update metadata
      result.metadata.fileCount = result.files.length;
      result.metadata.hasErrors = result.errors.length > 0;

      console.log(`✅ Processing completed. Found ${result.components.length} components, ${Object.keys(result.dependencies).length} dependencies`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Processing error:', errorMsg);
      result.errors.push(`Critical error: ${errorMsg}`);
      result.metadata.hasErrors = true;
    }

    // Calculate processing time
    result.metadata.processingTime = Math.round(performance.now() - startTime);

    return result;
  }

  /**
   * Validate code using ts-morph diagnostics
   */
  private validateCode(sourceFile: any, result: ProcessedCode): void {
    const diagnostics = sourceFile.getProject().getPreEmitDiagnostics(sourceFile);
    const targetFilePath = typeof sourceFile?.getFilePath === 'function'
      ? sourceFile.getFilePath()
      : '';

    // Whitelist of external libraries that are loaded via browser importmap (esm.sh)
    // These will not have type definitions in the backend validator, but work fine in browser
    const browserLibraries = [
      'lucide-react',
      '@heroicons/react',
      'framer-motion',
      'react-router-dom',
      'clsx',
      'date-fns',
      'zustand',
      'axios',
      'recharts',
      'react-confetti',
      'react-icons',
      '@radix-ui',
      'class-variance-authority'
    ];

    diagnostics.forEach((diag: any) => {
      const diagnosticSource = typeof diag.getSourceFile === 'function'
        ? diag.getSourceFile()
        : null;
      const diagnosticFilePath = typeof diagnosticSource?.getFilePath === 'function'
        ? diagnosticSource.getFilePath()
        : '';
      if (diagnosticFilePath && targetFilePath && diagnosticFilePath !== targetFilePath) {
        return;
      }

      let message = diag.getMessageText();
      if (typeof message !== 'string') {
        message = message.getMessageText();
      }

      // Filter 1: ONLY ignore "Cannot find module 'X'" for browser-loaded libraries
      // DO NOT filter export errors like "X does not provide export 'Y'" - these are REAL errors!
      const isCannotFindModule = message.startsWith("Cannot find module");
      if (isCannotFindModule) {
        const isRelativeModule = /Cannot find module ['"]\.\.?\//.test(message);
        if (isRelativeModule) {
          return; // Relative files are assembled later in the project pipeline
        }

        const isWhitelistedLibrary = browserLibraries.some(lib => message.includes(`'${lib}`));
        if (isWhitelistedLibrary) {
          return; // Skip this diagnostic - browser will load it via importmap
        }
      }

      // Filter 2: Ignore "implicitly has an 'any' type" warnings
      // These are usually follow-up errors from missing library types
      if (message.includes("implicitly has an 'any' type")) {
        return; // Skip implicit any warnings from library imports
      }

      // Process remaining diagnostics normally (including export errors!)
      const lineNumber = diag.getLineNumber();
      const fullMessage = `Line ${lineNumber || '?'}: ${message}`;

      if (diag.getCategory() === DiagnosticCategory.Error) {
        result.errors.push(fullMessage);
      } else if (diag.getCategory() === DiagnosticCategory.Warning) {
        result.warnings.push(fullMessage);
      }
    });
  }

  /**
   * Extract exported components from code
   */
  async extractComponents(code: string): Promise<string[]> {
    const components: string[] = [];
    const tempPath = '/__tmp__/component-extract.tsx';

    try {
      const existingTemp = this.project.getSourceFile(tempPath);
      if (existingTemp) {
        existingTemp.delete();
      }

      const sourceFile = this.project.createSourceFile(tempPath, code, { overwrite: true });

      // Find exported functions
      sourceFile.getFunctions().forEach((fn) => {
        if (fn.isExported() || fn.getName()?.match(/^[A-Z]/)) {
          const name = fn.getName();
          if (name) components.push(name);
        }
      });

      // Find exported variables (arrow functions, components)
      sourceFile.getVariableDeclarations().forEach((vd) => {
        if (vd.isExported() || vd.getName().match(/^[A-Z]/)) {
          components.push(vd.getName());
        }
      });

      // Remove duplicates and sort
      return [...new Set(components)].sort();
    } catch (error) {
      console.warn('⚠️ Component extraction failed:', error instanceof Error ? error.message : String(error));
      return [];
    } finally {
      const staleTemp = this.project.getSourceFile(tempPath);
      if (staleTemp) {
        staleTemp.delete();
      }
    }
  }

  /**
   * Bundle code using esbuild
   */
  private async bundleCode(code: string, fileName: string): Promise<string> {
    try {
      const result = await build({
        stdin: {
          contents: code,
          loader: this.getLoaderType(fileName),
          resolveDir: process.cwd()
        },
        bundle: false,
        write: false,
        format: 'esm',
        target: 'es2020',
        jsx: 'automatic',
        jsxImportSource: 'react',
        platform: 'browser',
        logLevel: 'silent'
      });

      if (result.outputFiles && result.outputFiles.length > 0) {
        return result.outputFiles[0].text;
      }

      return code; // Return original if bundling produces no output
    } catch (error) {
      throw new Error(`esbuild error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get loader type for esbuild
   */
  private getLoaderType(fileName: string): 'tsx' | 'jsx' | 'ts' | 'js' {
    if (fileName.endsWith('.tsx')) return 'tsx';
    if (fileName.endsWith('.ts')) return 'ts';
    if (fileName.endsWith('.jsx')) return 'jsx';
    return 'js';
  }

  /**
   * Get file type
   */
  private getFileType(fileName: string): ProcessedFile['type'] {
    if (fileName.endsWith('.tsx')) return 'tsx';
    if (fileName.endsWith('.jsx')) return 'jsx';
    if (fileName.endsWith('.css')) return 'css';
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.html')) return 'html';
    return 'jsx';
  }

  /**
   * Generate index.html for React app
   */
  private generateIndexHtml(mainFile: string): string {
    const componentName = mainFile.replace(/\.[^.]+$/, ''); // Remove extension

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${componentName} App</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/${mainFile}"></script>
    <script>
        import React from 'https://esm.sh/react@18.3.1';
        import ReactDOM from 'https://esm.sh/react-dom@18.3.1';
        import App from '/${mainFile}';

        ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(App)
        );
    </script>
</body>
</html>
`;
  }

  /**
   * Convert to URL-safe kebab-case
   */
  private slugify(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const codeProcessor = new CodeProcessor();
