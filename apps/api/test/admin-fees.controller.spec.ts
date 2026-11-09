import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../src/common/auth/auth.decorators';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { AdminFeesController } from '../src/modules/membership/admin-fees.controller';

describe('AdminFeesController authorization', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = AdminFeesController.prototype.listPrograms.bind(
    AdminFeesController.prototype,
  );

  function contextFor(role: string): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => AdminFeesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: [role] } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('restricts membership configuration and history to SUPER_ADMIN', () => {
    expect(new Reflector().get(ROLES_KEY, AdminFeesController)).toEqual([
      'SUPER_ADMIN',
    ]);
    expect(() => guard.canActivate(contextFor('CUSTOMER'))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(contextFor('SUPER_ADMIN'))).toBe(true);
  });

  it('requires authentication before the Super Admin role check', async () => {
    const reflector = new Reflector();
    const handler = Object.getOwnPropertyDescriptor(
      AdminFeesController.prototype,
      'listPrograms',
    )?.value as () => unknown;
    const guard = new JwtAuthGuard(
      reflector,
      { verifyAsync: jest.fn() } as never,
      { getOrThrow: jest.fn() } as never,
    );
    const context = {
      getHandler: () => handler,
      getClass: () => AdminFeesController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    expect(reflector.get(IS_PUBLIC_KEY, AdminFeesController)).toBeUndefined();
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
