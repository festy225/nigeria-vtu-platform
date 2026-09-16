import { ServiceUnavailableException } from '@nestjs/common';
import { FeatureService } from '../src/modules/features/feature.service';

describe('FeatureService', () => {
  it('returns false for an unknown or disabled feature', async () => {
    const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new FeatureService(database as never);
    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(false);
    expect(database.query).toHaveBeenCalledWith(
      'SELECT enabled FROM feature_toggles WHERE key = $1',
      ['AIRTIME_ENABLED']
    );
  });

  it('caches a toggle briefly and invalidates cache after an update', async () => {
    const database = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ key: 'AIRTIME_ENABLED', enabled: false, metadata: {}, updatedAt: 'now' }] })
      .mockResolvedValueOnce({ rows: [{ enabled: false }] }) };
    const service = new FeatureService(database as never);
    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(true);
    await expect(service.setEnabled('AIRTIME_ENABLED', false, 'admin-1')).resolves.toEqual(expect.objectContaining({ enabled: false }));
    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(false);
    expect(database.query).toHaveBeenCalledTimes(3);
  });
});

describe('FeatureGuard contract', () => {
  it('uses a backend feature service rather than frontend visibility', async () => {
    const features = { isEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new (require('../src/common/features/feature.guard').FeatureGuard)(
      { getAllAndOverride: () => 'AIRTIME_ENABLED' },
      features
    );
    await expect(guard.canActivate({ getHandler: () => undefined, getClass: () => undefined } as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
