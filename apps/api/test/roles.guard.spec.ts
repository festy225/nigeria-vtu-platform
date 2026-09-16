import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/auth/roles.guard';

describe('RolesGuard', () => {
  it('allows a matching role and rejects a non-matching role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = { allowed: Reflect.getMetadata('roles', () => undefined) };
    void handler;
    const context = { getHandler: () => function endpoint() {}, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => ({ user: { roles: ['CUSTOMER'] } }) }) } as never;
    Reflect.defineMetadata('roles', ['CUSTOMER'], context.getHandler());
    expect(guard.canActivate(context)).toBe(true);
    Reflect.defineMetadata('roles', ['ADMIN'], context.getHandler());
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });
});
