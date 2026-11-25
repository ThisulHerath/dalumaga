import assert from 'node:assert/strict';
import test from 'node:test';
import { checkApi } from '../src/check-api';
test('checks the health endpoint and rejects incompatible responses', async () => {
  await checkApi('https://example.test/v1/', async (url) => {
    assert.equal(url, 'https://example.test/v1/health');
    return Response.json({ service: 'DaluMaga', status: 'ok' });
  });
  await assert.rejects(checkApi('https://example.test/v1', async () => Response.json({})));
});
