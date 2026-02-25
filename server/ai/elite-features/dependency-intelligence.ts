import { Project, SourceFile, ImportDeclaration } from 'ts-morph';

/**
 * Dependency Intelligence - Phase 3 Component 3
 * Intelligent dependency detection and management
 */

export interface DependencyInfo {
  name: string;
  version: string;
  reason: string; // Why this dependency is needed
  category: 'ui' | 'state' | 'utils' | 'routing' | 'styling' | 'data' | 'other';
  peerDependencies?: string[];
  alternatives?: string[];
}

export interface DependencyAnalysis {
  dependencies: DependencyInfo[];
  conflicts: Array<{ dep1: string; dep2: string; reason: string }>;
  recommendations: Array<{ action: 'add' | 'remove' | 'update'; dependency: string; reason: string }>;
  bundleSizeEstimate?: number; // KB
}

export class DependencyIntelligence {
  private project: Project;
  private knownDependencies: Map<string, DependencyInfo> = new Map();

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

    this.initializeKnownDependencies();
  }

  /**
   * Analyze dependencies from code
   */
  async analyze(code: string, fileName: string = 'App.tsx'): Promise<DependencyAnalysis> {
    try {
      const sourceFile = this.project.createSourceFile(fileName, code, { overwrite: true });
      const imports = sourceFile.getImportDeclarations();

      const dependencies: DependencyInfo[] = [];
      const detectedPackages = new Set<string>();

      // Analyze imports
      imports.forEach(imp => {
        const specifier = imp.getModuleSpecifierValue();
        
        // Skip relative imports
        if (specifier.startsWith('.') || specifier.startsWith('/')) {
          return;
        }

        // Extract package name (handle scoped packages)
        const packageName = specifier.split('/')[0].startsWith('@')
          ? `${specifier.split('/')[0]}/${specifier.split('/')[1]}`
          : specifier.split('/')[0];

        if (!detectedPackages.has(packageName)) {
          detectedPackages.add(packageName);
          
          const depInfo = this.getDependencyInfo(packageName, imp, sourceFile);
          if (depInfo) {
            dependencies.push(depInfo);
          }
        }
      });

      // Detect implicit dependencies from code patterns
      const implicitDeps = this.detectImplicitDependencies(sourceFile);
      implicitDeps.forEach(dep => {
        if (!detectedPackages.has(dep.name)) {
          dependencies.push(dep);
          detectedPackages.add(dep.name);
        }
      });

      // Check for conflicts
      const conflicts = this.detectConflicts(dependencies);

      // Generate recommendations
      const recommendations = this.generateRecommendations(dependencies, sourceFile);

      // Estimate bundle size
      const bundleSizeEstimate = this.estimateBundleSize(dependencies);

      return {
        dependencies,
        conflicts,
        recommendations,
        bundleSizeEstimate,
      };
    } catch (error: any) {
      console.warn('[DependencyIntelligence] Failed to analyze dependencies:', error.message);
      return {
        dependencies: [],
        conflicts: [],
        recommendations: [],
      };
    }
  }

  /**
   * Get dependency information
   */
  private getDependencyInfo(
    packageName: string,
    importDecl: ImportDeclaration,
    sourceFile: SourceFile
  ): DependencyInfo | null {
    // Check known dependencies first
    if (this.knownDependencies.has(packageName)) {
      return this.knownDependencies.get(packageName)!;
    }

    // Infer from usage
    const namedImports = importDecl.getNamedImports().map(n => n.getName());
    const category = this.inferCategory(packageName, namedImports, sourceFile);
    const reason = this.inferReason(packageName, namedImports, sourceFile);

    return {
      name: packageName,
      version: this.getRecommendedVersion(packageName),
      reason,
      category,
    };
  }

  /**
   * Infer dependency category
   */
  private inferCategory(
    packageName: string,
    namedImports: string[],
    sourceFile: SourceFile
  ): DependencyInfo['category'] {
    const text = sourceFile.getFullText().toLowerCase();

    if (packageName.includes('react-router') || packageName.includes('next')) {
      return 'routing';
    }
    if (packageName.includes('zustand') || packageName.includes('redux') || packageName.includes('recoil')) {
      return 'state';
    }
    if (packageName.includes('tailwind') || packageName.includes('css') || packageName.includes('styled')) {
      return 'styling';
    }
    if (packageName.includes('axios') || packageName.includes('fetch') || packageName.includes('api')) {
      return 'data';
    }
    if (packageName.includes('ui') || packageName.includes('component') || packageName.includes('lucide')) {
      return 'ui';
    }
    if (namedImports.some(n => n.includes('use') || n.includes('hook'))) {
      return 'utils';
    }

    return 'other';
  }

  /**
   * Infer reason for dependency
   */
  private inferReason(
    packageName: string,
    namedImports: string[],
    sourceFile: SourceFile
  ): string {
    const text = sourceFile.getFullText();

    if (namedImports.length > 0) {
      return `Used for: ${namedImports.join(', ')}`;
    }

    // Check usage patterns
    if (text.includes('useState') || text.includes('useEffect')) {
      return 'React hooks usage';
    }
    if (text.includes('Router') || text.includes('Route')) {
      return 'Routing functionality';
    }
    if (text.includes('axios') || text.includes('fetch')) {
      return 'API calls';
    }

    return 'Required for functionality';
  }

  /**
   * Detect implicit dependencies from code patterns
   */
  private detectImplicitDependencies(sourceFile: SourceFile): DependencyInfo[] {
    const implicit: DependencyInfo[] = [];
    const text = sourceFile.getFullText();

    // React is always needed if JSX is present
    if (text.includes('<') && text.includes('>')) {
      implicit.push({
        name: 'react',
        version: '^18.3.1',
        reason: 'JSX syntax requires React',
        category: 'ui',
      });
      implicit.push({
        name: 'react-dom',
        version: '^18.3.1',
        reason: 'React DOM rendering',
        category: 'ui',
      });
    }

    // TypeScript types
    if (text.includes('interface ') || text.includes('type ')) {
      implicit.push({
        name: 'typescript',
        version: '^5.6.3',
        reason: 'TypeScript type definitions',
        category: 'other',
      });
    }

    return implicit;
  }

  /**
   * Detect dependency conflicts
   */
  private detectConflicts(dependencies: DependencyInfo[]): Array<{ dep1: string; dep2: string; reason: string }> {
    const conflicts: Array<{ dep1: string; dep2: string; reason: string }> = [];

    // Check for routing conflicts
    const routingDeps = dependencies.filter(d => d.category === 'routing');
    if (routingDeps.length > 1) {
      conflicts.push({
        dep1: routingDeps[0].name,
        dep2: routingDeps[1].name,
        reason: 'Multiple routing libraries detected',
      });
    }

    // Check for state management conflicts
    const stateDeps = dependencies.filter(d => d.category === 'state');
    if (stateDeps.length > 1) {
      conflicts.push({
        dep1: stateDeps[0].name,
        dep2: stateDeps[1].name,
        reason: 'Multiple state management libraries detected',
      });
    }

    return conflicts;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    dependencies: DependencyInfo[],
    sourceFile: SourceFile
  ): Array<{ action: 'add' | 'remove' | 'update'; dependency: string; reason: string }> {
    const recommendations: Array<{ action: 'add' | 'remove' | 'update'; dependency: string; reason: string }> = [];
    const text = sourceFile.getFullText();

    // Check for missing common dependencies
    const hasRouter = dependencies.some(d => d.category === 'routing');
    if ((text.includes('Router') || text.includes('Route')) && !hasRouter) {
      recommendations.push({
        action: 'add',
        dependency: 'react-router-dom',
        reason: 'Routing functionality detected but no router library found',
      });
    }

    // Check for version updates
    dependencies.forEach(dep => {
      const recommended = this.getRecommendedVersion(dep.name);
      if (dep.version !== recommended && recommended !== 'latest') {
        recommendations.push({
          action: 'update',
          dependency: dep.name,
          reason: `Update to ${recommended} for better compatibility`,
        });
      }
    });

    return recommendations;
  }

  /**
   * Estimate bundle size
   */
  private estimateBundleSize(dependencies: DependencyInfo[]): number {
    // Rough estimates in KB (gzipped)
    const sizeMap: Record<string, number> = {
      'react': 45,
      'react-dom': 130,
      'react-router-dom': 20,
      'zustand': 1,
      'axios': 15,
      'lucide-react': 50,
      'framer-motion': 25,
    };

    let totalSize = 0;
    dependencies.forEach(dep => {
      totalSize += sizeMap[dep.name] || 10; // Default estimate
    });

    return Math.round(totalSize);
  }

  /**
   * Get recommended version for package
   */
  private getRecommendedVersion(packageName: string): string {
    const versions: Record<string, string> = {
      'react': '^18.3.1',
      'react-dom': '^18.3.1',
      'react-router-dom': '^6.30.3',
      'zustand': '^4.4.0',
      'axios': '^1.6.0',
      'lucide-react': '^0.344.0',
      'framer-motion': '^11.0.8',
      'typescript': '^5.6.3',
    };

    return versions[packageName] || 'latest';
  }

  /**
   * Initialize known dependencies database
   */
  private initializeKnownDependencies(): void {
    // Common React ecosystem dependencies
    this.knownDependencies.set('react', {
      name: 'react',
      version: '^18.3.1',
      reason: 'React library',
      category: 'ui',
    });

    this.knownDependencies.set('react-dom', {
      name: 'react-dom',
      version: '^18.3.1',
      reason: 'React DOM rendering',
      category: 'ui',
      peerDependencies: ['react'],
    });

    this.knownDependencies.set('lucide-react', {
      name: 'lucide-react',
      version: '^0.344.0',
      reason: 'Icon library',
      category: 'ui',
      peerDependencies: ['react'],
    });
  }
}

export const dependencyIntelligence = new DependencyIntelligence();
