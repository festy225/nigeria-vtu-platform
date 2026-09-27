import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/auth/roles.guard';

describe('RolesGuard', () => {
  it('allows a matching role and rejects a non-matching role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = () => undefined;

    const context = {
      getHandler: () => handler,
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { roles: ['CUSTOMER'] },
        }),
      }),
    } as unknown as ExecutionContext;

    Reflect.defineMetadata('roles', ['CUSTOMER'], handler);
    expect(guard.canActivate(context)).toBe(true);

    Reflect.defineMetadata('roles', ['ADMIN'], handler);
    expect(() => guard.canActivate(context)).toThrow(
      'Insufficient permissions',
    );
  });
});
