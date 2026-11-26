import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { fetchWithTimeout } from './network';
import { importLegacyRows, validateStoredQueueKey } from './queue-security';
import type { QueueRow } from './queue-security';
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
const LEGACY_DB = 'dalumaga-staff-queue.db';
const ENCRYPTED_DB = 'dalumaga-staff-queue-encrypted.db';
const KEY_NAME = 'dalumaga.staff-queue-key.v1';
const CREATED_NAME = 'dalumaga.staff-queue-created.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const pathFor = (name: string) => {
  const directory = SQLite.defaultDatabaseDirectory as string;
  const path = `${directory}/${name}`;
  return path.startsWith('file://') ? path : `file://${path}`;
};
const exists = (name: string) => new File(pathFor(name)).exists;
const readRows = (db: SQLite.SQLiteDatabase) =>
  db.getAllAsync<QueueRow>(
    'SELECT id,actor_id,load_id,stage,payload,state FROM events ORDER BY id',
  );
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
export function openStaffQueue(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = openEncryptedStaffQueue().catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}
async function openEncryptedStaffQueue() {
  const hasEncrypted = await exists(ENCRYPTED_DB);
  let key = validateStoredQueueKey(
    await SecureStore.getItemAsync(KEY_NAME, secureOptions),
    hasEncrypted,
    (await SecureStore.getItemAsync(CREATED_NAME, secureOptions)) === 'yes',
  );
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, secureOptions);
  }
  const db = await SQLite.openDatabaseAsync(ENCRYPTED_DB, { useNewConnection: true });
  try {
    await SecureStore.setItemAsync(CREATED_NAME, 'yes', secureOptions);
    const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version)
      throw new Error(
        'Encrypted storage requires the SQLCipher Android development build; Expo Go is not supported.',
      );
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
    await db.execAsync(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, load_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('pickup','receipt')), payload TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','synced','conflict')),
      UNIQUE(actor_id,load_id,stage)
    );
    CREATE TABLE IF NOT EXISTS queue_metadata (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
    if (await exists(LEGACY_DB)) {
      const legacy = await SQLite.openDatabaseAsync(LEGACY_DB, { useNewConnection: true });
      let rows: QueueRow[];
      try {
        rows = await readRows(legacy);
      } finally {
        await legacy.closeAsync();
      }
      // This database is not exposed to the app until migration completes. Keep the
      // transaction on the keyed connection: a new SQLite connection has no SQLCipher key.
      await importLegacyRows(rows, {
        transaction: (work) => db.withTransactionAsync(work),
        wasImported: async () =>
          Boolean(
            await db.getFirstAsync(
              "SELECT value FROM queue_metadata WHERE name='legacy_import_v1'",
            ),
          ),
        insert: async (row) => {
          await db.runAsync(
            'INSERT INTO events(id,actor_id,load_id,stage,payload,state) VALUES(?,?,?,?,?,?)',
            row.id,
            row.actor_id,
            row.load_id,
            row.stage,
            row.payload,
            row.state,
          );
        },
        list: () => readRows(db),
        markImported: async () => {
          await db.runAsync(
            "INSERT INTO queue_metadata(name,value) VALUES('legacy_import_v1','complete')",
          );
        },
      });
      // Keep the plaintext source until the encrypted migration has been tested on native devices.
      // Do not delete or modify it automatically: it is the recovery copy for existing readings.
    }
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
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
