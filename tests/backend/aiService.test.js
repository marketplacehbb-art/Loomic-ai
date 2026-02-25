import { test } from 'node:test';

test.skip('AI Service smoke test (legacy CommonJS backend)', () => {
  // Legacy backend modules are CommonJS and are not directly executable
  // in this package's ESM test runtime.
});
