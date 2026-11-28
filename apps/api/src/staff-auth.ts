import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource, type EntityManager } from 'typeorm';
import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';

const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt.toString('hex') + ':' + hash.toString('hex');
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, stored] = encoded.split(':');
  if (!salt || !stored || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(stored))
    return false;
  const actual = (await scrypt(password, Buffer.from(salt, 'hex'), 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(stored, 'hex'));
}
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export type StaffIdentity = { id: string; displayName: string; roles: string[] };
export class StaffAuth {
  private db: DataSource | undefined;
  private connection: Promise<DataSource> | undefined;
  private async database(): Promise<DataSource> {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    if (this.db) return this.db;
    if (!this.connection) {
      const db = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
      this.connection = db
        .initialize()
        .then((result) => {
          this.db = result;
          return result;
        })
        .finally(() => {
          this.connection = undefined;
        });
    }
    return this.connection;
  }
  async connectionForStaff(): Promise<DataSource> {
    return this.database();
  }
  async lockDeviceSession(
    tx: EntityManager,
    header: string | undefined,
    secret: string | undefined,
    userId: string,
    role: string,
  ): Promise<void> {
    const token = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token || !secret || !/^[a-f0-9]{64}$/.test(secret))
      throw new UnauthorizedException('Device authentication required');
    const sessions = (await tx.query(
      'SELECT device_id FROM dalumaga.staff_session WHERE token_hash=$1 AND user_id=$2',
      [tokenHash(token), userId],
    )) as { device_id: string | null }[];
    const deviceId = sessions[0]?.device_id;
    if (!deviceId) throw new UnauthorizedException('Device authentication required');
    const devices = (await tx.query(
      'SELECT id FROM dalumaga.staff_device WHERE id=$1 AND user_id=$2 AND secret_hash=$3 AND revoked_at IS NULL FOR SHARE',
      [deviceId, userId, tokenHash(secret)],
    )) as unknown[];
    if (!devices.length) throw new UnauthorizedException('Device revoked');
    const active = (await tx.query(
      'SELECT s.token_hash FROM dalumaga.staff_session s JOIN dalumaga.app_user u ON u.id=s.user_id JOIN dalumaga.user_role r ON r.user_id=u.id WHERE s.token_hash=$1 AND s.user_id=$2 AND s.device_id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.enabled AND r.role_code=$4 FOR SHARE OF s,u,r',
      [tokenHash(token), userId, deviceId, role],
    )) as unknown[];
    if (!active.length) throw new UnauthorizedException('Session expired or permission changed');
  }
  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; user: StaffIdentity; expiresAt: string }> {
    if (username.length > 128 || password.length > 256 || !username.trim() || !password)
      throw new UnauthorizedException('Invalid credentials');
    const db = await this.database();
    const result = await db.transaction(async (tx) => {
      const rows = (await tx.query(
        'SELECT c.user_id,c.password_hash,c.failed_attempts,c.locked_until,u.enabled FROM dalumaga.staff_credential c JOIN dalumaga.app_user u ON u.id=c.user_id WHERE c.username=$1 FOR UPDATE',
        [username.trim().toLowerCase()],
      )) as {
        user_id: string;
        password_hash: string;
        failed_attempts: number;
        locked_until: Date | null;
        enabled: boolean;
      }[];
      const row = rows[0];
      if (!row) {
        await scrypt(password, Buffer.alloc(16), 64);
        return null;
      }
      const valid = await verifyPassword(password, row.password_hash);
      if (!valid || !row.enabled || (row.locked_until && row.locked_until > new Date())) {
        if (!valid)
          await tx.query(
            "UPDATE dalumaga.staff_credential SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE user_id=$1",
            [row.user_id],
          );
        return null;
      }
      const roles = (await tx.query(
        'SELECT role_code FROM dalumaga.user_role WHERE user_id=$1 ORDER BY role_code',
        [row.user_id],
      )) as { role_code: string }[];
      if (!roles.length) return null;
      await tx.query(
        'UPDATE dalumaga.staff_credential SET failed_attempts=0,locked_until=NULL WHERE user_id=$1',
        [row.user_id],
      );
      const token = randomBytes(32).toString('base64url');
      const sessions = (await tx.query(
        "INSERT INTO dalumaga.staff_session(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours') RETURNING expires_at",
        [tokenHash(token), row.user_id],
      )) as { expires_at: Date }[];
      return { token, expiresAt: sessions[0]!.expires_at.toISOString() };
    });
    if (!result) throw new UnauthorizedException('Invalid credentials');
    return {
      token: result.token,
      user: await this.authorize('Bearer ' + result.token),
      expiresAt: result.expiresAt,
    };
  }
  async authorize(
    header: string | undefined,
    allowed?: readonly string[],
    deviceSecret?: string,
    requireDevice = false,
  ): Promise<StaffIdentity> {
    const token = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new UnauthorizedException('Sign in required');
    const db = await this.database();
    const rows = (await db.query(
      "SELECT u.id,u.display_name,s.device_id,d.secret_hash,coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL),'{}') AS roles FROM dalumaga.staff_session s JOIN dalumaga.app_user u ON u.id=s.user_id LEFT JOIN dalumaga.user_role r ON r.user_id=u.id LEFT JOIN dalumaga.staff_device d ON d.id=s.device_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.enabled AND (s.device_id IS NULL OR (d.user_id=u.id AND d.revoked_at IS NULL)) GROUP BY u.id,s.device_id,d.secret_hash",
      [tokenHash(token)],
    )) as {
      id: string;
      display_name: string;
      roles: string[];
      device_id: string | null;
      secret_hash: string | null;
    }[];
    const user = rows[0];
    if (!user || !user.roles.length) throw new UnauthorizedException('Session expired');
    if (requireDevice || user.device_id) {
      if (
        !deviceSecret ||
        !/^[a-f0-9]{64}$/.test(deviceSecret) ||
        !user.secret_hash ||
        !timingSafeEqual(
          Buffer.from(tokenHash(deviceSecret), 'hex'),
          Buffer.from(user.secret_hash, 'hex'),
        )
      ) {
        throw new UnauthorizedException('Device authentication required');
      }
    }
    if (allowed && !user.roles.some((role) => allowed.includes(role)))
      throw new ForbiddenException('Role is not permitted');
    return { id: user.id, displayName: user.display_name, roles: user.roles };
  }
  async logout(header: string | undefined, deviceSecret?: string): Promise<void> {
    await this.authorize(header, undefined, deviceSecret);
    const token = header!.slice(7);
    const db = await this.database();
    await db.query(
      'UPDATE dalumaga.staff_session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
      [tokenHash(token)],
    );
  }
  async enroll(
    header: string | undefined,
    id: string,
    label: string,
    secret: string,
  ): Promise<void> {
    const user = await this.authorize(header, undefined, secret);
    const token = header!.slice(7);
    const db = await this.database();
    await db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO dalumaga.staff_device(id,user_id,label,secret_hash) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
        [id, user.id, label, tokenHash(secret)],
      );
      await tx.query('SELECT id FROM dalumaga.staff_device WHERE id=$1 FOR UPDATE', [id]);
      const updated = (await tx.query(
        'WITH changed AS (UPDATE dalumaga.staff_session s SET device_id=$1 FROM dalumaga.staff_device d WHERE s.token_hash=$2 AND s.user_id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND (s.device_id IS NULL OR s.device_id=d.id) AND d.id=$1 AND d.user_id=$3 AND d.revoked_at IS NULL AND d.secret_hash=$4 RETURNING s.device_id) SELECT * FROM changed',
        [id, tokenHash(token), user.id, tokenHash(secret)],
      )) as unknown[];
      if (!updated.length) throw new ForbiddenException('Device cannot be enrolled');
      await tx.query(
        "INSERT INTO dalumaga.audit_log(actor_id,action,entity_type,entity_id,detail) VALUES($1,'enroll','staff_device',$2,'{}')",
        [user.id, id],
      );
    });
  }
  async devices(header: string | undefined) {
    const user = await this.authorize(header);
    const db = await this.database();
    return db.query(
      'SELECT id,label,enrolled_at AS "enrolledAt",revoked_at AS "revokedAt" FROM dalumaga.staff_device WHERE user_id=$1 ORDER BY enrolled_at DESC',
      [user.id],
    );
  }
  async revokeDevice(header: string | undefined, id: string): Promise<void> {
    const user = await this.authorize(header);
    const db = await this.database();
    await db.transaction(async (tx) => {
      const rows = (await tx.query(
        'WITH changed AS (UPDATE dalumaga.staff_device SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id) SELECT * FROM changed',
        [id, user.id],
      )) as unknown[];
      if (!rows.length) throw new ForbiddenException('Device is not available');
      await tx.query(
        'UPDATE dalumaga.staff_session SET revoked_at=COALESCE(revoked_at,now()) WHERE device_id=$1 AND user_id=$2',
        [id, user.id],
      );
      await tx.query(
        "INSERT INTO dalumaga.audit_log(actor_id,action,entity_type,entity_id,detail) VALUES($1,'revoke','staff_device',$2,'{}')",
        [user.id, id],
      );
    });
  }
  private requireRecoverySimulator(): void {
    if (process.env.DALUMAGA_STAFF_SIMULATOR !== 'true' || process.env.NODE_ENV === 'production')
      throw new ForbiddenException('Recovery is available only in the development simulator');
  }
  async recoveryDevices(header: string | undefined, username: string) {
    this.requireRecoverySimulator();
    await this.authorize(header, ['admin']);
    const db = await this.database();
    return db.query(
      `SELECT d.id,d.label,d.enrolled_at AS "enrolledAt",d.revoked_at AS "revokedAt"
       FROM dalumaga.staff_device d JOIN dalumaga.staff_credential c ON c.user_id=d.user_id
       WHERE c.username=$1
       AND EXISTS (SELECT 1 FROM dalumaga.user_role r WHERE r.user_id=d.user_id AND r.role_code IN ('weigher','receiver','driver'))
       AND NOT EXISTS (SELECT 1 FROM dalumaga.user_role r WHERE r.user_id=d.user_id AND r.role_code IN ('admin','manager'))
       ORDER BY d.enrolled_at DESC`,
      [username.trim().toLowerCase()],
    );
  }
  async recoveryRevokeDevice(
    header: string | undefined,
    id: string,
    reason: 'lost' | 'stolen' | 'compromised',
  ): Promise<void> {
    this.requireRecoverySimulator();
    const admin = await this.authorize(header, ['admin']);
    const token = header!.slice(7);
    const db = await this.database();
    await db.transaction(async (tx) => {
      const active = (await tx.query(
        `SELECT s.token_hash FROM dalumaga.staff_session s
         JOIN dalumaga.app_user u ON u.id=s.user_id
         JOIN dalumaga.user_role r ON r.user_id=u.id AND r.role_code='admin'
         WHERE s.token_hash=$1 AND s.user_id=$2 AND s.device_id IS NULL
         AND s.revoked_at IS NULL AND s.expires_at>now() AND u.enabled
         FOR SHARE OF s,u,r`,
        [tokenHash(token), admin.id],
      )) as unknown[];
      if (!active.length)
        throw new UnauthorizedException('Admin session expired or access changed');
      // Match the device-first lock order used when accepting a weighing.
      const targets = (await tx.query(
        'SELECT id,user_id FROM dalumaga.staff_device WHERE id=$1 AND user_id<>$2 AND revoked_at IS NULL FOR UPDATE',
        [id, admin.id],
      )) as { id: string; user_id: string }[];
      const target = targets[0];
      if (!target) throw new ForbiddenException('Device is not available');
      const owners = (await tx.query('SELECT id FROM dalumaga.app_user WHERE id=$1 FOR UPDATE', [
        target.user_id,
      ])) as { id: string }[];
      const owner = owners[0];
      if (!owner) throw new ForbiddenException('Device is not available');
      const roles = (await tx.query(
        'SELECT role_code FROM dalumaga.user_role WHERE user_id=$1 FOR SHARE',
        [owner.id],
      )) as { role_code: string }[];
      if (
        !roles.some((r) => ['weigher', 'receiver', 'driver'].includes(r.role_code)) ||
        roles.some((r) => ['admin', 'manager'].includes(r.role_code))
      )
        throw new ForbiddenException('Device is not available');
      const devices = (await tx.query(
        `WITH changed AS (
          UPDATE dalumaga.staff_device d SET revoked_at=now()
          WHERE d.id=$1 AND d.user_id=$2 AND d.revoked_at IS NULL
          RETURNING d.id,d.user_id
        ) SELECT * FROM changed`,
        [id, owner.id],
      )) as { id: string; user_id: string }[];
      const device = devices[0];
      if (!device) throw new ForbiddenException('Device is not available');
      await tx.query(
        'UPDATE dalumaga.staff_session SET revoked_at=COALESCE(revoked_at,now()) WHERE device_id=$1 AND user_id=$2',
        [id, device.user_id],
      );
      await tx.query(
        `INSERT INTO dalumaga.audit_log(actor_id,action,entity_type,entity_id,detail)
         VALUES($1,'recovery_revoke','staff_device',$2,jsonb_build_object('reason',$3::text,'userId',$4::text))`,
        [admin.id, id, reason, device.user_id],
      );
    });
  }
  async onModuleDestroy(): Promise<void> {
    if (this.db?.isInitialized) await this.db.destroy();
  }
}
export function validateLogin(body: unknown): { username: string; password: string } {
  if (
    !body ||
    typeof body !== 'object' ||
    !('username' in body) ||
    !('password' in body) ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string'
  )
    throw new HttpException('Invalid request', 400);
  return { username: body.username, password: body.password };
}
