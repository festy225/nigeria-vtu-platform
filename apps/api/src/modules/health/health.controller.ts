import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { Public } from '../../common/auth/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get()
  async getHealth() {
    const checkedAt = new Date().toISOString();

    try {
      await this.database.query('SELECT 1');

      return {
        status: 'ok',
        app: 'nigeria-vtu-platform-api',
        database: 'reachable',
        checkedAt,
      };
    } catch {
      return {
        status: 'degraded',
        app: 'nigeria-vtu-platform-api',
        database: 'unreachable',
        checkedAt,
      };
    }
  }

  @Public()
  @Get('database')
  async getDatabaseHealth() {
    try {
      await this.database.query('SELECT 1');

      return {
        status: 'ok',
        database: 'reachable',
        checkedAt: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        checkedAt: new Date().toISOString(),
      });
    }
  }
}
