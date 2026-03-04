import assert from 'node:assert/strict';
import { resolveRateLimitScopeKey } from '../server/middleware/rate-limiter.js';

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function makeReq(input: {
  authUserId?: string;
  projectIdBody?: string;
  projectIdQuery?: string;
  ip?: string;
}) {
  return {
    body: input.projectIdBody ? { projectId: input.projectIdBody } : {},
    query: input.projectIdQuery ? { projectId: input.projectIdQuery } : {},
    ip: input.ip || '127.0.0.1',
    socket: { remoteAddress: input.ip || '127.0.0.1' },
    authUser: input.authUserId ? { id: input.authUserId } : undefined,
  } as any;
}

console.log('\nStarting Rate Limiter Scope Tests...\n');

run('Uses auth user id when available', () => {
  const key = resolveRateLimitScopeKey(makeReq({ authUserId: 'user-123' }));
  assert.equal(key, 'user:user-123');
});

run('Adds project scope from body when present', () => {
  const key = resolveRateLimitScopeKey(
    makeReq({ authUserId: 'abc', projectIdBody: 'proj-001' })
  );
  assert.equal(key, 'user:abc|project:proj-001');
});

run('Falls back to query project id if body missing', () => {
  const key = resolveRateLimitScopeKey(
    makeReq({ authUserId: 'abc', projectIdQuery: 'proj-query' })
  );
  assert.equal(key, 'user:abc|project:proj-query');
});

run('Falls back to ip scope when auth user missing', () => {
  const key = resolveRateLimitScopeKey(makeReq({ ip: '10.0.0.8' }));
  assert.equal(key, 'ip:10.0.0.8');
});

run('Sanitizes unsafe project ids', () => {
  const key = resolveRateLimitScopeKey(
    makeReq({ authUserId: 'abc', projectIdBody: '../unsafe/../../id' })
  );
  assert.equal(key, 'user:abc|project:unsafeid');
});

console.log('\nAll rate limiter scope tests passed.');
