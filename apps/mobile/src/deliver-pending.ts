import type { PendingWeighing } from './queue';

export class PermanentSyncError extends Error {
  constructor(readonly code: 'conflict' | 'rejected') {
    super(code);
  }
}

export async function deliverPending(
  events: PendingWeighing[],
  send: (event: PendingWeighing) => Promise<unknown>,
  acknowledge: (id: string) => Promise<void>,
  recordProblem?: (id: string, code: PermanentSyncError['code']) => Promise<void>,
): Promise<number> {
  let count = 0;
  for (const event of events) {
    let result: unknown;
    try {
      result = await send(event);
    } catch (error) {
      if (!(error instanceof PermanentSyncError) || !recordProblem) throw error;
      await recordProblem(event.id, error.code);
      continue;
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('id' in result) ||
      result.id !== event.id ||
      !('accepted' in result) ||
      result.accepted !== true
    )
      throw new Error('Invalid acknowledgement');
    await acknowledge(event.id);
    count++;
  }
  return count;
}
