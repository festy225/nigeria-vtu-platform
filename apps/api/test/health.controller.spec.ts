import { Test } from '@nestjs/testing';
import { HealthController } from '../src/modules/health/health.controller';

describe('HealthController', () => {
  it('returns an API health response', () => {
    const database = { query: jest.fn() };
    const controller = new HealthController(database as never);
    expect(controller.getHealth()).toEqual(expect.objectContaining({ status: 'ok', app: 'nigeria-vtu-platform-api' }));
  });

  it('checks database reachability', async () => {
    const database = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const controller = new HealthController(database as never);
    await expect(controller.getDatabaseHealth()).resolves.toEqual({ status: 'ok', database: 'reachable' });
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
  });
});
