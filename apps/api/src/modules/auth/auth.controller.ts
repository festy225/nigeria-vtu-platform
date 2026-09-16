import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, PasswordResetDto, PasswordResetRequestDto, RefreshDto, RegisterDto } from './auth.dtos';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('register') register(@Body() dto: RegisterDto, @Req() request: Request) { return this.auth.register(dto, request); }
  @Public() @Post('login') login(@Body() dto: LoginDto, @Req() request: Request) { return this.auth.login(dto.identifier, dto.password, request); }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto, @Req() request: Request) { return this.auth.refresh(dto.refreshToken, request); }
  @Get('me') me(@CurrentUser() user: AuthenticatedUser) { return { user }; }
  @Post('logout') logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) { return this.auth.logout(user.id, dto.refreshToken); }
  @Public() @Post('password-reset/request') requestReset(@Body() dto: PasswordResetRequestDto) { return this.auth.requestPasswordReset(dto.identifier); }
  @Public() @Post('password-reset/confirm') reset(@Body() dto: PasswordResetDto) { return this.auth.resetPassword(dto.token, dto.password); }
}
