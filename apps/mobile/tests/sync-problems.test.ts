import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverPending, PermanentSyncError } from '../src/deliver-pending';
import type { PendingWeighing } from '../src/queue';

test('a conflicting pickup is retained and does not prevent an independent receipt', async () => {
  const base = {
    loadId: 'load-1',
    grossGrams: 20000,
    tareGrams: 2000,
    occurredAt: '2026-01-01T00:00:00Z',
  };
  const pickup: PendingWeighing = { ...base, id: 'pickup', stage: 'pickup' };
  const receipt: PendingWeighing = { ...base, id: 'receipt', stage: 'receipt' };
  const issues: string[] = [];
  const acknowledgements: string[] = [];
  const sent: string[] = [];
  const count = await deliverPending(
    [pickup, receipt],
    async (event) => {
      sent.push(event.id);
      if (event.id === 'pickup') throw new PermanentSyncError('conflict');
      return { id: event.id, accepted: true };
    },
    async (id) => {
      acknowledgements.push(id);
    },
    async (id, code) => {
      issues.push(id + ':' + code);
    },
  );
  assert.equal(count, 1);
  assert.deepEqual(sent, ['pickup', 'receipt']);
  assert.deepEqual(acknowledgements, ['receipt']);
  assert.deepEqual(issues, ['pickup:conflict']);
});
test('transient failures leave the event pending', async () => {
  const event: PendingWeighing = {
    id: 'one',
    loadId: 'load',
    stage: 'pickup',
    grossGrams: 20000,
    tareGrams: 2000,
    occurredAt: '2026-01-01T00:00:00Z',
  };
  let stored = false;
  await assert.rejects(
    deliverPending(
      [event],
      async () => {
        throw new Error('network');
      },
      async () => {
        stored = true;
      },
      async () => {
        stored = true;
      },
    ),
  );
  assert.equal(stored, false);
});
