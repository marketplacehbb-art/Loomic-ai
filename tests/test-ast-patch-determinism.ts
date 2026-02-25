import { applyAstPatches, type AstPatchOperation } from '../server/ai/processor-evolution/ast-rewriter.js';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runUniqueSelectorTest(): void {
  const code = `
export default function App() {
  return (
    <div>
      <button data-source-id="src/App.tsx:5:7" className="px-2">One</button>
      <button data-source-id="src/App.tsx:6:7" className="px-2">Two</button>
    </div>
  );
}
`;

  const ops: AstPatchOperation[] = [{
    op: 'add_class',
    file: 'src/App.tsx',
    selector: '[data-source-id="src/App.tsx:5:7"]',
    classes: ['text-red-500'],
  }];

  const result = applyAstPatches(code, ops);
  assert(result.applied.length === 1, 'Unique selector should apply exactly once');
  assert(result.failed.length === 0, 'Unique selector should not fail');
  assert(result.code.includes('text-red-500'), 'Patched code should include new class');
}

function runAmbiguousSelectorTest(): void {
  const code = `
export default function App() {
  return (
    <div>
      <button className="cta">One</button>
      <button className="cta">Two</button>
    </div>
  );
}
`;

  const ops: AstPatchOperation[] = [{
    op: 'add_class',
    file: 'src/App.tsx',
    selector: '.cta',
    classes: ['text-red-500'],
  }];

  const result = applyAstPatches(code, ops);
  assert(result.applied.length === 0, 'Ambiguous selector should not be applied');
  assert(result.failed.length === 1, 'Ambiguous selector should fail once');
  assert(
    (result.failed[0]?.reason || '').toLowerCase().includes('ambiguous'),
    'Ambiguous selector failure should explain ambiguity'
  );
}

function runMissingSelectorTest(): void {
  const code = `
export default function App() {
  return <div>Hello</div>;
}
`;

  const ops: AstPatchOperation[] = [{
    op: 'replace_text',
    file: 'src/App.tsx',
    selector: '',
    text: 'World',
  }];

  const result = applyAstPatches(code, ops);
  assert(result.applied.length === 0, 'Missing selector should not be applied');
  assert(result.failed.length === 1, 'Missing selector should fail once');
  assert(
    (result.failed[0]?.reason || '').toLowerCase().includes('selector or sourceid is required'),
    'Missing selector failure should mention selector/sourceId requirement'
  );
}

function runSourceIdAnchorTest(): void {
  const code = [
    'export default function App() {',
    '  return (',
    '    <div>',
    '      <h1 className="title">Old</h1>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');

  const ops: AstPatchOperation[] = [{
    op: 'replace_text',
    file: 'src/App.tsx',
    selector: '',
    sourceId: 'src/App.tsx:4:7',
    text: 'New',
  }];

  const result = applyAstPatches(code, ops);
  assert(result.applied.length === 1, 'sourceId anchor should apply without data-source-id attributes');
  assert(result.failed.length === 0, 'sourceId anchor should not fail');
  assert(result.code.includes('>New</h1>'), 'sourceId patch should replace element text content');
}

function main(): void {
  console.log('\nStarting AST Patch Determinism Tests...\n');

  runUniqueSelectorTest();
  console.log('PASS: unique selector patch');

  runAmbiguousSelectorTest();
  console.log('PASS: ambiguous selector blocked');

  runMissingSelectorTest();
  console.log('PASS: missing selector blocked');

  runSourceIdAnchorTest();
  console.log('PASS: sourceId anchor patch');

  console.log('\nAll AST patch determinism tests passed.');
}

main();
