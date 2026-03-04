import assert from 'node:assert/strict';
import { gitRouteSchemas } from '../server/api/git/routes.js';
import { scanHistoryQuerySchema, scanInputSchema } from '../server/api/security/scan.js';

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

console.log('\nStarting Security Input Validation Tests...\n');

run('Git init accepts safe payload', () => {
  const parsed = gitRouteSchemas.init.safeParse({
    projectId: 'default',
    files: {
      'src/App.tsx': 'export default function App() { return null; }',
    },
  });
  assert.equal(parsed.success, true);
});

run('Git init rejects unsafe traversal path', () => {
  const parsed = gitRouteSchemas.init.safeParse({
    projectId: 'default',
    files: {
      '../secrets.txt': 'x',
    },
  });
  assert.equal(parsed.success, false);
});

run('Git commit rejects empty message', () => {
  const parsed = gitRouteSchemas.commit.safeParse({
    projectId: 'default',
    message: '   ',
  });
  assert.equal(parsed.success, false);
});

run('Git push rejects oversized token', () => {
  const parsed = gitRouteSchemas.push.safeParse({
    projectId: 'default',
    remote: 'origin',
    branch: 'main',
    token: 'a'.repeat(5000),
  });
  assert.equal(parsed.success, false);
});

run('Security scan rejects oversized file payload', () => {
  const hugeContent = 'a'.repeat(500_001);
  const parsed = scanInputSchema.safeParse({
    projectId: '11111111-1111-1111-1111-111111111111',
    environment: 'test',
    files: {
      'src/huge.txt': hugeContent,
    },
  });
  assert.equal(parsed.success, false);
});

run('Security history query requires UUID projectId', () => {
  const parsed = scanHistoryQuerySchema.safeParse({ projectId: 'default' });
  assert.equal(parsed.success, false);
});

console.log('\nAll security input validation tests passed.');
