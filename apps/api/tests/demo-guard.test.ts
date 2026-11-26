import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';
test('sample endpoints are disabled unless explicitly enabled', async () => {
  const previous = process.env.DALUMAGA_DEMO;
  delete process.env.DALUMAGA_DEMO;
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch((await app.getUrl()) + '/v1/demo/setup', { method: 'POST' });
    assert.equal(response.status, 403);
  } finally {
    await app.close();
    if (previous !== undefined) process.env.DALUMAGA_DEMO = previous;
  }
});
