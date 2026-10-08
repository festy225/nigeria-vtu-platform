import { Reflector } from '@nestjs/core';
import { SellerController } from '../src/modules/sellers/seller.controller';
import { FEATURE_KEY } from '../src/common/features/feature.decorator';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types';

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

    const controller = new SellerController(sellers as never);

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
