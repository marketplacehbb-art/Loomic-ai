/**
 * Component Memory - Phase 3 Component 5
 * Stores and reuses generated components
 */

export interface ComponentRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  tags: string[];
  usageCount: number;
  createdAt: string;
  lastUsedAt: string;
  similarity?: number; // For search results
}

export interface ComponentSearchResult {
  components: ComponentRecord[];
  query: string;
  totalMatches: number;
}

export class ComponentMemory {
  private memory: Map<string, ComponentRecord> = new Map();
  private maxMemorySize = 100; // Maximum components to store

  /**
   * Store a component
   */
  async store(component: Omit<ComponentRecord, 'id' | 'usageCount' | 'createdAt' | 'lastUsedAt'>): Promise<string> {
    const id = this.generateId(component.name, component.code);
    
    const record: ComponentRecord = {
      id,
      ...component,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    // If memory is full, remove least used component
    if (this.memory.size >= this.maxMemorySize) {
      this.evictLeastUsed();
    }

    this.memory.set(id, record);
    return id;
  }

  /**
   * Search for similar components
   */
  async search(query: string, limit: number = 5): Promise<ComponentSearchResult> {
    const queryLower = query.toLowerCase();
    const results: ComponentRecord[] = [];

    // Simple keyword-based search
    for (const component of this.memory.values()) {
      let score = 0;

      // Name match
      if (component.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // Description match
      if (component.description.toLowerCase().includes(queryLower)) {
        score += 5;
      }

      // Tag match
      component.tags.forEach(tag => {
        if (tag.toLowerCase().includes(queryLower)) {
          score += 3;
        }
      });

      // Code content match (simple)
      if (component.code.toLowerCase().includes(queryLower)) {
        score += 1;
      }

      if (score > 0) {
        results.push({
          ...component,
          similarity: score,
        });
      }
    }

    // Sort by similarity score
    results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return {
      components: results.slice(0, limit),
      query,
      totalMatches: results.length,
    };
  }

  /**
   * Get component by ID
   */
  async get(id: string): Promise<ComponentRecord | null> {
    const component = this.memory.get(id);
    if (component) {
      // Update usage stats
      component.usageCount++;
      component.lastUsedAt = new Date().toISOString();
      return component;
    }
    return null;
  }

  /**
   * Find similar component by code
   */
  async findSimilar(code: string, threshold: number = 0.7): Promise<ComponentRecord | null> {
    let bestMatch: ComponentRecord | null = null;
    let bestScore = 0;

    for (const component of this.memory.values()) {
      const similarity = this.calculateSimilarity(code, component.code);
      if (similarity >= threshold && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = component;
      }
    }

    return bestMatch;
  }

  /**
   * Get all components
   */
  async getAll(): Promise<ComponentRecord[]> {
    return Array.from(this.memory.values());
  }

  /**
   * Clear memory
   */
  async clear(): Promise<void> {
    this.memory.clear();
  }

  /**
   * Generate ID from name and code
   */
  private generateId(name: string, code: string): string {
    // Simple hash-based ID
    const str = `${name}-${code.substring(0, 100)}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `comp-${Math.abs(hash)}`;
  }

  /**
   * Calculate similarity between two code strings
   */
  private calculateSimilarity(code1: string, code2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(code1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(code2.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Evict least used component
   */
  private evictLeastUsed(): void {
    let leastUsed: ComponentRecord | null = null;
    let leastUsage = Infinity;
    let oldestDate = new Date().toISOString();

    for (const component of this.memory.values()) {
      if (component.usageCount < leastUsage || 
          (component.usageCount === leastUsage && component.lastUsedAt < oldestDate)) {
        leastUsage = component.usageCount;
        oldestDate = component.lastUsedAt;
        leastUsed = component;
      }
    }

    if (leastUsed) {
      this.memory.delete(leastUsed.id);
    }
  }

  /**
   * Extract components from code and store them
   */
  async extractAndStore(code: string, description: string = 'Generated component'): Promise<string[]> {
    const componentIds: string[] = [];

    // Simple extraction: find function/const components
    const componentRegex = /(?:function|const)\s+([A-Z][a-zA-Z0-9]+)\s*[=\(]/g;
    let match;

    while ((match = componentRegex.exec(code)) !== null) {
      const componentName = match[1];
      
      // Extract component code (simplified - would need proper AST parsing for full extraction)
      const componentStart = match.index;
      const componentCode = code.substring(componentStart, componentStart + 500); // Simplified

      const id = await this.store({
        name: componentName,
        code: componentCode,
        description: `${description} - ${componentName}`,
        tags: this.extractTags(componentCode),
      });

      componentIds.push(id);
    }

    return componentIds;
  }

  /**
   * Extract tags from code
   */
  private extractTags(code: string): string[] {
    const tags: string[] = [];
    const lowerCode = code.toLowerCase();

    // Component type tags
    if (lowerCode.includes('form')) tags.push('form');
    if (lowerCode.includes('button')) tags.push('button');
    if (lowerCode.includes('modal')) tags.push('modal');
    if (lowerCode.includes('card')) tags.push('card');
    if (lowerCode.includes('list')) tags.push('list');
    if (lowerCode.includes('table')) tags.push('table');

    // Feature tags
    if (lowerCode.includes('usestate')) tags.push('state');
    if (lowerCode.includes('useeffect')) tags.push('effect');
    if (lowerCode.includes('router')) tags.push('routing');
    if (lowerCode.includes('api') || lowerCode.includes('fetch')) tags.push('api');

    return tags;
  }
}

export const componentMemory = new ComponentMemory();
