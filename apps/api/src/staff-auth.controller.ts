import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { StaffAuth, validateLogin } from './staff-auth';
@Controller('auth')
export class StaffAuthController {
  constructor(@Inject(StaffAuth) private readonly auth: StaffAuth) {}
  @Post('login') login(@Body() body: unknown) {
    const input = validateLogin(body);
    return this.auth.login(input.username, input.password);
  }
  @Get('me') me(
    @Headers('authorization') header?: string,
    @Headers('x-device-secret') secret?: string,
  ) {
    return this.auth.authorize(header, undefined, secret);
  }
  @Post('logout') async logout(
    @Headers('authorization') header?: string,
    @Headers('x-device-secret') secret?: string,
  ) {
    await this.auth.logout(header, secret);
    return { success: true };
  }
  @Post('devices/enroll') async enroll(
    @Headers('authorization') header: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(80),
        secret: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid device registration');
    await this.auth.enroll(header, parsed.data.id, parsed.data.label, parsed.data.secret);
    return { success: true };
  }
  @Get('devices') devices(@Headers('authorization') header?: string) {
    return this.auth.devices(header);
  }
  @Post('devices/:id/revoke') async revoke(
    @Headers('authorization') header: string | undefined,
    @Param('id') id: string,
  ) {
    if (!z.string().uuid().safeParse(id).success) throw new BadRequestException('Invalid device');
    await this.auth.revokeDevice(header, id);
    return { success: true };
  }
  @Post('recovery/devices/search') recoveryDevices(
    @Headers('authorization') header: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ username: z.string().trim().min(1).max(128) })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter a staff username');
    return this.auth.recoveryDevices(header, parsed.data.username);
  }
  @Post('recovery/devices/:id/revoke') async recoveryRevoke(
    @Headers('authorization') header: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ reason: z.enum(['lost', 'stolen', 'compromised']) })
      .strict()
      .safeParse(body);
    if (!z.string().uuid().safeParse(id).success || !parsed.success)
      throw new BadRequestException('Invalid recovery request');
    await this.auth.recoveryRevokeDevice(header, id, parsed.data.reason);
    return { success: true };
  }
}
