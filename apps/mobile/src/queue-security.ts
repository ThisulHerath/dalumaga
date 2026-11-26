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

// Evidence only: a clean comparison does not authorize deletion of the recovery copy.
export function compareLegacyEvidence(original: QueueRow[], encrypted: QueueRow[]) {
  const byId = new Map<string, QueueRow>();
  let duplicateIds = 0;
  for (const row of encrypted) {
    if (byId.has(row.id)) duplicateIds++;
    else byId.set(row.id, row);
  }
  const seen = new Set<string>();
  let missing = 0;
  let changed = 0;
  let notSynced = 0;
  for (const old of original) {
    if (seen.has(old.id)) duplicateIds++;
    seen.add(old.id);
    const current = byId.get(old.id);
    if (!current) {
      missing++;
      continue;
    }
    if (
      old.actor_id !== current.actor_id ||
      old.load_id !== current.load_id ||
      old.stage !== current.stage ||
      old.payload !== current.payload
    )
      changed++;
    if (current.state !== 'synced') notSynced++;
  }
  return { total: original.length, missing, changed, notSynced, duplicateIds };
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
