import assert from 'node:assert/strict';
import type { Request } from 'express';
import { evaluateReleaseDecision, updateReleaseConfig } from '../server/middleware/release-control.js';

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function makeReq(input: { userId?: string; ip?: string } = {}): Request {
  return {
    ip: input.ip || '127.0.0.1',
    socket: { remoteAddress: input.ip || '127.0.0.1' },
    authUser: input.userId ? { id: input.userId } : undefined,
  } as any as Request;
}

console.log('\nStarting Release Control Tests...\n');

run('Stable mode allows requests on stable track', () => {
  updateReleaseConfig({ mode: 'stable', killSwitch: false, enforceCanary: false, canaryPercent: 0 });
  const decision = evaluateReleaseDecision(makeReq({ userId: 'user-1' }));
  assert.equal(decision.allow, true);
  assert.equal(decision.track, 'stable');
});

run('Canary mode with 100% rollout assigns canary track', () => {
  updateReleaseConfig({ mode: 'canary', killSwitch: false, enforceCanary: false, canaryPercent: 100 });
  const decision = evaluateReleaseDecision(makeReq({ userId: 'user-2' }));
  assert.equal(decision.allow, true);
  assert.equal(decision.track, 'canary');
});

run('Canary enforce mode blocks non-selected traffic', () => {
  updateReleaseConfig({ mode: 'canary', killSwitch: false, enforceCanary: true, canaryPercent: 0 });
  const decision = evaluateReleaseDecision(makeReq({ userId: 'user-3' }));
  assert.equal(decision.allow, false);
  assert.equal(decision.reasonCode, 'RELEASE_CANARY_NOT_SELECTED');
});

run('Kill switch blocks all traffic', () => {
  updateReleaseConfig({ mode: 'stable', killSwitch: true, enforceCanary: false, canaryPercent: 100 });
  const decision = evaluateReleaseDecision(makeReq({ userId: 'user-4' }));
  assert.equal(decision.allow, false);
  assert.equal(decision.reasonCode, 'RELEASE_KILL_SWITCH');
});

run('Maintenance mode blocks all traffic', () => {
  updateReleaseConfig({ mode: 'maintenance', killSwitch: false, enforceCanary: false, canaryPercent: 100 });
  const decision = evaluateReleaseDecision(makeReq({ userId: 'user-5' }));
  assert.equal(decision.allow, false);
  assert.equal(decision.reasonCode, 'RELEASE_MAINTENANCE');
});

run('Percent is clamped to valid range', () => {
  const updated = updateReleaseConfig({ mode: 'canary', killSwitch: false, enforceCanary: false, canaryPercent: 999 });
  assert.equal(updated.canaryPercent, 100);
});

// reset for other tests/processes
updateReleaseConfig({ mode: 'stable', killSwitch: false, enforceCanary: false, canaryPercent: 100, reason: 'default' });

console.log('\nAll release control tests passed.');
