import type { SQLiteDatabase } from 'expo-sqlite';
import { pendingWeighings } from './queue';
import { deliverPending, PermanentSyncError } from './deliver-pending';

export async function syncQueue(db: SQLiteDatabase, baseUrl: string): Promise<number> {
  return deliverPending(
    await pendingWeighings(db),
    async (event) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(baseUrl + '/demo/weighings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          signal: controller.signal,
        });
        if (response.status === 409) throw new PermanentSyncError('conflict');
        if (response.status === 400 || response.status === 422)
          throw new PermanentSyncError('rejected');
        if (!response.ok) throw new Error('Sync failed; reading remains pending.');
        return (await response.json()) as unknown;
      } finally {
        clearTimeout(timer);
      }
    },
    async (id) => {
      await db.runAsync('UPDATE weighing_queue SET synced = 1 WHERE id = ?', id);
    },
    async (id, code) => {
      await db.runAsync(
        'INSERT INTO weighing_sync_problem (event_id, code) VALUES (?, ?) ON CONFLICT(event_id) DO UPDATE SET code = excluded.code',
        id,
        code,
      );
    },
  );
}
