import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/staff-auth';
type Base = { ids: Record<string, string>; accounts: { id: string; role: string }[] };
type Driver = {
  driverId: string;
  tripId: string;
  batchId: string;
  username: string;
  password: string;
};
async function main() {
  if (
    process.env.DALUMAGA_SEED_CONFIRM !== 'development' ||
    !process.env.DATABASE_URL ||
    process.env.NODE_ENV === 'production'
  )
    throw new Error('Development confirmation required');
  const base = JSON.parse(await readFile(resolve('.staff-demo-credentials.json'), 'utf8')) as Base;
  const file = resolve('.staff-driver-credentials.json');
  let driver: Driver;
  try {
    driver = JSON.parse(await readFile(file, 'utf8')) as Driver;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    driver = {
      driverId: randomUUID(),
      tripId: randomUUID(),
      batchId: randomUUID(),
      username: 'driver-' + randomBytes(4).toString('hex'),
      password: randomBytes(18).toString('base64url'),
    };
    await writeFile(file, JSON.stringify(driver, null, 2), { flag: 'wx', mode: 0o600 });
  }
  const dispatcher = base.accounts.find((a) => a.role === 'dispatcher');
  if (!dispatcher || !base.ids.route || !base.ids.vehicle || !base.ids.point)
    throw new Error('Seed the sample staff first');
  const db = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL }).initialize();
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO dalumaga.app_user(id,auth_subject,display_name) VALUES($1,$2,'Sample driver') ON CONFLICT(id) DO NOTHING",
        [driver.driverId, 'sample-' + driver.driverId],
      );
      await tx.query(
        "INSERT INTO dalumaga.user_role(user_id,role_code) VALUES($1,'driver') ON CONFLICT DO NOTHING",
        [driver.driverId],
      );
      await tx.query(
        'INSERT INTO dalumaga.staff_credential(user_id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
        [driver.driverId, driver.username, await hashPassword(driver.password)],
      );
      await tx.query(
        'INSERT INTO dalumaga.trip(id,route_id,vehicle_id,driver_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
        [driver.tripId, base.ids.route, base.ids.vehicle, driver.driverId],
      );
      await tx.query(
        "INSERT INTO dalumaga.batch(id,trip_id,point_id,deadline_at,timing_rule) VALUES($1,$2,$3,now()+interval '2 hours','simulator example') ON CONFLICT(id) DO NOTHING",
        [driver.batchId, driver.tripId, base.ids.point],
      );
      await tx.query('SELECT id FROM dalumaga.route WHERE id=$1 FOR UPDATE', [base.ids.route]);
      await tx.query(
        'INSERT INTO dalumaga.route_stop(route_id,sequence_no,point_id) SELECT $1,COALESCE((SELECT max(sequence_no) FROM dalumaga.route_stop WHERE route_id=$1),0)+1,$2 WHERE NOT EXISTS(SELECT 1 FROM dalumaga.route_stop WHERE route_id=$1 AND point_id=$2)',
        [base.ids.route, base.ids.point],
      );
      for (const id of [driver.driverId, dispatcher.id])
        await tx.query(
          'INSERT INTO dalumaga.trip_assignment(trip_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [driver.tripId, id],
        );
    });
    console.log(
      'Sample driver and trip ready. Credentials are in the ignored local driver credentials file.',
    );
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Driver seed failed');
  process.exitCode = 1;
});
