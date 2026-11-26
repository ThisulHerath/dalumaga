import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DemoService } from '../src/demo';

test(
  'receipt first and pickup retried twice create one comparison',
  { skip: !process.env.DALUMAGA_DEMO_DATABASE_URL },
  async () => {
    process.env.DALUMAGA_DEMO = 'true';
    const service = new DemoService();
    try {
      const sample = await service.seed();
      const base = { loadId: sample.loadId, tareGrams: 2000, occurredAt: new Date().toISOString() };
      const receipt = { ...base, id: randomUUID(), stage: 'receipt', grossGrams: 17000 };
      const pickup = { ...base, id: randomUUID(), stage: 'pickup', grossGrams: 20000 };
      await service.upload(receipt);
      assert.equal((await service.comparison()).differenceKg, null);
      await service.upload(pickup);
      await service.upload(pickup);
      await service.upload(pickup);
      assert.equal(Number((await service.comparison()).differenceKg), -3);
      await assert.rejects(service.upload({ ...pickup, grossGrams: 21000 }));
      await assert.rejects(service.upload({ ...pickup, id: randomUUID() }));
    } finally {
      await service.close();
    }
  },
);
