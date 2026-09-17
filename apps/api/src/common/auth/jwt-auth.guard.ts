import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './auth.decorators';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

interface AccessTokenPayload { sub: string; sessionId?: string; roles?: AuthenticatedUser['roles']; email?: string | null; phone?: string | null; }

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthenticatedUser }>();
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Authentication required');
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
      request.user = { id: payload.sub, email: payload.email ?? null, phone: payload.phone ?? null, roles: payload.roles ?? [], sessionId: payload.sessionId };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
