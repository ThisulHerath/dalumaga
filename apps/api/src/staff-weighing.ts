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
import { z } from 'zod';
import { StaffAuth } from './staff-auth';

const Reading = z
  .object({
    id: z.string().uuid(),
    loadId: z.string().uuid(),
    stage: z.enum(['pickup', 'receipt']),
    grossGrams: z.number().int().min(0).max(999999999),
    tareId: z.string().uuid(),
    scaleId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

@Controller('staff')
export class StaffWeighingController {
  constructor(@Inject(StaffAuth) private readonly auth: StaffAuth) {}
  @Get('loads')
  async loads(@Headers('authorization') header?: string) {
    const user = await this.auth.authorize(header, ['weigher', 'receiver']);
    const db = await this.auth.connectionForStaff();
    return db.query(
      `SELECT l.id AS "loadId", t.id AS "tripId", c.qr_code AS "crateCode",
       tr.id AS "tareId", tr.empty_kg::text AS "tareKg", tr.scale_id AS "scaleId",
       EXISTS (SELECT 1 FROM dalumaga.weigh_event w WHERE w.load_id=l.id AND w.stage=$2) AS recorded
       FROM dalumaga.crate_load l JOIN dalumaga.batch b ON b.id=l.batch_id
       JOIN dalumaga.trip t ON t.id=b.trip_id
       JOIN dalumaga.trip_assignment a ON a.trip_id=t.id AND a.user_id=$1
       JOIN dalumaga.crate c ON c.id=l.crate_id
       JOIN LATERAL (SELECT * FROM dalumaga.crate_tare WHERE crate_id=c.id AND verified_at<=now()
         AND (valid_until IS NULL OR valid_until>now()) ORDER BY verified_at DESC LIMIT 1) tr ON true`,
      [user.id, user.roles.includes('weigher') ? 'pickup' : 'receipt'],
    );
  }
  @Post('weighings')
  async weigh(@Headers('authorization') header: string | undefined, @Body() body: unknown) {
    const parsed = Reading.safeParse(body);
    if (!parsed.success) throw new HttpException('Invalid reading', 400);
    const e = parsed.data;
    const user = await this.auth.authorize(header, [e.stage === 'pickup' ? 'weigher' : 'receiver']);
    if (process.env.DALUMAGA_STAFF_SIMULATOR !== 'true' || process.env.NODE_ENV === 'production')
      throw new ForbiddenException('Simulator is not enabled');
    const db = await this.auth.connectionForStaff();
    try {
      await db.transaction(async (tx) => {
        const allowed = (await tx.query(
          `SELECT 1 FROM dalumaga.crate_load l
          JOIN dalumaga.batch b ON b.id=l.batch_id
          JOIN dalumaga.trip_assignment a ON a.trip_id=b.trip_id AND a.user_id=$1
          JOIN dalumaga.crate_tare tr ON tr.id=$3 AND tr.crate_id=l.crate_id AND tr.scale_id=$4
          WHERE l.id=$2 AND tr.empty_kg*1000 <= $5
          AND NOT EXISTS (SELECT 1 FROM dalumaga.weigh_event w JOIN dalumaga.client_event ev ON ev.client_event_id=w.id
            WHERE w.load_id=l.id AND w.stage<>$6 AND ev.actor_id=$1)`,
          [user.id, e.loadId, e.tareId, e.scaleId, e.grossGrams, e.stage],
        )) as unknown[];
        if (!allowed.length)
          throw new ForbiddenException('Load is not assigned or requires independent staff');
        const payload = {
          load_id: e.loadId,
          stage: e.stage,
          scale_id: e.scaleId,
          gross_kg: e.grossGrams / 1000,
          tare_id: e.tareId,
          capture_method: 'simulator',
          verified: true,
        };
        await tx.query('SELECT dalumaga.upload_weigh($1,$2,$3,$4,$5::jsonb)', [
          e.id,
          user.id,
          user.id,
          e.occurredAt,
          JSON.stringify(payload),
        ]);
      });
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError?.code;
      if (code === 'DM001' || code === '23505') throw new HttpException('Reading conflict', 409);
      throw error;
    }
    return { id: e.id, accepted: true };
  }
  @Get('comparisons')
  async comparisons(@Headers('authorization') header?: string) {
    const user = await this.auth.authorize(header, ['dispatcher']);
    const db = await this.auth.connectionForStaff();
    return db.query(
      `SELECT d.load_id AS "loadId", c.qr_code AS "crateCode", d.pickup_kg::text AS "pickupKg",
      d.receipt_kg::text AS "receiptKg",d.difference_kg::text AS "differenceKg"
      FROM dalumaga.load_difference d JOIN dalumaga.crate_load l ON l.id=d.load_id
      JOIN dalumaga.crate c ON c.id=l.crate_id JOIN dalumaga.batch b ON b.id=l.batch_id
      JOIN dalumaga.trip_assignment a ON a.trip_id=b.trip_id AND a.user_id=$1`,
      [user.id],
    );
  }
}
