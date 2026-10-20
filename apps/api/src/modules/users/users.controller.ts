import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersRepository } from './users.repository';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  @Get()
  @Roles('SUPER_ADMIN')
  listUsers(
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('search') searchRaw?: string,
  ) {
    const requestedPage = Number.parseInt(pageRaw ?? '', 10);
    const requestedLimit = Number.parseInt(limitRaw ?? '', 10);

    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const limit =
      Number.isSafeInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 25;
    const search = searchRaw?.trim().slice(0, 100) || undefined;

    return this.users.listUsers(page, limit, search);
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isPrivileged = user.roles?.some(
      (role) => role === 'ADMIN' || role === 'SUPER_ADMIN',
    );

    if (id !== user.id && !isPrivileged) {
      throw new ForbiddenException(
        'You are not allowed to access this user record',
      );
    }

    return this.users.findById(id);
  }
}
