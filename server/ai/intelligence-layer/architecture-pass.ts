import { llmManager, LLMRequest } from '../llm/manager.js';
import { SpecResult } from './spec-pass.js';

/**
 * Architecture Pass - Phase 1 Component 2
 * Creates detailed architecture plan based on specifications
 */

export interface ComponentNode {
  name: string;
  type: 'component' | 'hook' | 'util' | 'type';
  children?: ComponentNode[];
  props?: string[];
  dependencies?: string[];
}

export interface DataFlowNode {
  from: string;
  to: string;
  data: string;
  method: 'props' | 'context' | 'state' | 'event';
}

export interface FileStructure {
  files: Array<{
    path: string;
    type: 'component' | 'hook' | 'util' | 'type' | 'style' | 'config';
    purpose: string;
  }>;
}

export interface ArchitecturePlan {
  componentHierarchy: ComponentNode[];
  stateManagement: 'local' | 'context' | 'zustand' | 'none';
  dataFlow: DataFlowNode[];
  patterns: string[];
  fileStructure: FileStructure;
  dependencies: string[];
  explanation: string;
}

export class ArchitecturePass {
  /**
   * Create architecture plan from specifications
   */
  async createPlan(spec: SpecResult, request: LLMRequest, context?: string): Promise<ArchitecturePlan> {
    const systemPrompt = `Du bist ein erfahrener Software-Architekt auf Staff-Level.
Dein Ziel: Erstelle einen detaillierten Architektur-Plan basierend auf den Spezifikationen.

Erstelle ein JSON-Objekt mit:
- componentHierarchy: Hierarchie der Komponenten (als Array von Objekten mit name, type, children, props, dependencies)
- stateManagement: Art des State-Managements ('local' | 'context' | 'zustand' | 'none')
- dataFlow: Datenfluss zwischen Komponenten (Array von {from, to, data, method})
- patterns: Verwendete Patterns (z.B. 'custom-hooks', 'compound-components', 'render-props')
- fileStructure: Datei-Struktur (Array von {path, type, purpose})
- dependencies: Benötigte Dependencies
- explanation: Kurze Erklärung der Architektur-Entscheidungen

Output: NUR ein valides JSON-Objekt.`;

    const planPrompt = `Erstelle einen Architektur-Plan für diese Spezifikationen:

Komponenten: ${spec.components.join(', ')}
Features: ${spec.features.join(', ')}
Constraints: ${spec.constraints.join(', ')}
UI Elements: ${spec.uiElements.join(', ')}
Komplexität: ${spec.estimatedComplexity}
Priorität: ${spec.priority}

${context ? `\nKontext:\n${context}` : ''}

Original Prompt: ${request.prompt}`;

    try {
      const response = await llmManager.generate({
        ...request,
        systemPrompt,
        prompt: planPrompt,
        temperature: 0.4,
        maxTokens: 3000,
      });

      const responseText = typeof response === 'string'
        ? response
        : ((response as any)?.content || '');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return this.normalizePlan(plan, spec);
      }

      // Fallback: Create basic plan
      return this.createFallbackPlan(spec);
    } catch (error: any) {
      console.warn('[ArchitecturePass] Failed to create plan, using fallback:', error.message);
      return this.createFallbackPlan(spec);
    }
  }

  /**
   * Normalize architecture plan
   */
  private normalizePlan(plan: any, spec: SpecResult): ArchitecturePlan {
    return {
      componentHierarchy: Array.isArray(plan.componentHierarchy) 
        ? plan.componentHierarchy 
        : this.createComponentHierarchy(spec.components),
      stateManagement: ['local', 'context', 'zustand', 'none'].includes(plan.stateManagement)
        ? plan.stateManagement
        : spec.estimatedComplexity === 'complex' ? 'context' : 'local',
      dataFlow: Array.isArray(plan.dataFlow) ? plan.dataFlow : [],
      patterns: Array.isArray(plan.patterns) ? plan.patterns : [],
      fileStructure: plan.fileStructure || this.createFileStructure(spec.components),
      dependencies: Array.isArray(plan.dependencies) ? plan.dependencies : [],
      explanation: plan.explanation || 'Standard React architecture with component-based structure',
    };
  }

  /**
   * Create component hierarchy from component list
   */
  private createComponentHierarchy(components: string[]): ComponentNode[] {
    return components.map(name => ({
      name,
      type: 'component' as const,
      props: [],
      dependencies: [],
    }));
  }

  /**
   * Create file structure from components
   */
  private createFileStructure(components: string[]): FileStructure {
    const files = components.map(comp => ({
      path: `${comp}.tsx`,
      type: 'component' as const,
      purpose: `Main ${comp} component`,
    }));

    files.push({
      path: 'App.tsx',
      type: 'component',
      purpose: 'Root application component',
    });

    return { files };
  }

  /**
   * Create fallback architecture plan
   */
  private createFallbackPlan(spec: SpecResult): ArchitecturePlan {
    return {
      componentHierarchy: this.createComponentHierarchy(spec.components),
      stateManagement: spec.estimatedComplexity === 'complex' ? 'context' : 'local',
      dataFlow: [],
      patterns: [],
      fileStructure: this.createFileStructure(spec.components),
      dependencies: ['react', 'react-dom', 'lucide-react'],
      explanation: 'Standard React component architecture',
    };
  }
}

export const architecturePass = new ArchitecturePass();
