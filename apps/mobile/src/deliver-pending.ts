import type { PendingWeighing } from './queue';

export async function deliverPending(
  events: PendingWeighing[],
  send: (event: PendingWeighing) => Promise<unknown>,
  acknowledge: (id: string) => Promise<void>,
): Promise<number> {
  let count = 0;
  for (const event of events) {
    const result = await send(event);
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
