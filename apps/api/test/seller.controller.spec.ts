import { Reflector } from '@nestjs/core';
import { SellerController } from '../src/modules/sellers/seller.controller';
import { FEATURE_KEY } from '../src/common/features/feature.decorator';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types';
import { validate } from 'class-validator';
import { CreateSellerApplicationDto } from '../src/modules/sellers/seller.dtos';

describe('Create seller application membership progression', () => {
  it.each(['WHOLESALER', 'DISTRIBUTOR', 'VENDOR'])(
    'rejects %s as a fresh seller application type',
    async (sellerType) => {
      const request = Object.assign(new CreateSellerApplicationDto(), {
        sellerType,
        businessName: 'Example Business',
        storeName: 'Example Store',
      });

      const errors = await validate(request);

      expect(errors.map((error) => error.property)).toContain('sellerType');
    },
  );

  it.each(['RETAILER'])(
    'allows %s as a seller application type',
    async (sellerType) => {
      const request = Object.assign(new CreateSellerApplicationDto(), {
        sellerType,
        businessName: 'Example Business',
        storeName: 'Example Store',
        businessDescription: 'A retail business serving local customers.',
        businessRegistrationStatus: 'UNREGISTERED',
        businessPhone: '+2348012345678',
        businessAddress: '12 Example Street, Lagos, Nigeria',
        productsServicesDescription: 'Retail sales of household and personal products.',
        productCategories: ['Household', 'Personal Care'],
      });

      await expect(validate(request)).resolves.toHaveLength(0);
    },
  );
});

describe('Seller application eligibility endpoint', () => {
  const handler = SellerController.prototype.getApplicationEligibility;

  it('requires the seller-stores feature', () => {
    expect(new Reflector().get(FEATURE_KEY, handler)).toBe(
      'SELLER_STORES_ENABLED',
    );
  });

  it('uses the authenticated user ID', async () => {
    const sellers = {
      isSellerApplicationEligible: jest.fn().mockResolvedValue(true),
    };
    const controller = new SellerController(sellers as never, {} as never);
    const user: AuthenticatedUser = {
      id: 'authenticated-user-id',
      email: null,
      phone: null,
      roles: ['CUSTOMER'],
    };

    await expect(controller.getApplicationEligibility(user)).resolves.toEqual({
      eligible: true,
    });
    expect(sellers.isSellerApplicationEligible).toHaveBeenCalledWith(
      'authenticated-user-id',
    );
  });
});

describe('Seller orders endpoint', () => {
  const listSellerOrders = SellerController.prototype.listSellerOrders;

  it('requires the seller-stores feature', () => {
    const reflector = new Reflector();

    expect(reflector.get(FEATURE_KEY, listSellerOrders)).toBe(
      'SELLER_STORES_ENABLED',
    );
  });

  it('passes authenticated user identity to the seller service', async () => {
    const sellers = {
      listSellerOrders: jest.fn().mockResolvedValue([
        {
          id: 'order-id',
          orderNumber: '1001',
          status: 'PLACED',
        },
      ]),
    };

    const controller = new SellerController(sellers as never, {} as never);

    const user: AuthenticatedUser = {
      id: 'authenticated-seller-user',
      email: null,
      phone: null,
      roles: ['VENDOR'],
    };

    const result = await controller.listSellerOrders(user);

    expect(sellers.listSellerOrders).toHaveBeenCalledWith(
      'authenticated-seller-user',
    );

    expect(result).toEqual([
      {
        id: 'order-id',
        orderNumber: '1001',
        status: 'PLACED',
      },
    ]);
  });
});
