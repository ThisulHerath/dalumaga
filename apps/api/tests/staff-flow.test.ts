import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { createApp } from '../src/app';
import { hashPassword } from '../src/staff-auth';

test(
  'staff login, role and assignment checks, receipt-first and idempotence',
  { skip: !process.env.DALUMAGA_AUTH_TEST_URL },
  async () => {
    process.env.DATABASE_URL = process.env.DALUMAGA_AUTH_TEST_URL!;
    process.env.DALUMAGA_STAFF_SIMULATOR = 'true';
    const db = await new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
    }).initialize();
    const ids = Array.from({ length: 11 }, () => randomUUID());
    const [
      weigher,
      receiver,
      dispatcher,
      factory,
      route,
      vehicle,
      trip,
      point,
      batch,
      crate,
      load,
    ] = ids as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const scale = randomUUID(),
      tare = randomUUID();
    const suffix = randomUUID();
    const pass = 'test-password-12345';
    const hash = await hashPassword(pass);
    await db.query(
      "INSERT INTO dalumaga.app_user(id,auth_subject,display_name) VALUES($1,$4,'Weigher'),($2,$5,'Receiver'),($3,$6,'Dispatcher')",
      [weigher, receiver, dispatcher, 'w' + suffix, 'r' + suffix, 'd' + suffix],
    );
    for (const [id, role, name] of [
      [weigher, 'weigher', 'w'],
      [receiver, 'receiver', 'r'],
      [dispatcher, 'dispatcher', 'd'],
    ] as const) {
      await db.query('INSERT INTO dalumaga.user_role(user_id,role_code) VALUES($1,$2)', [id, role]);
      await db.query(
        'INSERT INTO dalumaga.staff_credential(user_id,username,password_hash) VALUES($1,$2,$3)',
        [id, name + suffix, hash],
      );
    }
    await db.query("INSERT INTO dalumaga.factory(id,name) VALUES($1,'Test')", [factory]);
    await db.query("INSERT INTO dalumaga.route(id,factory_id,name) VALUES($1,$2,'Test')", [
      route,
      factory,
    ]);
    await db.query('INSERT INTO dalumaga.vehicle(id,registration) VALUES($1,$2)', [
      vehicle,
      suffix,
    ]);
    await db.query(
      'INSERT INTO dalumaga.trip(id,route_id,vehicle_id,driver_id) VALUES($1,$2,$3,$4)',
      [trip, route, vehicle, weigher],
    );
    await db.query("INSERT INTO dalumaga.pickup_point(id,name) VALUES($1,'Test')", [point]);
    await db.query('INSERT INTO dalumaga.batch(id,trip_id,point_id) VALUES($1,$2,$3)', [
      batch,
      trip,
      point,
    ]);
    await db.query('INSERT INTO dalumaga.crate(id,qr_code) VALUES($1,$2)', [crate, suffix]);
    await db.query(
      'INSERT INTO dalumaga.device_scale(id,asset_code,resolution_kg) VALUES($1,$2,0.001)',
      [scale, suffix],
    );
    await db.query(
      "INSERT INTO dalumaga.crate_tare(id,crate_id,empty_kg,verified_at,verified_by,scale_id,condition_note) VALUES($1,$2,2,'2020-01-01',$3,$4,'test')",
      [tare, crate, weigher, scale],
    );
    await db.query('INSERT INTO dalumaga.crate_load(id,batch_id,crate_id) VALUES($1,$2,$3)', [
      load,
      batch,
      crate,
    ]);
    for (const id of [weigher, receiver, dispatcher])
      await db.query('INSERT INTO dalumaga.trip_assignment VALUES($1,$2)', [trip, id]);
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const url = await app.getUrl();
      const login = async (name: string) => {
        const r = await fetch(url + '/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: name + suffix, password: pass }),
        });
        assert.equal(r.status, 201);
        return ((await r.json()) as { token: string }).token;
      };
      const w = await login('w'),
        r = await login('r'),
        d = await login('d');
      const id = randomUUID(),
        now = new Date().toISOString();
      const post = async (token: string, stage: string, grossGrams: number, eventId: string) =>
        fetch(url + '/v1/staff/weighings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({
            id: eventId,
            loadId: load,
            stage,
            grossGrams,
            tareId: tare,
            scaleId: scale,
            occurredAt: now,
          }),
        });
      assert.equal((await post(w, 'receipt', 17000, randomUUID())).status, 403);
      assert.equal((await post(r, 'receipt', 17000, randomUUID())).status, 201);
      assert.equal((await post(w, 'pickup', 20000, id)).status, 201);
      assert.equal((await post(w, 'pickup', 20000, id)).status, 201);
      const denied = await fetch(url + '/v1/staff/comparisons', {
        headers: { authorization: 'Bearer ' + w },
      });
      assert.equal(denied.status, 403);
      const result = await fetch(url + '/v1/staff/comparisons', {
        headers: { authorization: 'Bearer ' + d },
      });
      const rows = (await result.json()) as { differenceKg: string }[];
      assert.equal(Number(rows[0]?.differenceKg), -3);
      assert.equal(
        Number(
          (
            await db.query('SELECT count(*) AS n FROM dalumaga.weigh_event WHERE load_id=$1', [
              load,
            ])
          )[0].n,
        ),
        2,
      );
    } finally {
      await app.close();
      await db.destroy();
    }
  },
);
