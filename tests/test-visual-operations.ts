import { buildVisualOperationsFromIntent, type VisualOperationAnchor } from '../client/src/lib/visual-operations';

interface TestAnchor extends VisualOperationAnchor {
  stable?: boolean;
  selector?: string | null;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const isReliableVisualAnchor = (anchor: TestAnchor | null | undefined): boolean =>
  Boolean(anchor?.stable);

const selectorForAnchor = (anchor: TestAnchor): string | null =>
  anchor.selector || null;

const resolveSourceFileFromSourceId = (sourceId?: string): string | null => {
  if (!sourceId) return null;
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  return parts.slice(0, -2).join(':');
};

function runScopeSelectionTest(): void {
  const primary: TestAnchor = { stable: true, selector: '[data-source-id="src/App.tsx:4:5"]', sourceId: 'src/App.tsx:4:5' };
  const secondary: TestAnchor = { stable: true, selector: '[data-source-id="src/App.tsx:8:5"]', sourceId: 'src/App.tsx:8:5' };

  const ops = buildVisualOperationsFromIntent({
    intent: { op: 'replace_text', applyToAllSelected: false, value: 'Only one' },
    selectedEditAnchor: primary,
    selectedEditAnchors: [primary, secondary],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });

  assert(ops.length === 1, 'Single-target mode should only generate one operation');
  assert(ops[0].selector === primary.selector, 'Primary anchor should be used in single-target mode');
}

function runAnchorValidationTest(): void {
  const anchors: TestAnchor[] = [
    { stable: false, selector: '[data-source-id="src/App.tsx:1:1"]', sourceId: 'src/App.tsx:1:1' },
    { stable: true, selector: null, sourceId: 'src/App.tsx:2:1' },
    { stable: true, selector: '[data-source-id="invalid"]', sourceId: 'invalid' },
    { stable: true, selector: '[data-source-id="src/App.tsx:3:1"]', sourceId: 'src/App.tsx:3:1' },
  ];

  const ops = buildVisualOperationsFromIntent({
    intent: { op: 'replace_text', applyToAllSelected: true, value: 'ok' },
    selectedEditAnchor: anchors[0],
    selectedEditAnchors: anchors,
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });

  assert(ops.length === 1, 'Only fully valid anchors should generate operations');
  assert(ops[0].file === 'src/App.tsx', 'Valid source ids should resolve to file paths');
}

function runClassAndPropNormalizationTests(): void {
  const anchor: TestAnchor = {
    stable: true,
    selector: '[data-source-id="src/App.tsx:5:7"]',
    sourceId: 'src/App.tsx:5:7',
  };

  const classOps = buildVisualOperationsFromIntent({
    intent: { op: 'add_class', applyToAllSelected: false, classes: ['  text-lg ', '', 'font-bold'] },
    selectedEditAnchor: anchor,
    selectedEditAnchors: [anchor],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });
  assert(classOps.length === 1, 'Class operation should be created for non-empty class tokens');
  assert(classOps[0].op === 'add_class', 'Expected add_class operation');
  if (classOps[0].op !== 'add_class') {
    throw new Error('Expected add_class operation');
  }
  assert(classOps[0].classes.join(' ') === 'text-lg font-bold', 'Class tokens must be trimmed and filtered');

  const setPropOps = buildVisualOperationsFromIntent({
    intent: { op: 'set_prop', applyToAllSelected: false, prop: 'title', propValue: 'Hello' },
    selectedEditAnchor: anchor,
    selectedEditAnchors: [anchor],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });
  assert(setPropOps.length === 1, 'set_prop should produce one operation');
  if (setPropOps[0].op !== 'set_prop') {
    throw new Error('Expected set_prop operation');
  }
  assert(setPropOps[0].value === '"Hello"', 'Raw prop values should be JSON-stringified');

  const removePropOps = buildVisualOperationsFromIntent({
    intent: { op: 'remove_prop', applyToAllSelected: false, prop: 'disabled' },
    selectedEditAnchor: anchor,
    selectedEditAnchors: [anchor],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });
  assert(removePropOps.length === 1, 'remove_prop should produce one operation when prop exists');
}

function runMissingDataGuardsTest(): void {
  const anchor: TestAnchor = {
    stable: true,
    selector: '[data-source-id="src/App.tsx:5:7"]',
    sourceId: 'src/App.tsx:5:7',
  };

  const emptyClassOps = buildVisualOperationsFromIntent({
    intent: { op: 'remove_class', applyToAllSelected: false, classes: [' ', '\n'] },
    selectedEditAnchor: anchor,
    selectedEditAnchors: [anchor],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });
  assert(emptyClassOps.length === 0, 'Empty class payload must not generate operations');

  const missingPropOps = buildVisualOperationsFromIntent({
    intent: { op: 'remove_prop', applyToAllSelected: false },
    selectedEditAnchor: anchor,
    selectedEditAnchors: [anchor],
    isReliableVisualAnchor,
    selectorForAnchor,
    resolveSourceFileFromSourceId,
  });
  assert(missingPropOps.length === 0, 'remove_prop without prop must be ignored');
}

function main(): void {
  console.log('\nStarting Visual Operation Builder Tests...\n');
  runScopeSelectionTest();
  console.log('PASS: selection scope');
  runAnchorValidationTest();
  console.log('PASS: anchor validation');
  runClassAndPropNormalizationTests();
  console.log('PASS: class/prop normalization');
  runMissingDataGuardsTest();
  console.log('PASS: missing data guards');
  console.log('\nAll visual operation builder tests passed.');
}

main();
