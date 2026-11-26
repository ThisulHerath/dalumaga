import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type PendingWeighing = {
  id: string;
  loadId: string;
  stage: 'pickup' | 'receipt';
  grossGrams: number;
  tareGrams: number;
  occurredAt: string;
};

export async function openQueue() {
  const db = await SQLite.openDatabaseAsync('dalumaga-queue.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS weighing_queue (
      id TEXT PRIMARY KEY NOT NULL,
      load_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('pickup', 'receipt')),
      gross_grams INTEGER NOT NULL CHECK(gross_grams >= 0),
      tare_grams INTEGER NOT NULL CHECK(tare_grams >= 0 AND gross_grams >= tare_grams),
      occurred_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0 CHECK(synced IN (0, 1)),
      UNIQUE(load_id, stage)
    );
  `);
  return db;
}

export async function saveWeighing(
  db: SQLite.SQLiteDatabase,
  input: Omit<PendingWeighing, 'id' | 'occurredAt'>,
): Promise<PendingWeighing> {
  if (
    !Number.isSafeInteger(input.grossGrams) ||
    !Number.isSafeInteger(input.tareGrams) ||
    input.tareGrams < 0 ||
    input.grossGrams < input.tareGrams
  ) {
    throw new Error('Enter valid gross and tare weights in grams');
  }
  const event = { ...input, id: Crypto.randomUUID(), occurredAt: new Date().toISOString() };
  await db.runAsync(
    'INSERT INTO weighing_queue (id, load_id, stage, gross_grams, tare_grams, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
    event.id,
    event.loadId,
    event.stage,
    event.grossGrams,
    event.tareGrams,
    event.occurredAt,
  );
  return event;
}

export async function pendingWeighings(db: SQLite.SQLiteDatabase): Promise<PendingWeighing[]> {
  return db.getAllAsync<PendingWeighing>(
    'SELECT id, load_id AS loadId, stage, gross_grams AS grossGrams, tare_grams AS tareGrams, occurred_at AS occurredAt FROM weighing_queue WHERE synced = 0 ORDER BY rowid',
  );
}
