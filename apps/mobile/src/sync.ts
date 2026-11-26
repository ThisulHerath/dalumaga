import type { SQLiteDatabase } from 'expo-sqlite';
import { pendingWeighings } from './queue';
import { deliverPending } from './deliver-pending';

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
        if (!response.ok)
          throw new Error(
            response.status === 409
              ? 'Reading conflict; original retained.'
              : 'Sync failed; reading remains pending.',
          );
        return (await response.json()) as unknown;
      } finally {
        clearTimeout(timer);
      }
    },
    async (id) => {
      await db.runAsync('UPDATE weighing_queue SET synced = 1 WHERE id = ?', id);
    },
  );
}
