import assert from 'node:assert/strict';
import test from 'node:test';
import { RoleSchema, WeightGramsSchema } from '../src/index.js';

test('pilot roles and whole, nonnegative gram readings', () => {
  assert.equal(RoleSchema.parse('receiver'), 'receiver');
  assert.equal(RoleSchema.safeParse('owner').success, false);
  assert.equal(WeightGramsSchema.parse(18000), 18000);
  for (const invalid of [-1, 0.5, 1_000_000_000])
    assert.equal(WeightGramsSchema.safeParse(invalid).success, false);
});
