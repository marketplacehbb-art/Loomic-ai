import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { composeTemplateProject } from '../../server/ai/template-library/composer.js';
import { createResolvedProjectPlan } from '../../server/ai/template-library/project-plan.js';
import { evaluateQualityGates } from '../../server/ai/project-pipeline/quality-gates.js';

interface GoldenCase {
  id: string;
  prompt: string;
  projectId?: string;
}

interface GoldenSnapshot {
  id: string;
  plan: {
    projectType: string;
    mode: string;
    templateId: string;
    features: string[];
    routes: string[];
    resolvedBlockIds: string[];
    selectedBlockIds: string[];
    fileCount: number;
  };
  quality: {
    pass: boolean;
    overall: number;
    visualScore: number;
    accessibilityScore: number;
    performanceScore: number;
    criticalCount: number;
    warningCount: number;
  };
}

interface GoldenBaseline {
  generatedAt: string;
  snapshots: GoldenSnapshot[];
}

const CASES_PATH = path.resolve(process.cwd(), 'tests/evals/generator-golden-cases.json');
const BASELINE_PATH = path.resolve(process.cwd(), 'tests/evals/generator-golden-baseline.json');
const UPDATE_MODE = process.argv.includes('--update');

function readCases(): GoldenCase[] {
  const raw = fs.readFileSync(CASES_PATH, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Golden cases file is empty or invalid.');
  }

  return parsed.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const prompt = String(item.prompt || '').trim();
    const projectId = String(item.projectId || '').trim();

    if (!id || !prompt) {
      throw new Error(`Invalid golden case at index ${index}: id/prompt required.`);
    }

    return {
      id,
      prompt,
      projectId: projectId || undefined,
    };
  });
}

async function evaluateCase(testCase: GoldenCase): Promise<GoldenSnapshot> {
  const resolved = createResolvedProjectPlan({
    prompt: testCase.prompt,
    generationMode: 'new',
    existingFiles: {},
    projectId: testCase.projectId || `golden-${testCase.id}`,
  });

  const composed = composeTemplateProject({
    templateId: resolved.finalPlan.templateId,
    prompt: testCase.prompt,
    forceBlockIds: resolved.resolvedBlockIds,
    projectName: resolved.finalPlan.brand,
    planContextPrompt: resolved.planContextPrompt,
    pagePaths: resolved.finalPlan.pages.map((page) => page.path),
  });

  const qualityGate = await evaluateQualityGates({
    files: composed.files,
    primaryPath: 'src/App.tsx',
    prompt: testCase.prompt,
  });

  const criticalCount = qualityGate.findings.filter((finding) => finding.severity === 'critical').length;
  const warningCount = qualityGate.findings.filter((finding) => finding.severity === 'warning').length;

  return {
    id: testCase.id,
    plan: {
      projectType: resolved.finalPlan.projectType,
      mode: resolved.finalPlan.mode,
      templateId: resolved.finalPlan.templateId,
      features: [...resolved.finalPlan.features].sort(),
      routes: resolved.finalPlan.pages.map((page) => page.path).sort(),
      resolvedBlockIds: [...resolved.resolvedBlockIds],
      selectedBlockIds: composed.selectedBlocks.map((block) => block.id),
      fileCount: Object.keys(composed.files).length,
    },
    quality: {
      pass: qualityGate.pass,
      overall: qualityGate.overall,
      visualScore: qualityGate.visual.score,
      accessibilityScore: qualityGate.accessibility.score,
      performanceScore: qualityGate.performance.score,
      criticalCount,
      warningCount,
    },
  };
}

function printSnapshot(snapshot: GoldenSnapshot): void {
  console.log(
    `- ${snapshot.id}: type=${snapshot.plan.projectType} mode=${snapshot.plan.mode} quality=${snapshot.quality.overall} pass=${snapshot.quality.pass}`
  );
}

async function run(): Promise<void> {
  const cases = readCases();
  const snapshots: GoldenSnapshot[] = [];

  console.log('=== Generator Golden Regression ===');
  for (const testCase of cases) {
    const snapshot = await evaluateCase(testCase);
    snapshots.push(snapshot);
    printSnapshot(snapshot);
  }

  if (UPDATE_MODE) {
    const baseline: GoldenBaseline = {
      generatedAt: new Date().toISOString(),
      snapshots,
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`Updated golden baseline: ${BASELINE_PATH}`);
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`Missing baseline file: ${BASELINE_PATH}. Run: npm run test:golden:update`);
  }

  const baselineRaw = fs.readFileSync(BASELINE_PATH, 'utf8');
  const baseline = JSON.parse(baselineRaw) as GoldenBaseline;

  const expectedById = new Map<string, GoldenSnapshot>((baseline.snapshots || []).map((entry) => [entry.id, entry]));
  let failureCount = 0;

  for (const actual of snapshots) {
    const expected = expectedById.get(actual.id);
    if (!expected) {
      failureCount += 1;
      console.error(`FAIL ${actual.id}: missing baseline entry`);
      continue;
    }

    try {
      assert.deepStrictEqual(actual, expected);
      console.log(`PASS ${actual.id}`);
    } catch (error: any) {
      failureCount += 1;
      console.error(`FAIL ${actual.id}`);
      console.error(error?.message || String(error));
    }
  }

  const actualIds = new Set(snapshots.map((entry) => entry.id));
  for (const expectedId of expectedById.keys()) {
    if (!actualIds.has(expectedId)) {
      failureCount += 1;
      console.error(`FAIL ${expectedId}: present in baseline but missing in current run`);
    }
  }

  if (failureCount > 0) {
    console.error(`Golden regression failed with ${failureCount} mismatch(es).`);
    process.exit(1);
  }

  console.log(`Golden regression passed: ${snapshots.length}/${snapshots.length}`);
}

run().catch((error) => {
  console.error('Golden regression runner failed:', error);
  process.exit(1);
});
