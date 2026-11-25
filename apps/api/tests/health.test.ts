import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';
test('GET /v1/health returns the shared contract', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch((await app.getUrl()) + '/v1/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: 'DaluMaga', status: 'ok' });
  } finally {
    await app.close();
  }
});
