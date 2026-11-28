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
    const ids = Array.from({ length: 13 }, () => randomUUID());
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
      admin,
      driver,
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
      string,
      string,
    ];
    const scale = randomUUID(),
      tare = randomUUID();
    const suffix = randomUUID();
    const pass = 'test-password-12345';
    const hash = await hashPassword(pass);
    await db.query(
      "INSERT INTO dalumaga.app_user(id,auth_subject,display_name) VALUES($1,$6,'Weigher'),($2,$7,'Receiver'),($3,$8,'Dispatcher'),($4,$9,'Admin'),($5,$10,'Driver')",
      [
        weigher,
        receiver,
        dispatcher,
        admin,
        driver,
        'w' + suffix,
        'r' + suffix,
        'd' + suffix,
        'a' + suffix,
        'v' + suffix,
      ],
    );
    for (const [id, role, name] of [
      [weigher, 'weigher', 'w'],
      [receiver, 'receiver', 'r'],
      [dispatcher, 'dispatcher', 'd'],
      [admin, 'admin', 'a'],
      [driver, 'driver', 'v'],
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
      [trip, route, vehicle, driver],
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
    for (const id of [weigher, receiver, dispatcher, driver])
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
        d = await login('d'),
        a = await login('a'),
        v = await login('v');
      const deviceId = randomUUID();
      const receiverDeviceId = randomUUID();
      const weigherSecret = 'a'.repeat(64);
      const receiverSecret = 'b'.repeat(64);
      const driverSecret = 'd'.repeat(64);
      const enroll = async (token: string, device: string, secret: string) =>
        fetch(url + '/v1/auth/devices/enroll', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ id: device, label: 'Test phone', secret }),
        });
      assert.equal((await enroll(w, deviceId, weigherSecret)).status, 201);
      assert.equal((await enroll(r, receiverDeviceId, receiverSecret)).status, 201);
      assert.equal((await enroll(v, randomUUID(), driverSecret)).status, 201);
      const driverHeaders = {
        authorization: 'Bearer ' + v,
        'x-device-secret': driverSecret,
        'content-type': 'application/json',
      };
      assert.equal((await fetch(url + '/v1/driver/trips', { headers: driverHeaders })).status, 200);
      assert.equal(
        (await fetch(url + '/v1/driver/trips', { headers: { authorization: 'Bearer ' + v } }))
          .status,
        401,
      );
      const office = () =>
        fetch(url + '/v1/driver/office', { headers: { authorization: 'Bearer ' + d } });
      let overview = (await (await office()).json()) as {
        lastFixAt: string | null;
        stopReason: string | null;
      }[];
      assert.equal(overview[0]?.lastFixAt, null);
      assert.equal(overview[0]?.stopReason, null);
      const stop = {
        id: randomUUID(),
        tripId: trip,
        kind: 'stop',
        reason: 'tea',
        occurredAt: new Date().toISOString(),
      };
      const driverPost = (body: unknown, headers = driverHeaders) =>
        fetch(url + '/v1/driver/events', { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(
        (
          await driverPost(stop, {
            authorization: 'Bearer ' + w,
            'x-device-secret': weigherSecret,
            'content-type': 'application/json',
          })
        ).status,
        403,
      );
      assert.equal((await driverPost(stop)).status, 201);
      assert.equal((await driverPost(stop)).status, 201);
      assert.equal((await driverPost({ ...stop, reason: 'toilet' })).status, 409);
      assert.equal((await driverPost({ ...stop, id: randomUUID() })).status, 409);
      overview = (await (await office()).json()) as typeof overview;
      assert.equal(overview[0]?.stopReason, 'tea');
      assert.equal(overview[0]?.lastFixAt, null);
      const resume = {
        id: randomUUID(),
        tripId: trip,
        kind: 'resume',
        startId: stop.id,
        occurredAt: new Date().toISOString(),
      };
      assert.equal((await driverPost(resume)).status, 201);
      assert.equal((await driverPost(resume)).status, 201);
      assert.equal((await driverPost({ ...resume, id: randomUUID() })).status, 409);
      const sim = await fetch(url + '/v1/driver/simulate-position', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + d, 'content-type': 'application/json' },
        body: JSON.stringify({ tripId: trip, sample: 0 }),
      });
      assert.equal(sim.status, 201);
      overview = (await (await office()).json()) as typeof overview;
      assert.ok(overview[0]?.lastFixAt);
      assert.equal(overview[0]?.stopReason, null);
      const beforeGap = overview[0]?.lastFixAt;
      const gap = await fetch(url + '/v1/driver/simulate-position', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + d, 'content-type': 'application/json' },
        body: JSON.stringify({ tripId: trip, sample: 1 }),
      });
      assert.equal(gap.status, 201);
      assert.equal(((await gap.json()) as { signalGap: boolean }).signalGap, true);
      overview = (await (await office()).json()) as typeof overview;
      assert.equal(overview[0]?.lastFixAt, beforeGap);
      assert.equal(overview[0]?.stopReason, null);
      const history = (await (await office()).json()) as {
        stopHistory: { reason: string; endedAt: string | null }[];
      }[];
      assert.equal(history[0]?.stopHistory.length, 1);
      assert.equal(history[0]?.stopHistory[0]?.reason, 'tea');
      assert.ok(history[0]?.stopHistory[0]?.endedAt);
      assert.equal(
        Number(
          (await db.query('SELECT count(*) n FROM dalumaga.stop_event WHERE trip_id=$1', [trip]))[0]
            .n,
        ),
        2,
      );
      assert.equal(
        (await fetch(url + '/v1/staff/loads', { headers: { authorization: 'Bearer ' + w } }))
          .status,
        401,
      );
      assert.equal(
        (
          await fetch(url + '/v1/staff/loads', {
            headers: { authorization: 'Bearer ' + w, 'x-device-secret': receiverSecret },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(url + '/v1/staff/loads', {
            headers: { authorization: 'Bearer ' + w, 'x-device-secret': weigherSecret },
          })
        ).status,
        200,
      );
      const id = randomUUID(),
        now = new Date().toISOString();
      const post = async (token: string, stage: string, grossGrams: number, eventId: string) =>
        fetch(url + '/v1/staff/weighings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + token,
            'x-device-secret': token === w ? weigherSecret : receiverSecret,
          },
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
      assert.equal((await post(w, 'pickup', 21000, id)).status, 409);
      const unauthenticated = await fetch(url + '/v1/staff/loads');
      assert.equal(unauthenticated.status, 401);
      const denied = await fetch(url + '/v1/staff/comparisons', {
        headers: { authorization: 'Bearer ' + w, 'x-device-secret': weigherSecret },
      });
      assert.equal(denied.status, 403);
      const result = await fetch(url + '/v1/staff/comparisons', {
        headers: { authorization: 'Bearer ' + d },
      });
      const rows = (await result.json()) as { differenceKg: string }[];
      assert.equal(Number(rows[0]?.differenceKg), -3);
      const search = (token: string, username: string) =>
        fetch(url + '/v1/auth/recovery/devices/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ username }),
        });
      assert.equal((await search(d, 'r' + suffix)).status, 403);
      const found = await search(a, 'r' + suffix);
      assert.equal(found.status, 201);
      assert.deepEqual(
        ((await found.json()) as { id: string }[]).map((device) => device.id),
        [receiverDeviceId],
      );
      const adminDevice = randomUUID(),
        adminDeviceSession = await login('a');
      assert.equal((await enroll(adminDeviceSession, adminDevice, 'c'.repeat(64))).status, 201);
      assert.deepEqual(await (await search(a, 'a' + suffix)).json(), []);
      const adminRevoke = (token: string, target: string, reason: string) =>
        fetch(url + '/v1/auth/recovery/devices/' + target + '/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ reason }),
        });
      assert.equal((await adminRevoke(d, receiverDeviceId, 'lost')).status, 403);
      assert.equal((await adminRevoke(a, receiverDeviceId, 'invalid')).status, 400);
      assert.equal((await adminRevoke(a, adminDevice, 'lost')).status, 403);
      await db.query("INSERT INTO dalumaga.user_role(user_id,role_code) VALUES($1,'manager')", [
        receiver,
      ]);
      assert.deepEqual(await (await search(a, 'r' + suffix)).json(), []);
      assert.equal((await adminRevoke(a, receiverDeviceId, 'lost')).status, 403);
      await db.query("DELETE FROM dalumaga.user_role WHERE user_id=$1 AND role_code='manager'", [
        receiver,
      ]);
      assert.equal((await adminRevoke(a, receiverDeviceId, 'lost')).status, 201);
      assert.equal((await post(r, 'receipt', 17000, randomUUID())).status, 401);
      assert.equal((await adminRevoke(a, receiverDeviceId, 'lost')).status, 403);
      const audits = await db.query(
        "SELECT actor_id,detail FROM dalumaga.audit_log WHERE entity_id=$1 AND action='recovery_revoke'",
        [receiverDeviceId],
      );
      assert.equal(audits.length, 1);
      assert.equal(audits[0].actor_id, admin);
      assert.equal(audits[0].detail.reason, 'lost');
      assert.equal(audits[0].detail.userId, receiver);
      process.env.DALUMAGA_STAFF_SIMULATOR = 'false';
      assert.equal((await search(a, 'w' + suffix)).status, 403);
      assert.equal((await adminRevoke(a, deviceId, 'lost')).status, 403);
      process.env.DALUMAGA_STAFF_SIMULATOR = 'true';
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        assert.equal((await search(a, 'w' + suffix)).status, 403);
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
      const recovery = await login('w');
      assert.equal(
        (
          await fetch(url + '/v1/auth/devices/' + deviceId + '/revoke', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + d },
          })
        ).status,
        403,
      );
      const revoke = await fetch(url + '/v1/auth/devices/' + deviceId + '/revoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + recovery },
      });
      assert.equal(revoke.status, 201);
      assert.equal((await post(w, 'pickup', 20000, id)).status, 401);
      assert.equal((await enroll(recovery, deviceId, weigherSecret)).status, 403);
      const logout = await fetch(url + '/v1/auth/logout', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + d },
      });
      assert.equal(logout.status, 201);
      const revoked = await fetch(url + '/v1/staff/comparisons', {
        headers: { authorization: 'Bearer ' + d },
      });
      assert.equal(revoked.status, 401);
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
