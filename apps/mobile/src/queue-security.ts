export type QueueRow = {
  id: string;
  actor_id: string;
  load_id: string;
  stage: 'pickup' | 'receipt';
  payload: string;
  state: 'pending' | 'synced' | 'conflict';
};

export function validateStoredQueueKey(
  key: string | null,
  encryptedFileExists: boolean,
  databaseWasCreated = false,
): string | null {
  if (databaseWasCreated && !encryptedFileExists)
    throw new Error('Encrypted queue is unavailable. Do not remove the app; contact support.');
  if (key === null && encryptedFileExists)
    throw new Error('Queue key is unavailable. Do not remove the app; contact support.');
  if (key !== null && !/^[0-9a-f]{64}$/.test(key))
    throw new Error('Queue key is invalid. Do not remove the app; contact support.');
  return key;
}

export function assertQueueCopyMatches(original: QueueRow[], copy: QueueRow[]): void {
  const canonical = (rows: QueueRow[]) =>
    rows.map((r) => [r.id, r.actor_id, r.load_id, r.stage, r.payload, r.state]);
  if (JSON.stringify(canonical(original)) !== JSON.stringify(canonical(copy)))
    throw new Error('Queue migration verification failed. The original has been retained.');
}

export type MigrationStore = {
  transaction: (work: () => Promise<void>) => Promise<void>;
  wasImported: () => Promise<boolean>;
  insert: (row: QueueRow) => Promise<void>;
  list: () => Promise<QueueRow[]>;
  markImported: () => Promise<void>;
};

export async function importLegacyRows(rows: QueueRow[], store: MigrationStore): Promise<void> {
  await store.transaction(async () => {
    if (await store.wasImported()) return;
    for (const row of rows) await store.insert(row);
    assertQueueCopyMatches(rows, await store.list());
    await store.markImported();
  });
}
