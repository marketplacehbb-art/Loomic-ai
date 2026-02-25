import { Project, SourceFile } from 'ts-morph';

/**
 * Quality Scorer - Phase 2 Component 2
 * Evaluates code quality based on multiple metrics
 */

export interface QualityMetrics {
  complexity: number; // 0-100 (lower is better, inverted for score)
  maintainability: number; // 0-100 (higher is better)
  duplication: number; // 0-100 (lower is better, inverted for score)
  performance: number; // 0-100 (higher is better)
  accessibility: number; // 0-100 (higher is better)
  typeSafety: number; // 0-100 (higher is better)
}

export interface QualityRecommendation {
  category: keyof QualityMetrics;
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

export interface QualityScore {
  overall: number; // 0-100
  metrics: QualityMetrics;
  recommendations: QualityRecommendation[];
}

export class QualityScorer {
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
   * Score code quality
   */
  async score(code: string, fileName: string = 'App.tsx'): Promise<QualityScore> {
    try {
      const sourceFile = this.project.createSourceFile(fileName, code, { overwrite: true });

      const metrics: QualityMetrics = {
        complexity: this.calculateComplexity(sourceFile),
        maintainability: this.calculateMaintainability(sourceFile),
        duplication: this.calculateDuplication(sourceFile),
        performance: this.calculatePerformance(sourceFile),
        accessibility: this.calculateAccessibility(sourceFile),
        typeSafety: this.calculateTypeSafety(sourceFile),
      };

      const recommendations = this.generateRecommendations(metrics, sourceFile);
      const overall = this.calculateOverallScore(metrics);

      return {
        overall,
        metrics,
        recommendations,
      };
    } catch (error: any) {
      console.warn('[QualityScorer] Failed to score code:', error.message);
      // Return default score
      return this.createDefaultScore();
    }
  }

  /**
   * Calculate complexity score (cyclomatic complexity approximation)
   */
  private calculateComplexity(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    
    // Simple heuristic: count control flow statements
    const ifStatements = (text.match(/\bif\s*\(/g) || []).length;
    const forLoops = (text.match(/\bfor\s*\(/g) || []).length;
    const whileLoops = (text.match(/\bwhile\s*\(/g) || []).length;
    const switchStatements = (text.match(/\bswitch\s*\(/g) || []).length;
    const ternaryOps = (text.match(/\?/g) || []).length;
    
    const complexity = ifStatements + forLoops + whileLoops + switchStatements + ternaryOps;
    
    // Normalize to 0-100 (inverted: lower complexity = higher score)
    // 0-5 complexity = 100, 6-10 = 80, 11-20 = 60, 21-30 = 40, 31+ = 20
    if (complexity <= 5) return 100;
    if (complexity <= 10) return 80;
    if (complexity <= 20) return 60;
    if (complexity <= 30) return 40;
    return 20;
  }

  /**
   * Calculate maintainability score
   */
  private calculateMaintainability(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    let score = 100;

    // Check for code smells
    if (text.includes('any')) score -= 10; // Type safety
    if (text.includes('console.log')) score -= 5; // Debug code
    if (text.match(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}/)) score -= 15; // Long functions
    if (text.match(/\/\/ TODO|\/\/ FIXME|\/\/ HACK/)) score -= 5; // TODOs
    
    // Check for good practices
    if (text.includes('useState') || text.includes('useEffect')) score += 5; // React hooks
    if (text.includes('interface ') || text.includes('type ')) score += 10; // TypeScript types
    if (text.includes('const ') && !text.includes('var ')) score += 5; // Modern JS

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate duplication score
   */
  private calculateDuplication(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    
    // Simple heuristic: check for repeated code blocks
    const lineMap = new Map<string, number>();
    lines.forEach(line => {
      const normalized = line.trim().replace(/\s+/g, ' ');
      lineMap.set(normalized, (lineMap.get(normalized) || 0) + 1);
    });

    const duplicates = Array.from(lineMap.values()).filter(count => count > 1).length;
    const duplicationRatio = duplicates / lines.length;

    // Inverted: lower duplication = higher score
    return Math.max(0, Math.min(100, 100 - (duplicationRatio * 100)));
  }

  /**
   * Calculate performance score
   */
  private calculatePerformance(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    let score = 100;

    // Check for performance issues
    if (text.includes('.map(') && text.includes('.map(')) {
      // Multiple maps could be optimized
      const mapCount = (text.match(/\.map\(/g) || []).length;
      if (mapCount > 3) score -= 10;
    }

    if (text.includes('useEffect') && !text.includes('useEffect(() => {')) {
      // Missing dependency arrays
      const useEffectCount = (text.match(/useEffect/g) || []).length;
      const withDeps = (text.match(/useEffect\([^)]*,\s*\[/g) || []).length;
      if (useEffectCount > withDeps) score -= 15;
    }

    // Check for good practices
    if (text.includes('useMemo') || text.includes('useCallback')) score += 10;
    if (text.includes('React.memo')) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate accessibility score
   */
  private calculateAccessibility(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    let score = 50; // Start with neutral score

    // Check for accessibility features
    if (text.includes('aria-')) score += 20;
    if (text.includes('role=')) score += 10;
    if (text.includes('alt=')) score += 10;
    if (text.includes('label')) score += 5;
    if (text.includes('tabIndex')) score += 5;

    // Check for missing accessibility
    const images = (text.match(/<img/g) || []).length;
    const imagesWithAlt = (text.match(/<img[^>]*alt=/g) || []).length;
    if (images > 0 && imagesWithAlt < images) {
      score -= (images - imagesWithAlt) * 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate type safety score
   */
  private calculateTypeSafety(sourceFile: SourceFile): number {
    const text = sourceFile.getFullText();
    let score = 100;

    // Check for type safety issues
    const anyCount = (text.match(/\bany\b/g) || []).length;
    score -= anyCount * 5;

    const unknownCount = (text.match(/\bunknown\b/g) || []).length;
    score -= unknownCount * 2; // Less severe than any

    // Check for good type usage
    if (text.includes('interface ') || text.includes('type ')) score += 5;
    if (text.includes(': string') || text.includes(': number')) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(metrics: QualityMetrics): number {
    // Weighted average
    const weights = {
      complexity: 0.15,
      maintainability: 0.25,
      duplication: 0.10,
      performance: 0.15,
      accessibility: 0.15,
      typeSafety: 0.20,
    };

    // Note: complexity and duplication are inverted (lower is better)
    const adjustedComplexity = 100 - metrics.complexity;
    const adjustedDuplication = 100 - metrics.duplication;

    return Math.round(
      metrics.maintainability * weights.maintainability +
      adjustedComplexity * weights.complexity +
      adjustedDuplication * weights.duplication +
      metrics.performance * weights.performance +
      metrics.accessibility * weights.accessibility +
      metrics.typeSafety * weights.typeSafety
    );
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metrics: QualityMetrics, sourceFile: SourceFile): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = [];

    if (metrics.complexity < 60) {
      recommendations.push({
        category: 'complexity',
        issue: 'High code complexity detected',
        suggestion: 'Consider breaking down complex functions into smaller, focused components',
        priority: 'high',
      });
    }

    if (metrics.maintainability < 70) {
      recommendations.push({
        category: 'maintainability',
        issue: 'Code maintainability could be improved',
        suggestion: 'Add TypeScript types, remove debug code, and break down large functions',
        priority: 'medium',
      });
    }

    if (metrics.typeSafety < 80) {
      recommendations.push({
        category: 'typeSafety',
        issue: 'Type safety issues detected',
        suggestion: 'Replace "any" types with proper TypeScript types',
        priority: 'high',
      });
    }

    if (metrics.accessibility < 60) {
      recommendations.push({
        category: 'accessibility',
        issue: 'Accessibility improvements needed',
        suggestion: 'Add ARIA labels, alt text for images, and proper semantic HTML',
        priority: 'medium',
      });
    }

    if (metrics.performance < 70) {
      recommendations.push({
        category: 'performance',
        issue: 'Performance optimizations available',
        suggestion: 'Consider using useMemo, useCallback, and React.memo for expensive operations',
        priority: 'low',
      });
    }

    return recommendations;
  }

  /**
   * Create default score when scoring fails
   */
  private createDefaultScore(): QualityScore {
    return {
      overall: 75,
      metrics: {
        complexity: 80,
        maintainability: 75,
        duplication: 90,
        performance: 75,
        accessibility: 60,
        typeSafety: 80,
      },
      recommendations: [],
    };
  }
}

export const qualityScorer = new QualityScorer();
