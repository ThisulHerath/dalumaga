import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverDriverEvents, DriverSessionError } from '../src/deliver-driver';
const stop = { id: 'stop-1', payload: 'stop' },
  resume = { id: 'resume-1', payload: 'resume' };
test('offline and lost acknowledgement retain event IDs and preserve stop ordering', async () => {
  const acked: string[] = [];
  let attempts = 0;
  const send = async (row: typeof stop) => {
    attempts++;
    if (attempts === 1) throw Error('offline');
    return { ok: true, status: 201, data: { id: row.id, accepted: true } };
  };
  await assert.rejects(
    deliverDriverEvents([stop, resume], send, async (id) => {
      acked.push(id);
    }),
    /offline/,
  );
  assert.equal(acked.length, 0);
  const delivered: string[] = [];
  await deliverDriverEvents(
    [stop, resume],
    async (row) => {
      delivered.push(row.id);
      return send(row);
    },
    async (id) => {
      acked.push(id);
    },
  );
  assert.deepEqual(delivered, ['stop-1', 'resume-1']);
  assert.deepEqual(acked, ['stop-1', 'resume-1']);
});
test('conflicts, bad acknowledgements and expired sessions never acknowledge pending data', async () => {
  for (const result of [
    { ok: false, status: 409, data: null },
    { ok: true, status: 201, data: { id: 'wrong', accepted: true } },
    { ok: false, status: 401, data: null },
  ]) {
    const acked: string[] = [];
    await assert.rejects(
      deliverDriverEvents(
        [stop, resume],
        async () => result,
        async (id) => {
          acked.push(id);
        },
      ),
    );
    assert.deepEqual(acked, []);
  }
  await assert.rejects(
    deliverDriverEvents(
      [stop],
      async () => ({ ok: false, status: 401, data: null }),
      async () => {},
    ),
    DriverSessionError,
  );
});
