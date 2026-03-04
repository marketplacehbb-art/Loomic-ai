import assert from 'node:assert/strict';
import { buildUsageStats } from '../server/middleware/usage-monitor.js';

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

console.log('\nStarting Usage Monitor Stats Tests...\n');

run('Uses account quota when no project quota exists', () => {
  const stats = buildUsageStats({
    account: {
      allowed: true,
      plan: 'free',
      quota_requests: 50,
      remaining_requests: 44,
      used_requests: 6,
      quota_tokens: 100000,
      used_tokens: 1200,
    },
  });

  assert.equal(stats.scope, 'user');
  assert.equal(stats.limit, 50);
  assert.equal(stats.remaining, 44);
  assert.equal(stats.used, 6);
  assert.equal(stats.tokenLimit, 100000);
  assert.equal(stats.tokensUsed, 1200);
  assert.equal(stats.accountLimit, 50);
  assert.equal(stats.projectLimit, undefined);
});

run('Uses project quota as scoped quota when available', () => {
  const stats = buildUsageStats({
    account: {
      allowed: true,
      plan: 'pro',
      quota_requests: 500,
      remaining_requests: 490,
      used_requests: 10,
      quota_tokens: 800000,
      used_tokens: 5000,
    },
    project: {
      allowed: true,
      plan: 'project',
      quota_requests: 25,
      remaining_requests: 20,
      used_requests: 5,
      quota_tokens: 50000,
      used_tokens: 2500,
    },
    projectId: '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(stats.scope, 'project');
  assert.equal(stats.projectId, '11111111-1111-4111-8111-111111111111');
  assert.equal(stats.limit, 25);
  assert.equal(stats.remaining, 20);
  assert.equal(stats.used, 5);
  assert.equal(stats.tokenLimit, 50000);
  assert.equal(stats.tokensUsed, 2500);
  assert.equal(stats.accountLimit, 500);
  assert.equal(stats.accountUsed, 10);
  assert.equal(stats.projectLimit, 25);
  assert.equal(stats.projectUsed, 5);
});

console.log('\nAll usage monitor stats tests passed.');
