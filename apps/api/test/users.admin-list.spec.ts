import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../src/common/auth/auth.decorators';
import { UsersController } from '../src/modules/users/users.controller';

describe('Super Admin user listing', () => {
  const repository = {
    listUsers: jest.fn(),
    findById: jest.fn(),
  };
  let controller: UsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(repository as never);
    repository.listUsers.mockResolvedValue({
      items: [],
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
    });
  });

  it('restricts the list route to SUPER_ADMIN through role metadata', () => {
    const reflector = new Reflector();

    expect(
      reflector.get(ROLES_KEY, UsersController.prototype.listUsers),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('passes pagination and trimmed search to the repository', async () => {
    await controller.listUsers('2', '50', '  joel@example.com  ');

    expect(repository.listUsers).toHaveBeenCalledWith(
      2,
      50,
      'joel@example.com',
    );
  });

  it('uses safe defaults and caps the page size at 100', async () => {
    await controller.listUsers('-2', '1000', '   ');

    expect(repository.listUsers).toHaveBeenCalledWith(1, 100, undefined);
  });

  it('returns the repository pagination result', async () => {
    const result = {
      items: [{ id: 'user-id', email: 'customer@example.com', roles: ['CUSTOMER'] }],
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    };
    repository.listUsers.mockResolvedValue(result);

    await expect(controller.listUsers()).resolves.toEqual(result);
  });
});
