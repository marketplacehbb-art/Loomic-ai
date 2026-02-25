import { LLMRequest } from '../llm/manager.js';
import { IntentResult, IntentType } from './intent-agent.js';
import { SpecResult } from '../intelligence-layer/spec-pass.js';
import { ArchitecturePlan } from '../intelligence-layer/architecture-pass.js';

/**
 * Dynamic Prompt Conditioner - Phase 3 Component 2
 * Adapts system prompts dynamically based on context
 */

export interface ConditionedPrompt {
  systemPrompt: string;
  userPrompt: string;
  context: {
    intent: IntentResult;
    spec?: SpecResult;
    architecture?: ArchitecturePlan;
    userHistory?: string[];
    projectStyle?: string;
  };
}

export class DynamicPromptConditioner {
  /**
   * Condition prompt based on context
   */
  condition(
    request: LLMRequest,
    intent: IntentResult,
    spec?: SpecResult,
    architecture?: ArchitecturePlan,
    userHistory?: string[],
    projectStyle?: string
  ): ConditionedPrompt {
    let systemPrompt = request.systemPrompt || this.getDefaultSystemPrompt();

    // 1. Adapt based on intent
    systemPrompt = this.adaptForIntent(systemPrompt, intent);

    // 2. Add architecture context if available
    if (architecture) {
      systemPrompt = this.addArchitectureContext(systemPrompt, architecture);
    }

    // 3. Add spec context if available
    if (spec) {
      systemPrompt = this.addSpecContext(systemPrompt, spec);
    }

    // 4. Add project style if available
    if (projectStyle) {
      systemPrompt = this.addStyleContext(systemPrompt, projectStyle);
    }

    // 5. Add user history context if available
    if (userHistory && userHistory.length > 0) {
      systemPrompt = this.addHistoryContext(systemPrompt, userHistory);
    }

    // 6. Enhance user prompt
    let userPrompt = request.prompt;
    userPrompt = this.enhanceUserPrompt(userPrompt, intent, spec);

    return {
      systemPrompt,
      userPrompt,
      context: {
        intent,
        spec,
        architecture,
        userHistory,
        projectStyle,
      },
    };
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(): string {
    return `Du bist ein erfahrener Fullstack-Entwickler.
Dein Ziel: Schreibe produktionsreifen React/TypeScript Code.

Regeln:
- Nutze TypeScript strikt
- Schreibe vollständigen Code (keine "// ... rest of code")
- Nutze moderne React Patterns (Hooks, Functional Components)
- Füge JSDoc-Kommentare für komplexe Logik hinzu
- Achte auf Accessibility (ARIA, Semantic HTML)
- Nutze Tailwind CSS für Styling`;
  }

  /**
   * Adapt system prompt for intent
   */
  private adaptForIntent(systemPrompt: string, intent: IntentResult): string {
    const intentStrategies: Record<IntentType, string> = {
      create: `
WICHTIG: Du erstellst eine NEUE Komponente von Grund auf.
- Definiere klare Props-Interfaces
- Nutze moderne React Patterns
- Strukturiere den Code sauber`,
      modify: `
WICHTIG: Du MODIFIZIERST bestehenden Code.
- Behalte die bestehende Struktur bei
- Ändere nur was explizit gefordert ist
- Erhalte bestehende Funktionalität`,
      fix: `
WICHTIG: Du BEHEBST Fehler.
- Identifiziere das Problem genau
- Fixe nur den Fehler, keine unnötigen Änderungen
- Teste die Lösung mental`,
      refactor: `
WICHTIG: Du REFACTORST Code.
- Verbessere Struktur und Lesbarkeit
- Erhalte Funktionalität
- Nutze Best Practices`,
      enhance: `
WICHTIG: Du ERWEITERST bestehende Features.
- Füge neue Funktionalität hinzu
- Behalte bestehende Features bei
- Integriere nahtlos`,
      style: `
WICHTIG: Du änderst NUR Styling.
- Keine Logik-Änderungen
- Nutze Tailwind CSS
- Achte auf Responsive Design`,
    };

    return `${systemPrompt}\n\n${intentStrategies[intent.intent]}`;
  }

  /**
   * Add architecture context to prompt
   */
  private addArchitectureContext(systemPrompt: string, architecture: ArchitecturePlan): string {
    return `${systemPrompt}

=== ARCHITEKTUR-KONTEXT ===
State Management: ${architecture.stateManagement}
Patterns: ${architecture.patterns.join(', ')}
Komponenten-Hierarchie: ${JSON.stringify(architecture.componentHierarchy.map(c => c.name))}

Folge dieser Architektur bei der Implementierung.`;
  }

  /**
   * Add spec context to prompt
   */
  private addSpecContext(systemPrompt: string, spec: SpecResult): string {
    return `${systemPrompt}

=== SPEZIFIKATIONEN ===
Komponenten: ${spec.components.join(', ')}
Features: ${spec.features.join(', ')}
Constraints: ${spec.constraints.join(', ')}
Komplexität: ${spec.estimatedComplexity}
Priorität: ${spec.priority}

Berücksichtige diese Spezifikationen bei der Implementierung.`;
  }

  /**
   * Add style context to prompt
   */
  private addStyleContext(systemPrompt: string, projectStyle: string): string {
    return `${systemPrompt}

=== PROJEKT-STIL ===
${projectStyle}

Folge diesem Code-Stil bei der Implementierung.`;
  }

  /**
   * Add history context to prompt
   */
  private addHistoryContext(systemPrompt: string, userHistory: string[]): string {
    const recentHistory = userHistory.slice(-3).join('\n- ');
    return `${systemPrompt}

=== VORHERIGE ANFRAGEN ===
- ${recentHistory}

Berücksichtige den Kontext der vorherigen Anfragen.`;
  }

  /**
   * Enhance user prompt
   */
  private enhanceUserPrompt(
    prompt: string,
    intent: IntentResult,
    spec?: SpecResult
  ): string {
    let enhanced = prompt;

    // Add intent-specific guidance
    if (intent.target) {
      enhanced = `[${intent.intent.toUpperCase()}] ${enhanced}`;
      enhanced += `\n\nZiel: ${intent.target}`;
    }

    // Add spec summary if available
    if (spec && spec.components.length > 0) {
      enhanced += `\n\nErwartete Komponenten: ${spec.components.join(', ')}`;
    }

    return enhanced;
  }
}

export const dynamicPromptConditioner = new DynamicPromptConditioner();
