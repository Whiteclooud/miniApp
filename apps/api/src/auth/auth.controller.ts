import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat-login')
  async loginWithWechat(@Body() payload: { code?: string; phoneCode?: string } = {}) {
    return this.authService.loginWithWechat(payload.code, payload.phoneCode);
  }

  @Get('me')
  async getMe(@Headers('authorization') authorization?: string) {
    return this.authService.getMe(authorization);
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization?: string) {
    return this.authService.logout(authorization);
  }
}
