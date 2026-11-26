import assert from 'node:assert/strict';
import test from 'node:test';
import { matchCrate } from '../src/crate-match';

const one = { loadId: 'load-1', crateCode: 'C044', recorded: false };
test('matches the exact assigned crate code and trims accidental outer whitespace', () => {
  assert.deepEqual(matchCrate(' C044 ', [one]), { kind: 'match', load: one });
  assert.equal(matchCrate('c044', [one]).kind, 'not-found');
  assert.equal(matchCrate('https://example.com/C044', [one]).kind, 'not-found');
  assert.equal(matchCrate(' ', [one]).kind, 'empty');
});
test('never chooses a completed or ambiguous reusable crate load', () => {
  assert.equal(matchCrate('C044', [{ ...one, recorded: true }]).kind, 'recorded');
  assert.equal(matchCrate('C044', [one, { ...one, loadId: 'load-2' }]).kind, 'ambiguous');
  assert.equal(
    matchCrate('C044', [one, { ...one, loadId: 'load-2', recorded: true }]).kind,
    'ambiguous',
  );
});
