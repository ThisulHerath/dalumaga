import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Inject,
  Post,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';

const IDS = {
  weigher: '11111111-1111-4111-8111-111111111111',
  receiver: '22222222-2222-4222-8222-222222222222',
  factory: '33333333-3333-4333-8333-333333333333',
  route: '44444444-4444-4444-8444-444444444444',
  vehicle: '55555555-5555-4555-8555-555555555555',
  trip: '66666666-6666-4666-8666-666666666666',
  point: '77777777-7777-4777-8777-777777777777',
  batch: '88888888-8888-4888-8888-888888888888',
  crate: '99999999-9999-4999-8999-999999999999',
  load: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  scale: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tare: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  device: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};
const Event = z
  .object({
    id: z.string().uuid(),
    loadId: z.literal(IDS.load),
    stage: z.enum(['pickup', 'receipt']),
    grossGrams: z.number().int().min(2000).max(999999999),
    tareGrams: z.literal(2000),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export class DemoService {
  private db: DataSource | undefined;
  private connecting: Promise<DataSource> | undefined;
  constructor(
    private readonly makeDb = () =>
      new DataSource({
        type: 'postgres',
        url: process.env.DALUMAGA_DEMO_DATABASE_URL ?? '',
      }),
  ) {}
  private async database(): Promise<DataSource> {
    if (process.env.DALUMAGA_DEMO !== 'true' || process.env.NODE_ENV === 'production')
      throw new ForbiddenException('Sample mode is disabled');
    const url = new URL(process.env.DALUMAGA_DEMO_DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
      url.pathname !== '/dalumaga_demo' ||
      url.search !== ''
    )
      throw new ForbiddenException('Sample mode requires the local dalumaga_demo database');
    if (this.db) return this.db;
    if (!this.connecting) {
      const db = this.makeDb();
      this.connecting = db
        .initialize()
        .then((connection) => {
          this.db = connection;
          return connection;
        })
        .finally(() => {
          this.connecting = undefined;
        });
    }
    return this.connecting;
  }
  async close(): Promise<void> {
    if (this.db?.isInitialized) await this.db.destroy();
  }
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
  async seed() {
    const db = await this.database();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO dalumaga.app_user(id,auth_subject,display_name) VALUES ($1,'demo-weigher','Sample weigher'),($2,'demo-receiver','Sample receiver') ON CONFLICT (id) DO NOTHING",
        [IDS.weigher, IDS.receiver],
      );
      await tx.query(
        "INSERT INTO dalumaga.factory(id,name) VALUES ($1,'Sample factory') ON CONFLICT (id) DO NOTHING",
        [IDS.factory],
      );
      await tx.query(
        "INSERT INTO dalumaga.route(id,factory_id,name) VALUES ($1,$2,'Sample route') ON CONFLICT (id) DO NOTHING",
        [IDS.route, IDS.factory],
      );
      await tx.query(
        "INSERT INTO dalumaga.vehicle(id,registration) VALUES ($1,'SAMPLE-VEHICLE') ON CONFLICT (id) DO NOTHING",
        [IDS.vehicle],
      );
      await tx.query(
        'INSERT INTO dalumaga.trip(id,route_id,vehicle_id,driver_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
        [IDS.trip, IDS.route, IDS.vehicle, IDS.weigher],
      );
      await tx.query(
        "INSERT INTO dalumaga.pickup_point(id,name) VALUES ($1,'Sample pickup') ON CONFLICT (id) DO NOTHING",
        [IDS.point],
      );
      await tx.query(
        'INSERT INTO dalumaga.batch(id,trip_id,point_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
        [IDS.batch, IDS.trip, IDS.point],
      );
      await tx.query(
        "INSERT INTO dalumaga.crate(id,qr_code) VALUES ($1,'SAMPLE-C042') ON CONFLICT (id) DO NOTHING",
        [IDS.crate],
      );
      await tx.query(
        "INSERT INTO dalumaga.device_scale(id,asset_code,resolution_kg) VALUES ($1,'SAMPLE-SCALE',0.001) ON CONFLICT (id) DO NOTHING",
        [IDS.scale],
      );
      await tx.query(
        "INSERT INTO dalumaga.crate_tare(id,crate_id,empty_kg,verified_at,verified_by,scale_id,condition_note) VALUES ($1,$2,2,'2020-01-01T00:00:00Z',$3,$4,'Simulated sample') ON CONFLICT (id) DO NOTHING",
        [IDS.tare, IDS.crate, IDS.weigher, IDS.scale],
      );
      await tx.query(
        'INSERT INTO dalumaga.crate_load(id,batch_id,crate_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
        [IDS.load, IDS.batch, IDS.crate],
      );
    });
    return {
      tripId: IDS.trip,
      batchId: IDS.batch,
      loadId: IDS.load,
      crate: 'SAMPLE-C042',
      tareGrams: 2000,
    };
  }
  async upload(input: unknown) {
    const event = Event.safeParse(input);
    if (!event.success) throw new HttpException('Invalid sample reading', 400);
    const db = await this.database();
    const e = event.data;
    const payload = {
      load_id: IDS.load,
      stage: e.stage,
      scale_id: IDS.scale,
      gross_kg: e.grossGrams / 1000,
      tare_id: IDS.tare,
      capture_method: 'simulator',
      verified: true,
    };
    try {
      await db.query('SELECT dalumaga.upload_weigh($1,$2,$3,$4,$5::jsonb)', [
        e.id,
        e.stage === 'pickup' ? IDS.weigher : IDS.receiver,
        IDS.device,
        e.occurredAt,
        JSON.stringify(payload),
      ]);
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23505' || code === 'DM001')
        throw new HttpException('Reading conflict; original retained', 409);
      throw error;
    }
    return { id: e.id, accepted: true };
  }
  async comparison() {
    const db = await this.database();
    const rows = (await db.query(
      'SELECT pickup_kg,receipt_kg,difference_kg FROM dalumaga.load_difference WHERE load_id=$1',
      [IDS.load],
    )) as { pickup_kg: string | null; receipt_kg: string | null; difference_kg: string | null }[];
    const row = rows[0];
    if (!row) throw new HttpException('Sample trip not prepared', 404);
    return {
      tripId: IDS.trip,
      loadId: IDS.load,
      pickupKg: row.pickup_kg,
      receiptKg: row.receipt_kg,
      differenceKg: row.difference_kg,
    };
  }
}
@Controller('demo')
export class DemoController {
  constructor(@Inject(DemoService) private readonly service: DemoService) {}
  @Post('setup') setup() {
    return this.service.seed();
  }
  @Post('weighings') weigh(@Body() body: unknown) {
    return this.service.upload(body);
  }
  @Get('comparison') comparison() {
    return this.service.comparison();
  }
}
