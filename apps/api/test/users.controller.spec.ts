import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types';
import { UsersRepository } from '../src/modules/users/users.repository';
import { UsersController } from '../src/modules/users/users.controller';

describe('UsersController access control', () => {
  let controller: UsersController;
  let users: jest.Mocked<Pick<UsersRepository, 'findById'>>;

  const customer: AuthenticatedUser = {
    id: 'customer-1',
    email: 'customer@example.com',
    phone: null,
    roles: ['CUSTOMER'],
  };

  beforeEach(() => {
    users = {
      findById: jest.fn().mockResolvedValue({
        id: 'customer-1',
        email: 'customer@example.com',
      }),
    };

    controller = new UsersController(
      users as unknown as UsersRepository,
    );
  });

  it('allows a user to retrieve their own record', async () => {
    await controller.getById('customer-1', customer);

    expect(users.findById).toHaveBeenCalledWith('customer-1');
  });

  it('blocks a customer from retrieving another user record', () => {
    expect(() =>
      controller.getById('customer-2', customer),
    ).toThrow(ForbiddenException);

    expect(users.findById).not.toHaveBeenCalled();
  });

  it('allows an admin to retrieve another user record', async () => {
    const admin: AuthenticatedUser = {
      ...customer,
      id: 'admin-1',
      roles: ['ADMIN'],
    };

    await controller.getById('customer-2', admin);

    expect(users.findById).toHaveBeenCalledWith('customer-2');
  });

  it('allows a super admin to retrieve another user record', async () => {
    const superAdmin: AuthenticatedUser = {
      ...customer,
      id: 'super-admin-1',
      roles: ['SUPER_ADMIN'],
    };

    await controller.getById('customer-2', superAdmin);

    expect(users.findById).toHaveBeenCalledWith('customer-2');
  });
});
