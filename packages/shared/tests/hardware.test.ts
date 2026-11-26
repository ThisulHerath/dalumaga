import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BluetoothScale,
  ManualEntryScale,
  SimulatedScale,
  SimulatedTracker,
} from '../src/index.js';

const t = (minute: string) => `2026-01-01T10:${minute}:00Z`;
test('simulated scale noise, disconnect, reconnect and unsubscribe', async () => {
  const scale = new SimulatedScale([
    { grams: 18000, noiseGrams: 25, capturedAt: t('00') },
    { grams: 0, capturedAt: t('01'), disconnect: true },
    { grams: 17000, capturedAt: t('02') },
  ]);
  const readings: number[] = [];
  const unsubscribe = scale.onStableWeight((r) => readings.push(r.grams));
  assert.throws(() => scale.next(), /disconnected/);
  await scale.connect();
  scale.next();
  scale.next();
  assert.throws(() => scale.next(), /disconnected/);
  await scale.connect();
  unsubscribe();
  scale.next();
  assert.deepEqual(readings, [18025]);
  assert.throws(() => scale.next(), /remain/);
});
test('manual entry preserves reason and validates data', async () => {
  const scale = new ManualEntryScale();
  const readings: string[] = [];
  scale.onStableWeight((r) => readings.push(`${r.source}:${r.grams}:${r.reason}`));
  await scale.connect();
  assert.throws(() => scale.submit(1000, '  '), /reason/);
  assert.throws(() => scale.submit(-1, 'broken'), /Weight/);
  scale.submit(18000, ' scale unavailable ', t('00'));
  assert.deepEqual(readings, ['manual:18000:scale unavailable']);
  await scale.disconnect();
  assert.throws(() => scale.submit(18000, 'reason'), /disconnected/);
});
test('Bluetooth placeholder fails explicitly', async () => {
  const scale = new BluetoothScale();
  await assert.rejects(scale.connect(), /not implemented/);
  assert.throws(() => scale.onStableWeight(() => {}), /not implemented/);
  await scale.disconnect();
});
test('route replay reports a stop and fuel drop, excluding signal gaps', async () => {
  const tracker = new SimulatedTracker(
    [
      { recordedAt: t('00'), latitude: 7, longitude: 80, stopped: false, fuelLitres: 40 },
      { recordedAt: t('01'), latitude: 7.1, longitude: 80, stopped: true, fuelLitres: 40 },
      { recordedAt: t('02'), latitude: 7.1, longitude: 80, stopped: true, fuelLitres: 35 },
      { recordedAt: t('03'), latitude: 7.2, longitude: 80, stopped: false, fuelLitres: 34.9 },
    ],
    [{ from: t('02'), to: t('03') }],
  );
  const range = { from: t('00'), to: t('04') };
  const positions = await tracker.getPositions(range);
  const fuel = await tracker.getFuelReadings(range);
  assert.deepEqual(
    positions.map((p) => p.stopped),
    [false, true, false],
  );
  assert.deepEqual(
    fuel.map((p) => p.litres),
    [40, 40, 34.9],
  );
  assert.equal(fuel[2]!.recordedAt, t('03'));
  await assert.rejects(tracker.getPositions({ from: t('03'), to: t('01') }), /duration/);
});
