import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource } from 'typeorm';
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
  async login(username: string, password: string): Promise<{ token: string; user: StaffIdentity }> {
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
      await tx.query(
        "INSERT INTO dalumaga.staff_session(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
        [tokenHash(token), row.user_id],
      );
      return { token, id: row.user_id };
    });
    if (!result) throw new UnauthorizedException('Invalid credentials');
    return { token: result.token, user: await this.authorize('Bearer ' + result.token) };
  }
  async authorize(header: string | undefined, allowed?: readonly string[]): Promise<StaffIdentity> {
    const token = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new UnauthorizedException('Sign in required');
    const db = await this.database();
    const rows = (await db.query(
      "SELECT u.id,u.display_name,coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL),'{}') AS roles FROM dalumaga.staff_session s JOIN dalumaga.app_user u ON u.id=s.user_id LEFT JOIN dalumaga.user_role r ON r.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.enabled GROUP BY u.id",
      [tokenHash(token)],
    )) as { id: string; display_name: string; roles: string[] }[];
    const user = rows[0];
    if (!user || !user.roles.length) throw new UnauthorizedException('Session expired');
    if (allowed && !user.roles.some((role) => allowed.includes(role)))
      throw new ForbiddenException('Role is not permitted');
    return { id: user.id, displayName: user.display_name, roles: user.roles };
  }
  async logout(header: string | undefined): Promise<void> {
    await this.authorize(header);
    const token = header!.slice(7);
    const db = await this.database();
    await db.query(
      'UPDATE dalumaga.staff_session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
      [tokenHash(token)],
    );
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
