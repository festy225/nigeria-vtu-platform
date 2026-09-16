import { Controller, Get, Param } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.users.findById(id);
  }
}
