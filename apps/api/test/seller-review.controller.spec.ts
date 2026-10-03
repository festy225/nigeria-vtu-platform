import { UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../src/common/auth/auth.decorators';
import { FEATURE_KEY } from '../src/common/features/feature.decorator';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { SellerController } from '../src/modules/sellers/seller.controller';
import { ReviewSellerApplicationDto } from '../src/modules/sellers/seller.dtos';

describe('Seller application review endpoint', () => {
  const reviewApplication = SellerController.prototype.reviewApplication;

  it('requires JWT authentication, SUPER_ADMIN, and the seller-stores feature', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, reviewApplication)).toBeUndefined();
    expect(reflector.get(ROLES_KEY, reviewApplication)).toEqual([
      'SUPER_ADMIN',
    ]);
    expect(reflector.get(FEATURE_KEY, reviewApplication)).toBe(
      'SELLER_STORES_ENABLED',
    );
  });

  it('keeps unauthenticated review requests blocked by the existing JWT guard', async () => {
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: jest.fn() } as never,
      { getOrThrow: jest.fn() } as never,
    );
    const context = {
      getHandler: () => reviewApplication,
      getClass: () => SellerController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows only SUPER_ADMIN through the existing roles guard', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const contextFor = (roles: string[]) =>
      ({
        getHandler: () => reviewApplication,
        getClass: () => SellerController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles } }),
        }),
      }) as never;

    expect(() => guard.canActivate(contextFor(['CUSTOMER']))).toThrow(
      'Insufficient permissions',
    );
    expect(guard.canActivate(contextFor(['SUPER_ADMIN']))).toBe(true);
  });

  it('passes reviewer identity from authenticated context, not request properties', async () => {
    const sellers = {
      reviewApplication: jest.fn().mockResolvedValue({ id: 'application-id' }),
    };
    const controller = new SellerController(sellers as never);
    const dto = Object.assign(new ReviewSellerApplicationDto(), {
      decision: 'APPROVE' as const,
      reviewerId: 'attacker-controlled-id',
      reviewedAt: '2000-01-01T00:00:00.000Z',
      kycStatus: 'VERIFIED',
      sellerType: 'DISTRIBUTOR',
      role: 'SUPER_ADMIN',
      entitlementStatus: 'ACTIVE',
    });

    await controller.reviewApplication(
      'application-id',
      {
        id: 'authenticated-super-admin',
        email: null,
        phone: null,
        roles: ['SUPER_ADMIN'],
      },
      dto,
    );

    expect(sellers.reviewApplication).toHaveBeenCalledWith(
      'application-id',
      'authenticated-super-admin',
      dto,
    );
  });

  it('rejects client attempts to provide reviewer, timestamp, KYC, seller type, role, or entitlement fields', async () => {
    const request = Object.assign(new ReviewSellerApplicationDto(), {
      decision: 'APPROVE',
      reviewerId: 'client-reviewer',
      reviewedAt: '2000-01-01T00:00:00.000Z',
      kycStatus: 'VERIFIED',
      sellerType: 'DISTRIBUTOR',
      role: 'SUPER_ADMIN',
      entitlementStatus: 'ACTIVE',
    });

    const errors = await validate(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'reviewerId',
        'reviewedAt',
        'kycStatus',
        'sellerType',
        'role',
        'entitlementStatus',
      ]),
    );
  });
});
