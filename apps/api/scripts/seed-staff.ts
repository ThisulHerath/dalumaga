import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/staff-auth';

type Setup = {
  ids: Record<string, string>;
  accounts: { id: string; username: string; password: string; role: string }[];
};
async function main() {
  if (process.env.DALUMAGA_SEED_CONFIRM !== 'development' || !process.env.DATABASE_URL)
    throw new Error('Set DALUMAGA_SEED_CONFIRM=development and DATABASE_URL');
  const file = resolve(process.env.DALUMAGA_CREDENTIALS_FILE || '.staff-demo-credentials.json');
  let setup: Setup;
  try {
    setup = JSON.parse(await readFile(file, 'utf8')) as Setup;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const names = [
      'factory',
      'route',
      'vehicle',
      'trip',
      'point',
      'batch',
      'crate',
      'load',
      'scale',
      'tare',
    ];
    const ids = Object.fromEntries(names.map((name) => [name, randomUUID()]));
    const prefix = randomBytes(4).toString('hex');
    setup = {
      ids,
      accounts: ['weigher', 'receiver', 'dispatcher'].map((role) => ({
        id: randomUUID(),
        username: role + '-' + prefix,
        password: randomBytes(18).toString('base64url'),
        role,
      })),
    };
    await writeFile(file, JSON.stringify(setup, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  }
  const i = setup.ids,
    accounts = setup.accounts;
  const w = accounts[0];
  if (
    !w ||
    !i.factory ||
    !i.route ||
    !i.vehicle ||
    !i.trip ||
    !i.point ||
    !i.batch ||
    !i.crate ||
    !i.load ||
    !i.scale ||
    !i.tare
  )
    throw new Error('Invalid credentials file');
  const db = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL }).initialize();
  try {
    await db.transaction(async (tx) => {
      for (const a of accounts) {
        await tx.query(
          'INSERT INTO dalumaga.app_user(id,auth_subject,display_name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
          [a.id, 'sample-' + a.id, 'Sample ' + a.role],
        );
        await tx.query(
          'INSERT INTO dalumaga.staff_credential(user_id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
          [a.id, a.username, await hashPassword(a.password)],
        );
        await tx.query(
          'INSERT INTO dalumaga.user_role(user_id,role_code) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [a.id, a.role],
        );
      }
      await tx.query(
        "INSERT INTO dalumaga.factory(id,name) VALUES($1,'Sample factory') ON CONFLICT(id) DO NOTHING",
        [i.factory],
      );
      await tx.query(
        "INSERT INTO dalumaga.route(id,factory_id,name) VALUES($1,$2,'Sample route') ON CONFLICT(id) DO NOTHING",
        [i.route, i.factory],
      );
      await tx.query(
        'INSERT INTO dalumaga.vehicle(id,registration) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
        [i.vehicle, 'SAMPLE-' + i.vehicle],
      );
      await tx.query(
        'INSERT INTO dalumaga.trip(id,route_id,vehicle_id,driver_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
        [i.trip, i.route, i.vehicle, w.id],
      );
      await tx.query(
        "INSERT INTO dalumaga.pickup_point(id,name) VALUES($1,'Sample pickup') ON CONFLICT(id) DO NOTHING",
        [i.point],
      );
      await tx.query(
        'INSERT INTO dalumaga.batch(id,trip_id,point_id) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
        [i.batch, i.trip, i.point],
      );
      await tx.query(
        'INSERT INTO dalumaga.crate(id,qr_code) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
        [i.crate, 'SAMPLE-' + i.crate],
      );
      await tx.query(
        'INSERT INTO dalumaga.device_scale(id,asset_code,resolution_kg) VALUES($1,$2,0.001) ON CONFLICT(id) DO NOTHING',
        [i.scale, 'SAMPLE-' + i.scale],
      );
      await tx.query(
        "INSERT INTO dalumaga.crate_tare(id,crate_id,empty_kg,verified_at,verified_by,scale_id,condition_note) VALUES($1,$2,2,'2020-01-01',$3,$4,'simulator sample') ON CONFLICT(id) DO NOTHING",
        [i.tare, i.crate, w.id, i.scale],
      );
      await tx.query(
        'INSERT INTO dalumaga.crate_load(id,batch_id,crate_id) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
        [i.load, i.batch, i.crate],
      );
      await tx.query('SELECT id FROM dalumaga.trip WHERE id=$1 FOR UPDATE', [i.trip]);
      for (const number of ['C043', 'C044']) {
        const code = 'SAMPLE-' + number + '-' + i.trip;
        const found = (await tx.query('SELECT id FROM dalumaga.crate WHERE qr_code=$1', [
          code,
        ])) as {
          id: string;
        }[];
        if (!found.length) {
          const crate = randomUUID();
          await tx.query('INSERT INTO dalumaga.crate(id,qr_code) VALUES($1,$2)', [crate, code]);
          await tx.query(
            "INSERT INTO dalumaga.crate_tare(id,crate_id,empty_kg,verified_at,verified_by,scale_id,condition_note) VALUES($1,$2,2,'2020-01-01',$3,$4,'simulator sample')",
            [randomUUID(), crate, w.id, i.scale],
          );
          await tx.query('INSERT INTO dalumaga.crate_load(id,batch_id,crate_id) VALUES($1,$2,$3)', [
            randomUUID(),
            i.batch,
            crate,
          ]);
        }
      }
      for (const a of accounts)
        await tx.query(
          'INSERT INTO dalumaga.trip_assignment(trip_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [i.trip, a.id],
        );
    });
    console.log('Sample staff and trip ready. Credentials file:', file);
  } finally {
    await db.destroy();
  }
}
void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'Seed failed');
  process.exitCode = 1;
});
