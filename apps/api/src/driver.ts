import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Inject,
  Post,
} from '@nestjs/common';
import { SimulatedTracker } from '@dalumaga/shared';
import { z } from 'zod';
import { StaffAuth } from './staff-auth';

const Event = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().uuid(),
      tripId: z.string().uuid(),
      kind: z.literal('stop'),
      reason: z.enum(['tea', 'toilet', 'breakdown', 'emergency']),
      occurredAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      tripId: z.string().uuid(),
      kind: z.literal('resume'),
      startId: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);
const Position = z
  .object({ tripId: z.string().uuid(), sample: z.number().int().min(0).max(2) })
  .strict();
@Controller('driver')
export class DriverController {
  constructor(@Inject(StaffAuth) private readonly auth: StaffAuth) {}
  private simulator() {
    if (process.env.DALUMAGA_STAFF_SIMULATOR !== 'true' || process.env.NODE_ENV === 'production')
      throw new ForbiddenException('Driver simulator is disabled');
  }
  @Get('trips') async trips(
    @Headers('authorization') header?: string,
    @Headers('x-device-secret') secret?: string,
  ) {
    this.simulator();
    const user = await this.auth.authorize(header, ['driver'], secret, true);
    const db = await this.auth.connectionForStaff();
    return db.query(
      `SELECT t.id, r.name AS route, v.registration AS vehicle, f.name AS factory,
      (SELECT min(b.deadline_at) FROM dalumaga.batch b WHERE b.trip_id=t.id AND b.completed_at IS NULL) AS deadline,
      st.id AS "openStopId",st.reason AS "openStopReason",
      COALESCE((SELECT json_agg(p.name ORDER BY rs.sequence_no) FROM dalumaga.route_stop rs JOIN dalumaga.pickup_point p ON p.id=rs.point_id WHERE rs.route_id=r.id),'[]'::json) AS "pickupPoints"
      FROM dalumaga.trip t JOIN dalumaga.route r ON r.id=t.route_id JOIN dalumaga.factory f ON f.id=r.factory_id JOIN dalumaga.vehicle v ON v.id=t.vehicle_id
      JOIN dalumaga.trip_assignment a ON a.trip_id=t.id AND a.user_id=$1
      LEFT JOIN LATERAL (SELECT s.id,s.reason FROM dalumaga.stop_event s WHERE s.trip_id=t.id AND s.kind='stop' AND NOT EXISTS(SELECT 1 FROM dalumaga.stop_event e WHERE e.starts_at_event=s.id) ORDER BY s.id LIMIT 1) st ON true
      WHERE t.driver_id=$1 AND t.ended_at IS NULL ORDER BY t.id`,
      [user.id],
    );
  }
  @Post('events') async event(
    @Headers('authorization') header: string | undefined,
    @Headers('x-device-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.simulator();
    const parsed = Event.safeParse(body);
    if (!parsed.success) throw new HttpException('Invalid driver event', 400);
    const e = parsed.data;
    const user = await this.auth.authorize(header, ['driver'], secret, true);
    const db = await this.auth.connectionForStaff();
    try {
      await db.transaction(async (tx) => {
        await this.auth.lockDeviceSession(tx, header, secret, user.id, 'driver');
        const trips = await tx.query(
          `SELECT t.id FROM dalumaga.trip t JOIN dalumaga.trip_assignment a ON a.trip_id=t.id AND a.user_id=$1 WHERE t.id=$2 AND t.driver_id=$1 AND t.ended_at IS NULL FOR UPDATE OF t`,
          [user.id, e.tripId],
        );
        if (!trips.length) throw new ForbiddenException('Trip is not assigned');
        const existing = await tx.query(
          'SELECT actor_id,kind,payload,occurred_at=$2::timestamptz AS same_time FROM dalumaga.client_event WHERE client_event_id=$1',
          [e.id, e.occurredAt],
        );
        const payload =
          e.kind === 'stop'
            ? { tripId: e.tripId, reason: e.reason }
            : { tripId: e.tripId, startId: e.startId };
        if (existing.length) {
          const x = existing[0];
          const matches = await tx.query('SELECT $1::jsonb=$2::jsonb AS equal', [
            JSON.stringify(x.payload),
            JSON.stringify(payload),
          ]);
          if (x.actor_id !== user.id || x.kind !== e.kind || !x.same_time || !matches[0].equal)
            throw new HttpException('Event conflict', 409);
          return;
        }
        const open = await tx.query(
          `SELECT s.id FROM dalumaga.stop_event s WHERE s.trip_id=$1 AND s.kind='stop' AND NOT EXISTS(SELECT 1 FROM dalumaga.stop_event x WHERE x.starts_at_event=s.id)`,
          [e.tripId],
        );
        if (e.kind === 'stop' && open.length)
          throw new HttpException('A stop is already open', 409);
        if (e.kind === 'resume' && (open.length !== 1 || open[0].id !== e.startId))
          throw new HttpException('Stop is not open', 409);
        await tx.query(
          `INSERT INTO dalumaga.client_event(client_event_id,kind,actor_id,device_id,occurred_at,payload) SELECT $1,$2,$3,device_id,$4,$5::jsonb FROM dalumaga.staff_session WHERE token_hash=encode(sha256(convert_to($6,'UTF8')),'hex')`,
          [e.id, e.kind, user.id, e.occurredAt, JSON.stringify(payload), header!.slice(7)],
        );
        await tx.query(
          'INSERT INTO dalumaga.stop_event(id,kind,trip_id,reason,starts_at_event) VALUES($1,$2,$3,$4,$5)',
          [
            e.id,
            e.kind,
            e.tripId,
            e.kind === 'stop' ? e.reason : null,
            e.kind === 'resume' ? e.startId : null,
          ],
        );
      });
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23505') throw new HttpException('Event conflict', 409);
      throw error;
    }
    return { id: e.id, accepted: true };
  }
  @Get('office') async office(@Headers('authorization') header?: string) {
    this.simulator();
    const user = await this.auth.authorize(header, ['dispatcher']);
    const db = await this.auth.connectionForStaff();
    return db.query(
      `SELECT t.id,r.name AS route,v.registration AS vehicle,
       (SELECT min(b.deadline_at) FROM dalumaga.batch b WHERE b.trip_id=t.id AND b.completed_at IS NULL) AS deadline,
       g.fix_at AS "lastFixAt",g.received_at AS "lastReceivedAt",g.source AS "locationSource",g.latitude::text,g.longitude::text,
       s.reason AS "stopReason", se.occurred_at AS "stopAt",
       (SELECT COALESCE(json_agg(json_build_object('id',h.id,'reason',h.reason,'startedAt',he.occurred_at,'endedAt',re.occurred_at) ORDER BY he.received_at DESC),'[]'::json)
        FROM dalumaga.stop_event h JOIN dalumaga.client_event he ON he.client_event_id=h.id
        LEFT JOIN dalumaga.stop_event ending ON ending.starts_at_event=h.id
        LEFT JOIN dalumaga.client_event re ON re.client_event_id=ending.id
        WHERE h.trip_id=t.id AND h.kind='stop') AS "stopHistory"
       FROM dalumaga.trip t JOIN dalumaga.route r ON r.id=t.route_id JOIN dalumaga.vehicle v ON v.id=t.vehicle_id
       JOIN dalumaga.trip_assignment a ON a.trip_id=t.id AND a.user_id=$1
       LEFT JOIN LATERAL (SELECT * FROM dalumaga.gps_point WHERE trip_id=t.id AND valid ORDER BY fix_at DESC,received_at DESC LIMIT 1) g ON true
       LEFT JOIN LATERAL (SELECT x.* FROM dalumaga.stop_event x WHERE x.trip_id=t.id AND x.kind='stop' AND NOT EXISTS(SELECT 1 FROM dalumaga.stop_event y WHERE y.starts_at_event=x.id) ORDER BY x.id LIMIT 1) s ON true
       LEFT JOIN dalumaga.client_event se ON se.client_event_id=s.id WHERE t.ended_at IS NULL ORDER BY deadline NULLS LAST,t.id`,
      [user.id],
    );
  }
  @Post('simulate-position') async simulate(
    @Headers('authorization') header: string | undefined,
    @Body() body: unknown,
  ) {
    this.simulator();
    const user = await this.auth.authorize(header, ['dispatcher']);
    const parsed = Position.safeParse(body);
    if (!parsed.success) throw new HttpException('Invalid simulation', 400);
    const db = await this.auth.connectionForStaff();
    const { tripId, sample } = parsed.data;
    const allowed = await db.query(
      'SELECT 1 FROM dalumaga.trip_assignment WHERE trip_id=$1 AND user_id=$2',
      [tripId, user.id],
    );
    if (!allowed.length) throw new ForbiddenException('Trip is not assigned');
    const now = new Date();
    const sampleTime = new Date(now.getTime() - (2 - sample) * 60000).toISOString();
    const tracker = new SimulatedTracker(
      [
        {
          recordedAt: sampleTime,
          latitude: 6.9 + sample * 0.001,
          longitude: 80.5 + sample * 0.001,
          stopped: false,
          fuelLitres: 0,
        },
      ],
      sample === 1
        ? [{ from: sampleTime, to: new Date(Date.parse(sampleTime) + 1000).toISOString() }]
        : [],
    );
    const [position] = await tracker.getPositions({
      from: new Date(now.getTime() - 4 * 60000).toISOString(),
      to: new Date(now.getTime() + 60000).toISOString(),
    });
    if (!position) return { simulated: true, signalGap: true };
    await db.query(
      "INSERT INTO dalumaga.gps_point(trip_id,source,source_key,fix_at,valid,latitude,longitude) VALUES($1,'simulator',gen_random_uuid()::text,$2,true,$3,$4)",
      [tripId, position.recordedAt, position.latitude, position.longitude],
    );
    return { simulated: true, signalGap: false };
  }
}
