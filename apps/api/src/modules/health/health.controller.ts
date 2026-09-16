import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  getHealth() {
    return { status: 'ok', app: 'nigeria-vtu-platform-api', timestamp: new Date().toISOString() };
  }

  @Get('database')
  async getDatabaseHealth() {
    await this.database.query('SELECT 1');
    return { status: 'ok', database: 'reachable' };
  }
}
