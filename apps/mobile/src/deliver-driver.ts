export type DriverQueued = { id: string; payload: string };
export class DriverSessionError extends Error {}
export async function deliverDriverEvents(
  rows: DriverQueued[],
  send: (row: DriverQueued) => Promise<{ ok: boolean; status: number; data: unknown }>,
  ack: (id: string) => Promise<void>,
) {
  for (const row of rows) {
    const response = await send(row);
    if (response.status === 401)
      throw new DriverSessionError('Session expired or device revoked. Sign in online.');
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? 'Stop needs office review. Saved on phone.'
          : 'Sync failed. Stop remains on phone.',
      );
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
    await ack(row.id);
  }
}
