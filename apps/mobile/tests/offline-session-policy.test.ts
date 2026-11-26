import assert from 'node:assert/strict';
import test from 'node:test';
import { canUnlockSavedSession } from '../src/offline-session-policy';
test('saved session requires a valid unexpired time window', () => {
  const expiry = '2026-01-01T12:00:00.000Z';
  const saved = Date.parse('2026-01-01T10:00:00.000Z');
  assert.equal(canUnlockSavedSession(saved, expiry, saved + 1000), true);
  assert.equal(canUnlockSavedSession(saved, expiry, saved - 1), false);
  assert.equal(canUnlockSavedSession(saved, expiry, Date.parse(expiry)), false);
  assert.equal(canUnlockSavedSession(saved, 'invalid', saved), false);
});
