import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { validate } from 'class-validator';
import { FeatureService } from '../src/modules/features/feature.service';
import { UpdateFeatureToggleDto } from '../src/modules/features/feature.dtos';
import { FeatureGuard } from '../src/common/features/feature.guard';

describe('FeatureService', () => {
  it('returns false for an unknown or disabled feature', async () => {
    const query = jest.fn() as jest.Mock;
    query.mockImplementation(() => Promise.resolve({ rows: [] }));

    const database = { query };
    const audit = { record: jest.fn() };

    const service = new FeatureService(database as never, audit as never);

    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(false);

    expect(database.query).toHaveBeenCalledWith(
      'SELECT enabled FROM feature_toggles WHERE key = $1',
      ['AIRTIME_ENABLED'],
    );
  });

  it('caches a toggle briefly and invalidates cache after an update', async () => {
    const query = jest.fn() as jest.Mock;

    query
      .mockImplementationOnce(() =>
        Promise.resolve({ rows: [{ enabled: true }] }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          rows: [
            {
              key: 'AIRTIME_ENABLED',
              enabled: false,
              metadata: {},
              updatedAt: 'now',
              previousEnabled: true,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ rows: [{ enabled: false }] }),
      );

    const database = { query };

    const record = jest.fn() as jest.Mock;
    record.mockImplementation(() => Promise.resolve());

    const audit = { record };

    const service = new FeatureService(database as never, audit as never);

    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(true);

    await expect(
      service.setEnabled('AIRTIME_ENABLED', false, 'admin-1'),
    ).resolves.toEqual(expect.objectContaining({ enabled: false }));

    await expect(service.isEnabled('AIRTIME_ENABLED')).resolves.toBe(false);

    expect(database.query).toHaveBeenCalledTimes(3);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'FEATURE_TOGGLE_UPDATED',
        resourceType: 'FEATURE_TOGGLE',
        beforeData: {
          key: 'AIRTIME_ENABLED',
          enabled: true,
        },
        afterData: {
          key: 'AIRTIME_ENABLED',
          enabled: false,
        },
      }),
    );
  });
});

describe('FeatureGuard contract', () => {
  it('uses a backend feature service rather than frontend visibility', async () => {
    const isEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const features = { isEnabled };

    const guard = new FeatureGuard(
      { getAllAndOverride: () => 'AIRTIME_ENABLED' } as never,
      features as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
      } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('allows an enabled protected feature', async () => {
    const isEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

    const features = { isEnabled };

    const guard = new FeatureGuard(
      { getAllAndOverride: () => 'AIRTIME_ENABLED' } as never,
      features as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
      } as never),
    ).resolves.toBe(true);
  });

  it('requires all features when multiple features are specified', async () => {
    const isEnabled = jest
  .fn<() => Promise<boolean>>()
  .mockResolvedValueOnce(true)
  .mockResolvedValueOnce(true);

    const features = { isEnabled };

    const guard = new FeatureGuard(
      {
        getAllAndOverride: () => [
          'MARKETPLACE_ENABLED',
          'NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED',
        ],
      } as never,
      features as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
      } as never),
    ).resolves.toBe(true);

    expect(isEnabled).toHaveBeenNthCalledWith(
      1,
      'MARKETPLACE_ENABLED',
    );

    expect(isEnabled).toHaveBeenNthCalledWith(
      2,
      'NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED',
    );
  });

  it('blocks marketplace when one required feature is disabled', async () => {
   const isEnabled = jest
  .fn<() => Promise<boolean>>()
  .mockResolvedValueOnce(true)
  .mockResolvedValueOnce(false);

    const features = { isEnabled };

    const guard = new FeatureGuard(
      {
        getAllAndOverride: () => [
          'MARKETPLACE_ENABLED',
          'NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED',
        ],
      } as never,
      features as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
      } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it('allows endpoints without a required feature', async () => {
    const isEnabled = jest.fn();

    const features = { isEnabled };

    const guard = new FeatureGuard(
      { getAllAndOverride: () => undefined } as never,
      features as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
      } as never),
    ).resolves.toBe(true);

    expect(features.isEnabled).not.toHaveBeenCalled();
  });
});

describe('Feature toggle update DTO', () => {
  it('accepts only a boolean enabled state', async () => {
    const valid = new UpdateFeatureToggleDto();
    valid.enabled = true;

    await expect(validate(valid)).resolves.toHaveLength(0);

    const invalid = Object.assign(new UpdateFeatureToggleDto(), {
      enabled: 'true',
      reason: 'unrequested',
    });

    await expect(
      validate(invalid, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'reason' }),
        expect.objectContaining({ property: 'enabled' }),
      ]),
    );
  });
});