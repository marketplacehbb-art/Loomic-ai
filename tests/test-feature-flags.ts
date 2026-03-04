import { getFeatureFlags } from '../server/config/feature-flags.js';
import assert from 'node:assert';

function runTests() {
    const originalEnv = { ...process.env };

    try {
        // 1. Without env vars, it should use the defaults (which are currently all false,
        // but the key point is it shouldn't randomly evaluate to false if not set,
        // though the bug was that they evaluated to false ALWAYS if not set).
        process.env = {};
        let flags = getFeatureFlags();
        assert.strictEqual(flags.phase1.specPass, false, 'Default should be false');

        // 2. Set an env var to true
        process.env = {
            FEATURE_SPEC_PASS: 'true'
        };
        flags = getFeatureFlags();
        assert.strictEqual(flags.phase1.specPass, true, 'Env var should override to true');
        assert.strictEqual(flags.phase1.architecturePass, false, 'Unset env var should remain default (false)');

        // 3. Set an env var to false explicitly
        process.env = {
            FEATURE_SPEC_PASS: 'false'
        };
        flags = getFeatureFlags();
        assert.strictEqual(flags.phase1.specPass, false, 'Env var should override to false explicitly');

        console.log('test-feature-flags: ok');
    } finally {
        process.env = originalEnv;
    }
}

runTests();
