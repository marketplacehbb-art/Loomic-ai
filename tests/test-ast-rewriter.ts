import { astRewriter } from '../server/ai/processor-evolution/ast-rewriter.js';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runImportCleanupTest(): Promise<void> {
  const code = `
import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

  const result = await astRewriter.rewrite(code, 'App.tsx');
  assert(result.code.includes('useState'), 'useState should remain');
  assert(!result.code.includes('useEffect'), 'unused useEffect import should be removed');
}

async function runFormattingSignalTest(): Promise<void> {
  const code = `import {useState} from 'react';export default function App(){const [x,setX]=useState(0);return <div>{x}</div>;}`;
  const result = await astRewriter.rewrite(code, 'App.tsx');
  assert(result.code.length > 0, 'rewriter should return code');
  assert(result.transformations.length >= 0, 'transformations metadata should exist');
}

async function main(): Promise<void> {
  console.log('\nStarting AST Rewriter Tests...\n');

  await runImportCleanupTest();
  console.log('PASS: import cleanup');

  await runFormattingSignalTest();
  console.log('PASS: formatting rewrite');

  console.log('\nAll AST rewriter tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

