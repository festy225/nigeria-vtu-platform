import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../src/common/auth/auth.decorators';
import { KycController } from '../src/modules/kyc/kyc.controller';

describe('KycController', () => {
  const initiateHandler = KycController.prototype.initiate;
  const statusHandler = KycController.prototype.getStatus;

  it('keeps seller KYC endpoints behind the global JWT guard', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, initiateHandler)).toBeUndefined();
    expect(reflector.get(IS_PUBLIC_KEY, statusHandler)).toBeUndefined();
  });

  it('blocks unauthenticated KYC initiation with the existing JWT guard', async () => {
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: jest.fn() } as never,
      { getOrThrow: jest.fn() } as never,
    );
    const context = {
      getHandler: () => initiateHandler,
      getClass: () => KycController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not accept seller or user IDs and returns no provider reference', async () => {
    const kyc = {
      startForApprovedSeller: jest.fn().mockResolvedValue({
        id: 'verification-id',
        userId: 'authenticated-user',
        sellerId: 'seller-id',
        status: 'PENDING',
        providerReference: 'internal-provider-reference',
        submittedAt: null,
        verifiedAt: null,
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
        updatedAt: new Date('2026-10-03T10:00:00.000Z'),
      }),
    };
    const controller = new KycController(kyc as never);

    const result = await controller.initiate({
      id: 'authenticated-user',
      email: null,
      phone: null,
      roles: ['CUSTOMER'],
    });

    expect(kyc.startForApprovedSeller).toHaveBeenCalledWith(
      'authenticated-user',
    );
    expect(result).toMatchObject({
      id: 'verification-id',
      status: 'PENDING',
    });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('sellerId');
    expect(result).not.toHaveProperty('providerReference');
  });

  it('scopes KYC status lookup to the authenticated account', async () => {
    const kyc = {
      getForAuthenticatedUser: jest.fn().mockResolvedValue({
        id: 'verification-id',
        userId: 'authenticated-user',
        sellerId: 'seller-id',
        status: 'IN_REVIEW',
        providerReference: 'internal-provider-reference',
        submittedAt: new Date('2026-10-03T10:00:00.000Z'),
        verifiedAt: null,
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
        updatedAt: new Date('2026-10-03T10:00:00.000Z'),
      }),
    };
    const controller = new KycController(kyc as never);

    const result = await controller.getStatus({
      id: 'authenticated-user',
      email: null,
      phone: null,
      roles: ['CUSTOMER'],
    });

    expect(kyc.getForAuthenticatedUser).toHaveBeenCalledWith(
      'authenticated-user',
    );
    expect(result.status).toBe('IN_REVIEW');
    expect(result).not.toHaveProperty('providerReference');
  });
});
