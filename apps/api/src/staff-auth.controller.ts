import { Body, Controller, Headers, Inject, Post, Get } from '@nestjs/common';
import { StaffAuth, validateLogin } from './staff-auth';
@Controller('auth')
export class StaffAuthController {
  constructor(@Inject(StaffAuth) private readonly auth: StaffAuth) {}
  @Post('login') login(@Body() body: unknown) {
    const input = validateLogin(body);
    return this.auth.login(input.username, input.password);
  }
  @Get('me') me(@Headers('authorization') header?: string) {
    return this.auth.authorize(header);
  }
  @Post('logout') async logout(@Headers('authorization') header?: string) {
    await this.auth.logout(header);
    return { success: true };
  }
}
