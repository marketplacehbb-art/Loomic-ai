# Phase 1: Intelligence Layer

## Übersicht

Phase 1 implementiert einen intelligenten Code-Generierungs-Layer mit 4 Hauptkomponenten:

1. **Spec Pass** - Analysiert Prompts und extrahiert strukturierte Spezifikationen
2. **Architecture Pass** - Erstellt detaillierte Architektur-Pläne
3. **Self Critique** - Bewertet generierten Code kritisch
4. **Repair Loop** - Repariert Code iterativ basierend auf Critique

## Komponenten

### 1. Spec Pass (`spec-pass.ts`)

Analysiert User-Prompts und extrahiert:
- Komponenten-Liste
- Features/Funktionalitäten
- Constraints
- UI-Elemente
- Datenfluss
- Implizite Anforderungen
- Priorität und Komplexität

**Verwendung:**
```typescript
import { specPass } from './intelligence-layer/spec-pass.js';

const spec = await specPass.analyze(prompt, context);
console.log(spec.components); // ['Button', 'Form', 'Card']
```

### 2. Architecture Pass (`architecture-pass.ts`)

Erstellt Architektur-Pläne basierend auf Spezifikationen:
- Komponenten-Hierarchie
- State-Management-Strategie
- Datenfluss-Diagramm
- Patterns
- Datei-Struktur
- Dependencies

**Verwendung:**
```typescript
import { architecturePass } from './intelligence-layer/architecture-pass.js';

const plan = await architecturePass.createPlan(spec, request, context);
console.log(plan.stateManagement); // 'context' | 'local' | 'zustand'
```

### 3. Self Critique (`self-critique.ts`)

Bewertet Code kritisch:
- Score (0-100)
- Stärken und Schwächen
- Detaillierte Issues (severity, category, location)
- Verbesserungsvorschläge
- Repair-Bedarf

**Verwendung:**
```typescript
import { selfCritique } from './intelligence-layer/self-critique.js';

const critique = await selfCritique.critique(code, architecturePlan, request);
console.log(critique.score); // 85
console.log(critique.needsRepair); // true/false
```

### 4. Repair Loop (`repair-loop.ts`)

Repariert Code iterativ:
- Priorisiert Issues (critical → major → minor)
- Maximal 3 Iterationen
- Validierung nach jeder Iteration
- Tracking von angewendeten Fixes

**Verwendung:**
```typescript
import { repairLoop } from './intelligence-layer/repair-loop.js';

const repair = await repairLoop.repair(code, critique, request);
console.log(repair.success); // true/false
console.log(repair.iterations); // 2
```

## Orchestrator

Der `Orchestrator` koordiniert alle Phase-1-Komponenten:

```typescript
import { orchestrator } from '../ai/orchestrator.js';

const result = await orchestrator.orchestrate(request, context);
// result.code - Generierter Code
// result.metadata.phase1 - Alle Phase-1-Metadaten
```

## Feature Flags

Phase 1 Komponenten können einzeln aktiviert werden:

```typescript
// Via Environment Variables
FEATURE_SPEC_PASS=true
FEATURE_ARCHITECTURE_PASS=true
FEATURE_SELF_CRITIQUE=true
FEATURE_REPAIR_LOOP=true

// Via Request Body
{
  "featureFlags": {
    "phase1": {
      "specPass": true,
      "architecturePass": true,
      "selfCritique": true,
      "repairLoop": true
    }
  }
}
```

## Flow

```
User Prompt
  ↓
Spec Pass (optional)
  ↓
Architecture Pass (optional)
  ↓
Code Generation (mit oder ohne Architecture Plan)
  ↓
Self Critique (optional)
  ↓
Repair Loop (optional, nur wenn Critique.needsRepair === true)
  ↓
Final Code
```

## Fallbacks

Alle Komponenten haben Fallback-Mechanismen:
- Wenn LLM-Call fehlschlägt → Fallback auf einfache Heuristiken
- Wenn JSON-Parsing fehlschlägt → Fallback auf strukturierte Defaults
- Wenn Validierung fehlschlägt → Original-Code wird beibehalten

## Performance

- Spec Pass: ~2-3 Sekunden
- Architecture Pass: ~3-5 Sekunden
- Self Critique: ~2-3 Sekunden
- Repair Loop: ~5-10 Sekunden (abhängig von Iterationen)

**Gesamt:** ~12-21 Sekunden zusätzlich zu Standard-Generierung

## Testing

Jede Komponente kann einzeln getestet werden:

```typescript
// Test Spec Pass
const spec = await specPass.analyze("Create a login form");
expect(spec.components).toContain('Form');

// Test Architecture Pass
const plan = await architecturePass.createPlan(spec, request);
expect(plan.stateManagement).toBeDefined();

// Test Self Critique
const critique = await selfCritique.critique(code, plan, request);
expect(critique.score).toBeGreaterThan(0);

// Test Repair Loop
const repair = await repairLoop.repair(code, critique, request);
expect(repair.code).toBeDefined();
```

## Nächste Schritte

Phase 1 ist vollständig implementiert. Als nächstes:
- Phase 2: Processor Evolution (AST Rewrite, Quality Scoring, Multi File Generation)
- Phase 3: Elite Features (Dynamic Prompt Conditioning, Intent Agent, etc.)
