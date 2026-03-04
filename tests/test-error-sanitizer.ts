import assert from 'node:assert/strict';
import {
  redactSensitiveText,
  sanitizeErrorForLog,
  sanitizeErrorMessage,
} from '../server/utils/error-sanitizer.js';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

console.log('\nStarting Error Sanitizer Tests...\n');

test('Redacts OpenAI style secret from free text', () => {
  const input = 'Provider failed with key sk-proj-ABCDEF1234567890SECRETXYZ';
  const output = redactSensitiveText(input);
  assert.ok(!output.includes('sk-proj-ABCDEF1234567890SECRETXYZ'));
  assert.ok(output.includes('[REDACTED_OPENAI_KEY]'));
});

test('Redacts Bearer token and JWT-like values', () => {
  const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';
  const output = redactSensitiveText(input);
  assert.ok(!output.toLowerCase().includes('bearer eyj'));
  assert.ok(output.includes('Bearer [REDACTED]') || output.includes('[REDACTED_JWT]'));
});

test('SanitizeErrorMessage keeps fallback when no message exists', () => {
  const output = sanitizeErrorMessage({}, { fallback: 'fallback-message' });
  assert.equal(output, 'fallback-message');
});

test('SanitizeErrorMessage normalizes multiline and truncates safely', () => {
  const input = new Error('line1\nline2\nline3 sk-proj-VERYSECRET1234567890');
  const output = sanitizeErrorMessage(input, { maxLength: 40 });
  assert.ok(!output.includes('\n'));
  assert.ok(!output.includes('VERYSECRET1234567890'));
  assert.ok(output.length <= 40);
});

test('SanitizeErrorForLog redacts OpenRouter tokens', () => {
  const output = sanitizeErrorForLog('or-abcdefghijklmnopqrstuvwx1234567890 leaked');
  assert.ok(!output.includes('or-abcdefghijklmnopqrstuvwx1234567890'));
  assert.ok(output.includes('[REDACTED_OPENROUTER_KEY]'));
});

console.log('\nAll error sanitizer tests passed.');
