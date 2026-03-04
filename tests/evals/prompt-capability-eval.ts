import fs from 'node:fs';
import path from 'node:path';
import { createResolvedProjectPlan } from '../../server/ai/template-library/project-plan.js';

interface CapabilityCase {
  id: string;
  prompt: string;
  expectedFeatures: string[];
  expectedRoutes: string[];
  expectedProjectTypes: string[];
}

interface CapabilityResult {
  id: string;
  ok: boolean;
  featureScore: number;
  routeScore: number;
  projectTypeOk: boolean;
  validationOk: boolean;
  score: number;
  details: string[];
}

const CASES: CapabilityCase[] = [
  {
    id: 'kanban-board',
    prompt: "Baue ein Trello-aehnliches Kanban-Board fuer Projektmanagement. Man soll Spalten hinzufuegen koennen. Karten per Drag-and-Drop zwischen Spalten verschieben. Prioritaets-Labels und Suchleiste in Echtzeit. Zustand in LocalStorage speichern.",
    expectedFeatures: ['kanban', 'dnd', 'search', 'persistence'],
    expectedRoutes: ['/board'],
    expectedProjectTypes: ['workspace', 'dashboard'],
  },
  {
    id: 'pathfinding-visualizer',
    prompt: "Erstelle einen interaktiven Pathfinding Visualizer fuer den Dijkstra-Algorithmus mit 20x20 Raster, Start/Ziel, Mauern und animierter Suche.",
    expectedFeatures: ['pathfinding'],
    expectedRoutes: ['/visualizer'],
    expectedProjectTypes: ['tool', 'dashboard'],
  },
  {
    id: 'inventory-invoice',
    prompt: "Baue ein Inventory and Invoice Management System mit Produkte-Tab, Rechnungserstellung, Bestandsreduktion, PDF-Vorschau und Low-Stock Toast-Warnung.",
    expectedFeatures: ['inventory', 'invoice', 'pdf', 'toast'],
    expectedRoutes: ['/inventory', '/invoices'],
    expectedProjectTypes: ['data-app', 'dashboard', 'workspace'],
  },
  {
    id: 'split-bill-calculator',
    prompt: "Erstelle einen Split-Bill-Rechner mit Gesamtbetrag, Anzahl Personen, Trinkgeld-Slider und editierbaren Positionen wie Pizza 12 EUR und Cola 3 EUR.",
    expectedFeatures: ['calculator'],
    expectedRoutes: ['/tool'],
    expectedProjectTypes: ['tool', 'dashboard', 'workspace'],
  },
  {
    id: 'crypto-portfolio-dashboard',
    prompt: "Erstelle ein Krypto-Portfolio-Dashboard mit Sidebar, Preisverlauf fuer Bitcoin, sortierbarer Asset-Tabelle und globalem Dark-Mode-Switch.",
    expectedFeatures: ['dashboard', 'chart'],
    expectedRoutes: ['/dashboard'],
    expectedProjectTypes: ['dashboard', 'workspace', 'data-app'],
  },
];

function runCase(testCase: CapabilityCase): CapabilityResult {
  const result = createResolvedProjectPlan({
    prompt: testCase.prompt,
    generationMode: 'new',
    existingFiles: {},
  });
  const finalPlan = result.finalPlan;
  const details: string[] = [];

  const matchedFeatures = testCase.expectedFeatures.filter((feature) => finalPlan.features.includes(feature));
  const featureScore = testCase.expectedFeatures.length > 0 ? matchedFeatures.length / testCase.expectedFeatures.length : 1;
  const missingFeatures = testCase.expectedFeatures.filter((feature) => !finalPlan.features.includes(feature));
  if (missingFeatures.length > 0) {
    details.push(`missing features: ${missingFeatures.join(', ')}`);
  }

  const routePaths = finalPlan.pages.map((page) => page.path);
  const matchedRoutes = testCase.expectedRoutes.filter((route) => routePaths.includes(route));
  const routeScore = testCase.expectedRoutes.length > 0 ? matchedRoutes.length / testCase.expectedRoutes.length : 1;
  const missingRoutes = testCase.expectedRoutes.filter((route) => !routePaths.includes(route));
  if (missingRoutes.length > 0) {
    details.push(`missing routes: ${missingRoutes.join(', ')}`);
  }

  const projectTypeOk = testCase.expectedProjectTypes.includes(finalPlan.projectType);
  if (!projectTypeOk) {
    details.push(`projectType=${finalPlan.projectType} not in [${testCase.expectedProjectTypes.join(', ')}]`);
  }

  const validationOk = result.validation.valid;
  if (!validationOk) {
    details.push(`validation failed: ${result.validation.errors.join(' | ')}`);
  }

  const score = Math.round(((featureScore * 0.5) + (routeScore * 0.25) + (projectTypeOk ? 0.15 : 0) + (validationOk ? 0.1 : 0)) * 100);

  return {
    id: testCase.id,
    ok: details.length === 0,
    featureScore: Number(featureScore.toFixed(2)),
    routeScore: Number(routeScore.toFixed(2)),
    projectTypeOk,
    validationOk,
    score,
    details,
  };
}

function main(): void {
  const results: CapabilityResult[] = [];

  console.log('=== Prompt Capability Eval ===');
  for (const testCase of CASES) {
    const outcome = runCase(testCase);
    results.push(outcome);
    if (outcome.ok) {
      console.log(`PASS ${testCase.id} (score=${outcome.score})`);
      continue;
    }

    console.log(`FAIL ${testCase.id} (score=${outcome.score})`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases: results.filter((entry) => entry.ok).length,
    averageScore:
      results.length > 0
        ? Math.round(results.reduce((sum, entry) => sum + entry.score, 0) / results.length)
        : 0,
    results,
  };
  const reportPath = path.resolve(process.cwd(), 'tests/evals/last-capability-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Saved report: ${reportPath}`);

  const failed = results.filter((entry) => !entry.ok).length;
  if (failed > 0) {
    console.error(`Capability eval failed: ${failed}/${CASES.length}`);
    process.exit(1);
  }

  console.log(`Capability eval passed: ${CASES.length}/${CASES.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Capability eval runner failed:', error);
  process.exit(1);
});
