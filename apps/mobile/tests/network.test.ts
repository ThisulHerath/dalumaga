import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithTimeout } from '../src/network';
test('a stalled request is aborted so a later sync can retry', async () => {
  let aborted = false;
  await assert.rejects(
    fetchWithTimeout('https://example.test', {}, 5, async (_url, options) => {
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('timeout'));
        });
      });
      return new Response();
    }),
  );
  assert.equal(aborted, true);
});
test('the timeout remains active until the response body finishes', async () => {
  await assert.rejects(
    fetchWithTimeout('https://example.test', {}, 5, async (_url, options) => {
      const response = {
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('body timeout')));
          }),
      };
      return response as Response;
    }),
  );
});
