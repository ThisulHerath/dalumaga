import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoService } from '../src/demo';

test('sample database URL cannot redirect a local host to another server', async () => {
  const originalEnabled = process.env.DALUMAGA_DEMO;
  const originalUrl = process.env.DALUMAGA_DEMO_DATABASE_URL;
  process.env.DALUMAGA_DEMO = 'true';
  process.env.DALUMAGA_DEMO_DATABASE_URL =
    'postgresql://demo@localhost/dalumaga_demo?host=remote.example';
  try {
    await assert.rejects(new DemoService().seed(), /local dalumaga_demo/);
  } finally {
    if (originalEnabled === undefined) delete process.env.DALUMAGA_DEMO;
    else process.env.DALUMAGA_DEMO = originalEnabled;
    if (originalUrl === undefined) delete process.env.DALUMAGA_DEMO_DATABASE_URL;
    else process.env.DALUMAGA_DEMO_DATABASE_URL = originalUrl;
  }
});
