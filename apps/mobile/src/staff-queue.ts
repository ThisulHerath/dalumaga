import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { fetchWithTimeout } from './network';
export type StaffReading = {
  id: string;
  loadId: string;
  stage: 'pickup' | 'receipt';
  grossGrams: number;
  tareId: string;
  scaleId: string;
  occurredAt: string;
};
export class SessionInvalidError extends Error {}
export async function openStaffQueue() {
  const db = await SQLite.openDatabaseAsync('dalumaga-staff-queue.db');
  await db.execAsync(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, load_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('pickup','receipt')), payload TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','synced','conflict')),
      UNIQUE(actor_id,load_id,stage)
    );`);
  return db;
}
export async function storeStaffReading(
  db: SQLite.SQLiteDatabase,
  actorId: string,
  input: Omit<StaffReading, 'id' | 'occurredAt'>,
) {
  if (!Number.isSafeInteger(input.grossGrams) || input.grossGrams < 0)
    throw new Error('Invalid weight');
  const event = { ...input, id: Crypto.randomUUID(), occurredAt: new Date().toISOString() };
  await db.runAsync(
    'INSERT INTO events(id,actor_id,load_id,stage,payload) VALUES(?,?,?,?,?)',
    event.id,
    actorId,
    event.loadId,
    event.stage,
    JSON.stringify(event),
  );
  return event;
}
export async function listStaffPending(db: SQLite.SQLiteDatabase, actorId: string) {
  return db.getAllAsync<{ id: string; payload: string }>(
    "SELECT id,payload FROM events WHERE actor_id=? AND state='pending' ORDER BY rowid",
    actorId,
  );
}
export async function staffIssues(db: SQLite.SQLiteDatabase, actorId: string) {
  return db.getFirstAsync<{ count: number }>(
    "SELECT count(*) AS count FROM events WHERE actor_id=? AND state='conflict'",
    actorId,
  );
}
export async function recordedLoads(db: SQLite.SQLiteDatabase, actorId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ load_id: string }>(
    'SELECT load_id FROM events WHERE actor_id=?',
    actorId,
  );
  return rows.map((row) => row.load_id);
}
export async function syncStaff(
  db: SQLite.SQLiteDatabase,
  actorId: string,
  token: string,
  deviceSecret: string,
  base: string,
) {
  for (const row of await listStaffPending(db, actorId)) {
    const response = await fetchWithTimeout(base + '/staff/weighings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
        'x-device-secret': deviceSecret,
      },
      body: row.payload,
    });
    if (response.status === 409) {
      await db.runAsync(
        "UPDATE events SET state='conflict' WHERE id=? AND actor_id=?",
        row.id,
        actorId,
      );
      continue;
    }
    if (response.status === 401)
      throw new SessionInvalidError('Session expired or device revoked. Sign in online.');
    if (!response.ok) throw new Error('Sync failed. Your reading is saved.');
    const data = response.data;
    if (
      !data ||
      typeof data !== 'object' ||
      !('id' in data) ||
      data.id !== row.id ||
      !('accepted' in data) ||
      data.accepted !== true
    )
      throw new Error('Invalid acknowledgement');
    await db.runAsync(
      "UPDATE events SET state='synced' WHERE id=? AND actor_id=?",
      row.id,
      actorId,
    );
  }
}
