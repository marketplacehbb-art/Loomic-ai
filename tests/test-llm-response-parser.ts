import { parseLLMOutput, sanitizeGeneratedModuleCode } from '../server/ai/project-pipeline/llm-response-parser.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  const noisyModule = [
    'src/App.tsx: import React from "react";',
    'Dependencies: react, react-dom',
    'Notes: keep the design minimal',
    '',
    'export default function App() {',
    '  return <div>Hello</div>;',
    '}',
  ].join('\n');

  const sanitized = sanitizeGeneratedModuleCode(noisyModule);
  assert(!sanitized.includes('Dependencies:'), 'metadata label should be removed');
  assert(!sanitized.includes('Notes:'), 'notes label should be removed');
  assert(!sanitized.includes('src/App.tsx:'), 'inline file label should be removed');
  assert(/import React from ['"]react['"]/.test(sanitized), 'inline file label should preserve import code');
  assert(sanitized.includes('export default function App()'), 'component code should remain');

  const parsed = parseLLMOutput(noisyModule);
  assert(parsed.primaryCode.includes('export default function App()'), 'parser should keep the runtime module');
  assert(!parsed.primaryCode.includes('Dependencies:'), 'parser should not emit dependency metadata as code');

  const duplicateDefaultViaAlias = [
    'import React from "react";',
    'const App = () => <div>Hi</div>;',
    'export default App;',
    'export { App as default };',
  ].join('\n');

  const aliasSanitized = sanitizeGeneratedModuleCode(duplicateDefaultViaAlias);
  assert((aliasSanitized.match(/export\s+default\b/g) || []).length === 1, 'sanitizer should keep a single explicit default export');
  assert(!/export\s*\{\s*App\s+as\s+default\s*\}/.test(aliasSanitized), 'sanitizer should remove alias default when explicit default exists');

  const duplicateAliasOnly = [
    'const App = () => <div>Alias</div>;',
    'export { App as default };',
    'export { App as default };',
  ].join('\n');

  const aliasOnlySanitized = sanitizeGeneratedModuleCode(duplicateAliasOnly);
  assert((aliasOnlySanitized.match(/export\s*\{\s*App\s+as\s+default\s*\}/g) || []).length === 1, 'sanitizer should keep only one alias default export when no explicit default exists');

  console.log('test-llm-response-parser: ok');
}

runTests();
