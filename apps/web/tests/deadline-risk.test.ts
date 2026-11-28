import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDeadline } from '../src/deadline-risk';
const now = Date.parse('2026-01-01T10:00:00Z');
const base = {
  deadline: '2026-01-01T10:30:00Z',
  fixAt: '2026-01-01T09:59:00Z',
  source: 'simulator',
  estimate: { minutes: 30, createdAt: now, fixAt: '2026-01-01T09:59:00Z' },
  now,
  maxAgeMinutes: 10,
};
test('only later than the deadline is at risk', () => {
  assert.equal(assessDeadline(base).kind, 'on-time');
  const r = assessDeadline({ ...base, estimate: { ...base.estimate, minutes: 31 } });
  assert.equal(r.kind, 'at-risk');
  if (r.kind === 'at-risk') assert.equal(r.delayMinutes, 1);
});
test('missing, stale, changed or future inputs never produce an ETA', () => {
  for (const patch of [
    { deadline: null },
    { fixAt: null },
    { source: 'tracker' },
    { fixAt: '2026-01-01T09:00:00Z' },
    { fixAt: '2026-01-01T10:01:00Z' },
    { estimate: null },
    { estimate: { ...base.estimate, fixAt: '2026-01-01T09:58:00Z' } },
    { estimate: { ...base.estimate, createdAt: now + 1 } },
    { estimate: { ...base.estimate, minutes: 721 } },
    { maxAgeMinutes: 0 },
  ])
    assert.equal(assessDeadline({ ...base, ...patch }).kind, 'unknown');
  assert.deepEqual(assessDeadline({ ...base, now: now + 31 * 60_000 }), {
    kind: 'overdue',
    deadline: now + 30 * 60_000,
  });
});
test('an elapsed predicted arrival is not presented as a current prediction', () => {
  const r = assessDeadline({
    ...base,
    estimate: { ...base.estimate, minutes: 0 },
    now: now + 1000,
  });
  assert.deepEqual(r, { kind: 'unknown', reason: 'stale-estimate' });
});
