import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchWithTimeout } from './network';
import { SessionInvalidError } from './staff-queue';
import { deliverDriverEvents, DriverSessionError } from './deliver-driver';
export type DriverTrip = {
  id: string;
  route: string;
  vehicle: string;
  factory: string;
  deadline: string | null;
  pickupPoints: string[];
  openStopId: string | null;
  openStopReason: string | null;
};
export type StopReason = 'tea' | 'toilet' | 'breakdown' | 'emergency';
type Event = {
  id: string;
  tripId: string;
  kind: 'stop' | 'resume';
  reason?: StopReason;
  startId?: string;
  occurredAt: string;
};
export async function setupDriverQueue(db: SQLiteDatabase) {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS driver_events(id TEXT PRIMARY KEY NOT NULL,actor_id TEXT NOT NULL,trip_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('stop','resume')),start_id TEXT,reason TEXT,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','synced','conflict'))); CREATE UNIQUE INDEX IF NOT EXISTS driver_one_resume ON driver_events(start_id) WHERE kind='resume';`,
  );
}
export async function driverPending(db: SQLiteDatabase, actor: string) {
  return (
    (
      await db.getFirstAsync<{ n: number }>(
        "SELECT count(*) n FROM driver_events WHERE actor_id=? AND state='pending'",
        actor,
      )
    )?.n ?? 0
  );
}
export async function activeStop(db: SQLiteDatabase, actor: string, trip: DriverTrip) {
  const local = await db.getFirstAsync<{ id: string; reason: string }>(
    "SELECT s.id,s.reason FROM driver_events s WHERE s.actor_id=? AND s.trip_id=? AND s.kind='stop' AND NOT EXISTS(SELECT 1 FROM driver_events r WHERE r.kind='resume' AND r.start_id=s.id) ORDER BY s.rowid DESC LIMIT 1",
    actor,
    trip.id,
  );
  if (local) return local;
  if (!trip.openStopId) return null;
  const closed = await db.getFirstAsync(
    "SELECT id FROM driver_events WHERE actor_id=? AND kind='resume' AND start_id=?",
    actor,
    trip.openStopId,
  );
  return closed ? null : { id: trip.openStopId, reason: trip.openStopReason ?? 'other' };
}
export async function recordDriverEvent(
  db: SQLiteDatabase,
  actor: string,
  tripId: string,
  kind: 'stop' | 'resume',
  value: string,
) {
  const event: Event =
    kind === 'stop'
      ? {
          id: Crypto.randomUUID(),
          tripId,
          kind,
          reason: value as StopReason,
          occurredAt: new Date().toISOString(),
        }
      : {
          id: Crypto.randomUUID(),
          tripId,
          kind,
          startId: value,
          occurredAt: new Date().toISOString(),
        };
  if (kind === 'stop' && !['tea', 'toilet', 'breakdown', 'emergency'].includes(value))
    throw new Error('Invalid reason');
  const result = await db.runAsync(
    `INSERT INTO driver_events(id,actor_id,trip_id,kind,start_id,reason,payload)
 SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM driver_events s WHERE s.actor_id=? AND s.trip_id=? AND s.kind='stop' AND NOT EXISTS(SELECT 1 FROM driver_events r WHERE r.kind='resume' AND r.start_id=s.id)) OR ?='resume'`,
    event.id,
    actor,
    tripId,
    kind,
    event.startId ?? null,
    event.reason ?? null,
    JSON.stringify(event),
    actor,
    tripId,
    kind,
  );
  if (!result.changes) throw new Error('A stop is already open');
  return event;
}
export async function syncDriver(
  db: SQLiteDatabase,
  actor: string,
  token: string,
  secret: string,
  base: string,
) {
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    "SELECT id,payload FROM driver_events WHERE actor_id=? AND state='pending' ORDER BY rowid",
    actor,
  );
  try {
    await deliverDriverEvents(
      rows,
      (row) =>
        fetchWithTimeout(base + '/driver/events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + token,
            'x-device-secret': secret,
          },
          body: row.payload,
        }),
      async (id) => {
        await db.runAsync(
          "UPDATE driver_events SET state='synced' WHERE id=? AND actor_id=?",
          id,
          actor,
        );
      },
    );
  } catch (error) {
    if (error instanceof DriverSessionError) throw new SessionInvalidError(error.message);
    throw error;
  }
}
