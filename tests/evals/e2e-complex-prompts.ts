import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import generateRouter from '../../server/api/generate.js';

dotenv.config();

type Case = {
  id: string;
  prompt: string;
  expectedMinFiles: number;
  minCoverage: number;
  checks: Array<{ id: string; test: RegExp }>;
};

type CaseResult = {
  id: string;
  httpStatus?: number;
  success: boolean;
  durationMs: number;
  fileCount?: number;
  errorCount?: number;
  warningCount?: number;
  pipeline?: {
    projectType: string | null;
    pages: unknown;
    qualityCriticalCount: number | null;
    verifyPass: boolean | null;
    editOutcome: string | null;
  };
  checks?: Array<{ id: string; ok: boolean }>;
  passedChecks?: number;
  totalChecks?: number;
  coverageScore?: number;
  fileScore?: number;
  buildHealthy?: boolean;
  overallScore?: number;
  pass?: boolean;
  topError?: unknown;
  exception?: string;
};

const CASES: Case[] = [
  {
    id: 'kanban',
    prompt: "Baue ein Trello-aehnliches Kanban-Board fuer Projektmanagement. Man soll Spalten (z.B. 'To Do', 'Doing', 'Done') hinzufuegen koennen. Jede Spalte hat Karten, die man per Drag-and-Drop (nutze @dnd-kit oder react-beautiful-dnd) zwischen den Spalten verschieben kann. Jede Karte soll Prioritaets-Labels haben (Low, Medium, High). Fuege eine Suchleiste hinzu, die Karten ueber alle Spalten hinweg in Echtzeit filtert. Speichere den Zustand im LocalStorage, damit beim Refresh nichts weg ist.",
    expectedMinFiles: 4,
    minCoverage: 0.75,
    checks: [
      { id: 'dnd', test: /@dnd-kit|react-beautiful-dnd|DndContext|DragDropContext/i },
      { id: 'search', test: /search|filter|suche/i },
      { id: 'persistence', test: /localStorage/i },
      { id: 'priority', test: /priority|low|medium|high/i },
    ],
  },
  {
    id: 'pathfinding',
    prompt: "Erstelle einen interaktiven Pathfinding Visualizer fuer den Dijkstra-Algorithmus. Zeichne ein Raster von 20x20 Quadraten. Der User kann per Klick Start und Ziel Punkte setzen und durch Ziehen der Maus Mauern bauen. Es gibt einen Button Start Search, der den kuerzesten Weg visuell mit einer Animation einzeichnet. Zeige eine Legende fuer besuchte Knoten und kuerzester Pfad an.",
    expectedMinFiles: 3,
    minCoverage: 0.75,
    checks: [
      { id: 'dijkstra', test: /dijkstra|shortest\s*path|pathfinding/i },
      { id: 'grid', test: /20\s*[xX]\s*20|grid/i },
      { id: 'start-goal', test: /start|ziel|goal/i },
      { id: 'legend', test: /legend|visited|knoten|path/i },
    ],
  },
  {
    id: 'inventory-invoice',
    prompt: "Baue ein Inventory and Invoice Management System. Es gibt einen Tab Produkte, wo ich Artikel mit Preis und Lagerbestand anlegen kann. Es gibt einen Tab Rechnung erstellen, wo ich einen Kunden auswaehle und Produkte aus dem Bestand hinzufuege. Wenn ich die Rechnung fertigstelle, muss sich der Lagerbestand der Produkte automatisch verringern. Generiere eine PDF-Vorschau der Rechnung und warne mit einem Toast-Popup, wenn ein Lagerbestand unter 5 Stueck faellt.",
    expectedMinFiles: 4,
    minCoverage: 0.75,
    checks: [
      { id: 'inventory', test: /inventory|lagerbestand|stock/i },
      { id: 'invoice', test: /invoice|rechnung/i },
      { id: 'pdf', test: /@react-pdf\/renderer|pdf|print/i },
      { id: 'toast', test: /toast|notification|warn/i },
    ],
  },
  {
    id: 'split-bill',
    prompt: "Erstelle einen Split-Bill-Rechner. Ich moechte den Gesamtbetrag eingeben, die Anzahl der Personen und ein Trinkgeld in Prozent per Slider. Das Tool soll mir sofort anzeigen, wie viel jeder zahlen muss. Fuege eine Liste hinzu, in der ich einzelne Positionen wie Pizza 12 EUR und Cola 3 EUR hinzufuegen kann, die dann automatisch summiert werden.",
    expectedMinFiles: 3,
    minCoverage: 0.75,
    checks: [
      { id: 'calculator', test: /split|per\s*person|each\s*pay|calculate|calculator/i },
      { id: 'tip', test: /tip|trinkgeld|slider/i },
      { id: 'line-items', test: /items|position|pizza|cola|sum/i },
      { id: 'live-total', test: /total|subtotal|gesamtbetrag/i },
    ],
  },
  {
    id: 'crypto-dashboard',
    prompt: "Erstelle ein Krypto-Portfolio-Dashboard. Es soll eine Sidebar zur Navigation haben. Im Hauptbereich soll ein Liniendiagramm den Preisverlauf von Bitcoin simulieren. Darunter eine Tabelle mit Asset, Preis und 24h Aenderung. Die Tabelle soll man nach Preis sortieren koennen. Baue einen Dark Mode Switch ein, der das gesamte Theme aendert.",
    expectedMinFiles: 4,
    minCoverage: 0.75,
    checks: [
      { id: 'sidebar', test: /sidebar|navigation/i },
      { id: 'chart', test: /recharts|chart|linechart|line\s*chart/i },
      { id: 'table', test: /asset|24h|sort|price/i },
      { id: 'theme', test: /dark\s*mode|theme|toggle/i },
    ],
  },
];

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return factory(controller.signal).finally(() => clearTimeout(timer));
}

async function run(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', generateRouter);

  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Could not bind ephemeral port');
  const base = `http://127.0.0.1:${addr.port}`;

  const provider = (process.env.VITE_GEMINI_API_KEY && 'gemini') || 'openai';
  const caseTimeoutMs = Number(process.env.E2E_CASE_TIMEOUT_MS || 180000);
  const caseFilter = (process.env.E2E_CASE_FILTER || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const selectedCases = caseFilter.length > 0
    ? CASES.filter((testCase) => caseFilter.includes(testCase.id))
    : CASES;
  const results: CaseResult[] = [];
  const reportPath = path.resolve(process.cwd(), 'tests/evals/last-complex-report.json');

  const saveReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      provider,
      caseTimeoutMs,
      selectedCaseIds: selectedCases.map((entry) => entry.id),
      totalCases: results.length,
      passedCases: results.filter((entry) => entry.pass).length,
      averageScore:
        results.length > 0
          ? Math.round(results.reduce((sum, entry) => sum + (entry.overallScore || 0), 0) / results.length)
          : 0,
      results,
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  };

  console.log(`E2E complex prompt check started (provider=${provider}, caseTimeoutMs=${caseTimeoutMs})`);

  for (const testCase of selectedCases) {
    const started = Date.now();
    try {
      const response = await withTimeout(
        (signal) =>
          fetch(`${base}/api/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              prompt: testCase.prompt,
              provider,
              validate: true,
              bundle: true,
              maxTokens: 5200,
              featureFlags: {
                phase1: { specPass: true, architecturePass: true, selfCritique: true, repairLoop: true },
                phase2: { astRewrite: true, qualityScoring: true, multiFileGeneration: true },
                phase3: { dynamicPromptConditioning: true, intentAgent: true, dependencyIntelligence: true, styleDNA: true, componentMemory: true },
                enterprise: { astPatchExecutor: true, stylePolicy: true, libraryQuality: true, diffPreview: true, operationUndo: true, editTelemetry: true },
              },
            }),
            signal,
          }),
        caseTimeoutMs,
      );

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: 'NON_JSON_RESPONSE', raw: text.slice(0, 600) };
      }

      const files: Array<{ path: string; content: string }> = Array.isArray(data?.files) ? data.files : [];
      const codeCorpus = files.map((file) => file.content || '').join('\n\n');
      const checks = testCase.checks.map((check) => ({ id: check.id, ok: check.test.test(codeCorpus) }));
      const passedChecks = checks.filter((check) => check.ok).length;
      const coverageScore = checks.length > 0 ? passedChecks / checks.length : 0;
      const fileScore = Math.min(files.length / Math.max(testCase.expectedMinFiles, 1), 1);
      const buildHealthy =
        response.ok &&
        Boolean(data?.success) &&
        !data?.error &&
        (Array.isArray(data?.errors) ? data.errors.length === 0 : true);
      const overallScore = Math.round(((coverageScore * 0.6) + (fileScore * 0.15) + (buildHealthy ? 0.25 : 0)) * 100);
      const pass = buildHealthy && coverageScore >= testCase.minCoverage;

      const summary: CaseResult = {
        id: testCase.id,
        httpStatus: response.status,
        success: Boolean(data?.success),
        durationMs: Date.now() - started,
        fileCount: files.length,
        errorCount: Array.isArray(data?.errors) ? data.errors.length : 0,
        warningCount: Array.isArray(data?.warnings) ? data.warnings.length : 0,
        pipeline: {
          projectType: data?.pipeline?.plan?.projectType || null,
          pages: data?.pipeline?.plan?.pages || null,
          qualityCriticalCount: data?.pipeline?.verify?.qualityCriticalCount ?? null,
          verifyPass: data?.pipeline?.verify?.pass ?? null,
          editOutcome: data?.pipeline?.editOutcome?.status ?? null,
        },
        checks,
        passedChecks,
        totalChecks: checks.length,
        coverageScore: Number(coverageScore.toFixed(2)),
        fileScore: Number(fileScore.toFixed(2)),
        buildHealthy,
        overallScore,
        pass,
        topError: data?.error || (Array.isArray(data?.errors) ? data.errors[0] : null),
      };

      results.push(summary);
      saveReport();
      console.log(JSON.stringify(summary, null, 2));
    } catch (error: any) {
      const summary: CaseResult = {
        id: testCase.id,
        success: false,
        durationMs: Date.now() - started,
        exception: error?.message || String(error),
      };
      results.push(summary);
      saveReport();
      console.log(JSON.stringify(summary, null, 2));
    }
  }

  saveReport();
  console.log(`Saved report: ${reportPath}`);

  await new Promise<void>((resolve) => server.close(() => resolve()));

  const failedCases = results.filter((entry) => !entry.pass);
  if (failedCases.length > 0) {
    console.error(`E2E complex prompt check failed: ${failedCases.length}/${results.length}`);
    process.exit(1);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('E2E runner failed:', error);
  process.exit(1);
});
