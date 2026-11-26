import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  assertQueueCopyMatches,
  importLegacyRows,
  validateStoredQueueKey,
} from '../src/queue-security';
import type { MigrationStore, QueueRow } from '../src/queue-security';

const key = 'a'.repeat(64);
const row = {
  id: 'event',
  actor_id: 'actor',
  load_id: 'load',
  stage: 'pickup' as const,
  payload: '{"weight":18}',
  state: 'pending' as const,
};
test('never creates a replacement key for an existing encrypted queue', () => {
  assert.throws(() => validateStoredQueueKey(null, true), /unavailable/);
  assert.throws(() => validateStoredQueueKey('bad', true), /invalid/);
  assert.equal(validateStoredQueueKey(null, false), null);
  assert.equal(validateStoredQueueKey(key, true), key);
  assert.throws(() => validateStoredQueueKey(key, false, true), /unavailable/);
});
test('migration verification catches missing, changed or duplicated events', () => {
  assert.doesNotThrow(() => assertQueueCopyMatches([row], [{ ...row }]));
  assert.throws(() => assertQueueCopyMatches([row], []), /retained/);
  assert.throws(() => assertQueueCopyMatches([row], [{ ...row, state: 'synced' }]), /retained/);
  assert.throws(() => assertQueueCopyMatches([row], [row, row]), /retained/);
});

test('an interrupted import rolls back and retry keeps every original event once', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE events(id TEXT PRIMARY KEY,actor_id TEXT,load_id TEXT,stage TEXT,payload TEXT,state TEXT); CREATE TABLE metadata(name TEXT PRIMARY KEY)',
  );
  let fail = true;
  const source: QueueRow[] = [row, { ...row, id: 'second', load_id: 'other', state: 'conflict' }];
  const store: MigrationStore = {
    transaction: async (work) => {
      db.exec('BEGIN');
      try {
        await work();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    wasImported: async () =>
      Boolean(db.prepare("SELECT name FROM metadata WHERE name='imported'").get()),
    insert: async (entry) => {
      db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(
        entry.id,
        entry.actor_id,
        entry.load_id,
        entry.stage,
        entry.payload,
        entry.state,
      );
      if (fail) throw new Error('interrupted');
    },
    list: async () =>
      db
        .prepare('SELECT * FROM events ORDER BY id')
        .all()
        .map((item) => ({ ...item }) as QueueRow),
    markImported: async () => {
      db.prepare("INSERT INTO metadata VALUES('imported')").run();
    },
  };
  await assert.rejects(importLegacyRows(source, store), /interrupted/);
  assert.equal((await store.list()).length, 0);
  assert.equal(await store.wasImported(), false);
  fail = false;
  await importLegacyRows(source, store);
  await importLegacyRows(source, store);
  assert.deepEqual(await store.list(), source);
  assert.equal(await store.wasImported(), true);
  db.close();
});
