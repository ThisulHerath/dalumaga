import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverPending } from '../src/deliver-pending';
import type { PendingWeighing } from '../src/queue';

test('lost acknowledgements leave the same event ID available for retry', async () => {
  const event: PendingWeighing = {
    id: 'event-1',
    loadId: 'load-1',
    stage: 'pickup',
    grossGrams: 20000,
    tareGrams: 2000,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
  const ids: string[] = [];
  const ack: string[] = [];
  const send = async (item: PendingWeighing) => {
    ids.push(item.id);
    if (ids.length < 3) throw new Error('Response lost');
    return { id: item.id, accepted: true };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(
      deliverPending([event], send, async (id) => {
        ack.push(id);
      }),
    );
  }
  assert.equal(
    await deliverPending([event], send, async (id) => {
      ack.push(id);
    }),
    1,
  );
  assert.deepEqual(ids, ['event-1', 'event-1', 'event-1']);
  assert.deepEqual(ack, ['event-1']);
});
test('a malformed acknowledgement does not clear the local record', async () => {
  const event: PendingWeighing = {
    id: 'one',
    loadId: 'one',
    stage: 'receipt',
    grossGrams: 17000,
    tareGrams: 2000,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
  let acknowledged = false;
  await assert.rejects(
    deliverPending(
      [event],
      async () => ({ id: 'wrong', accepted: true }),
      async () => {
        acknowledged = true;
      },
    ),
  );
  assert.equal(acknowledged, false);
});
