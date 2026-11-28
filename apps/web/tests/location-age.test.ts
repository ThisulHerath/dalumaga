import assert from 'node:assert/strict';
import test from 'node:test';
import { locationAge } from '../src/location-age';
test('missing, stale and future location times never imply a stop', () => {
  const now = Date.parse('2026-01-01T01:00:00Z');
  assert.match(locationAge(null, now), /unknown/);
  assert.match(locationAge('2026-01-01T00:57:00Z', now), /3 minutes/);
  assert.match(locationAge('2026-01-01T01:01:00Z', now), /future/);
  assert.match(locationAge('invalid', now), /Invalid/);
});
