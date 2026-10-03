import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycProviderRouterService } from '../src/modules/providers/routing/kyc-provider-router.service';
import { KycService } from '../src/modules/kyc/kyc.service';
import {
  normalizeKycProviderDecision,
} from '../src/modules/kyc/kyc.types';

type QueryResultMock = { rows: Array<Record<string, unknown>> };
type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<QueryResultMock>;

const pendingRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'kyc-id',
  seller_id: 'seller-id',
  user_id: 'user-id',
  status: 'PENDING',
  provider_reference: null,
  submitted_at: null,
  verified_at: null,
  created_at: new Date('2026-10-03T10:00:00.000Z'),
  updated_at: new Date('2026-10-03T10:00:00.000Z'),
  ...overrides,
});

describe('KycService', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
  };
  const audit = { record: jest.fn() };
  const providers = {
    getProvider: jest.fn().mockResolvedValue({
      providerConfigurationId: 'provider-config-id',
    }),
  };
  const service = new KycService(
    database as never,
    audit as never,
    providers as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    client.query.mockResolvedValue({ rows: [] });
    database.query.mockResolvedValue({ rows: [] });
    audit.record.mockResolvedValue(undefined);
    providers.getProvider.mockResolvedValue({
      providerConfigurationId: 'provider-config-id',
    });
  });

  it('creates a pending record only for an approved seller application', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'seller-id',
          user_id: 'user-id',
          onboarding_status: 'APPROVED',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'seller-id',
          user_id: 'user-id',
          onboarding_status: 'APPROVED',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pendingRecord()] });

    const result = await service.startForApprovedSeller('user-id');

    expect(result.status).toBe('PENDING');
    expect(result).not.toHaveProperty('providerConfigurationId');
    expect(result).not.toHaveProperty('secretRef');
    expect(result).not.toHaveProperty('rawPayload');
    expect(String(client.query.mock.calls[2]?.[0])).toContain(
      "'PENDING', $3",
    );
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      'seller-id',
      'user-id',
      'provider-config-id',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KYC_VERIFICATION_STARTED',
        resourceType: 'KYC_VERIFICATION',
        afterData: { status: 'PENDING' },
      }),
      client,
    );
  });

  it('does not start KYC for a non-approved seller application', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{
        id: 'seller-id',
        user_id: 'user-id',
        onboarding_status: 'UNDER_REVIEW',
      }],
    });

    await expect(
      service.startForApprovedSeller('user-id'),
    ).rejects.toThrow(ForbiddenException);

    expect(database.query).toHaveBeenCalledTimes(1);
    expect(providers.getProvider).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not change status to VERIFIED when provider communication succeeds without a decision', async () => {
    database.query.mockResolvedValueOnce({ rows: [pendingRecord()] });

    const result = await service.recordVerificationResult('kyc-id', {
      communicationSucceeded: true,
      providerReference: 'external-reference',
    });

    expect(result.status).toBe('PENDING');
    expect(client.query).not.toHaveBeenCalled();
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'FROM kyc_verifications',
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not treat an unapproved seller as KYC VERIFIED', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [pendingRecord()] })
      .mockResolvedValueOnce({ rows: [{ onboarding_status: 'REJECTED' }] });

    await expect(
      service.recordVerificationResult('kyc-id', {
        communicationSucceeded: true,
        providerReference: 'external-reference',
        decision: 'CONFIRMED',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('normalizes a generic provider decision into a platform KYC status', async () => {
    expect(normalizeKycProviderDecision('REVIEW_REQUIRED')).toBe('IN_REVIEW');
    expect(normalizeKycProviderDecision('INFORMATION_REQUIRED')).toBe(
      'MORE_INFORMATION_REQUIRED',
    );
    expect(normalizeKycProviderDecision('CONFIRMED')).toBe('VERIFIED');
  });

  it.each([
    ['PENDING', 'IN_REVIEW'],
    ['IN_REVIEW', 'MORE_INFORMATION_REQUIRED'],
    ['MORE_INFORMATION_REQUIRED', 'IN_REVIEW'],
    ['PENDING', 'REJECTED'],
  ] as const)(
    'applies the explicit normalized transition %s to %s',
    async (previousStatus, nextStatus) => {
      client.query
        .mockResolvedValueOnce({
          rows: [pendingRecord({ status: previousStatus })],
        })
        .mockResolvedValueOnce({
          rows: [pendingRecord({ status: nextStatus })],
        });

      const result = await service.applyNormalizedResult('kyc-id', {
        status: nextStatus,
        source: 'PROVIDER',
        reasonCode: 'NORMALIZED_RESULT',
      });

      expect(result.status).toBe(nextStatus);
      expect(String(client.query.mock.calls[1]?.[0])).toContain(
        'UPDATE kyc_verifications',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          beforeData: { status: previousStatus },
          afterData: {
            status: nextStatus,
            source: 'PROVIDER',
            reasonCode: 'NORMALIZED_RESULT',
          },
        }),
        client,
      );
    },
  );

  it('rejects invalid transitions and does not audit them', async () => {
    client.query.mockResolvedValueOnce({
      rows: [pendingRecord({ status: 'VERIFIED' })],
    });

    await expect(
      service.applyNormalizedResult('kyc-id', {
        status: 'PENDING',
        source: 'PROVIDER',
      }),
    ).rejects.toThrow('Invalid KYC status transition from VERIFIED to PENDING');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects unsafe reason codes in normalized results', async () => {
    await expect(
      service.applyNormalizedResult('kyc-id', {
        status: 'REJECTED',
        source: 'PROVIDER',
        reasonCode: 'sensitive identity information',
      }),
    ).rejects.toThrow('Invalid normalized KYC reason code');

    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('stores provider references only through the internal normalized result path', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [pendingRecord()] })
      .mockResolvedValueOnce({
        rows: [pendingRecord({
          status: 'IN_REVIEW',
          provider_reference: 'opaque-provider-reference',
        })],
      });

    const result = await service.applyNormalizedResult('kyc-id', {
      status: 'IN_REVIEW',
      providerReference: 'opaque-provider-reference',
      source: 'PROVIDER',
    });

    expect(result.providerReference).toBe('opaque-provider-reference');
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'IN_REVIEW',
      'opaque-provider-reference',
      false,
      'kyc-id',
    ]);
  });

  it('audits KYC state changes without persisting credentials or raw provider data', async () => {
    const verifiedAt = new Date('2026-10-03T11:00:00.000Z');
    client.query
      .mockResolvedValueOnce({ rows: [pendingRecord()] })
      .mockResolvedValueOnce({ rows: [{ onboarding_status: 'APPROVED' }] })
      .mockResolvedValueOnce({
        rows: [pendingRecord({
          status: 'VERIFIED',
          provider_reference: 'external-reference',
          verified_at: verifiedAt,
        })],
      });

    const result = await service.recordVerificationResult('kyc-id', {
      communicationSucceeded: true,
      providerReference: 'external-reference',
      decision: 'CONFIRMED',
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.verifiedAt).toBe(verifiedAt);
    expect(String(client.query.mock.calls[2]?.[0])).not.toMatch(
      /secret|credential|raw_payload|response_payload/i,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KYC_VERIFICATION_STATUS_CHANGED',
        resourceType: 'KYC_VERIFICATION',
        resourceId: 'kyc-id',
        beforeData: { status: 'PENDING' },
        afterData: { status: 'VERIFIED', source: 'PROVIDER' },
      }),
      client,
    );
    expect(JSON.stringify(audit.record.mock.calls[0]?.[0])).not.toMatch(
      /secret|credential|rawPayload/i,
    );
  });

  it('returns existing pending verification instead of creating another record', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'seller-id',
          user_id: 'user-id',
          onboarding_status: 'APPROVED',
        }],
      })
      .mockResolvedValueOnce({ rows: [pendingRecord()] });

    const result = await service.startForApprovedSeller('user-id');

    expect(result.status).toBe('PENDING');
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(providers.getProvider).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audits provider resolution failure without logging provider details', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{
        id: 'seller-id',
        user_id: 'user-id',
        onboarding_status: 'APPROVED',
      }],
    }).mockResolvedValueOnce({ rows: [] });
    providers.getProvider.mockRejectedValueOnce(
      new ServiceUnavailableException('provider selection detail'),
    );

    await expect(service.startForApprovedSeller('user-id')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-id',
        action: 'KYC_PROVIDER_RESOLUTION_FAILED',
        resourceType: 'MARKETPLACE_SELLER_APPLICATION',
        resourceId: 'seller-id',
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls[0]?.[0])).not.toContain(
      'provider selection detail',
    );
  });

  it('returns KYC status only for the authenticated user account', async () => {
    database.query.mockResolvedValueOnce({ rows: [pendingRecord()] });

    const result = await service.getForAuthenticatedUser('user-id');

    expect(result.status).toBe('PENDING');
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'WHERE seller.user_id = $1',
    );
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);
  });

  it('does not reveal another user KYC record', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getForAuthenticatedUser('other-user-id'),
    ).rejects.toThrow('KYC verification not found');

    expect(database.query.mock.calls[0]?.[1]).toEqual(['other-user-id']);
  });

  it('rejects provider communication failure without changing KYC state', async () => {
    await expect(
      service.recordSubmissionResult('kyc-id', {
        communicationSucceeded: false,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });
});

describe('KycProviderRouterService', () => {
  it('selects an available adapter through the enabled KYC service configuration', async () => {
    const provider = {
      name: 'configured-adapter',
      submitVerification: jest.fn(),
      getVerificationStatus: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    const registry = {
      findEnabledServiceId: jest.fn().mockResolvedValue('kyc-service-id'),
      findRegistrations: jest.fn().mockResolvedValue([{
        provider: {
          id: 'provider-id',
          name: 'Configured provider',
          adapterKey: 'configured-adapter-key',
          status: 'ACTIVE',
          capabilities: { kyc: true },
        },
        configuration: {
          id: 'provider-config-id',
          enabled: true,
          isPrimary: true,
          isBackup: false,
          priority: 1,
        },
      }]),
    };
    const adapters = {
      resolve: jest.fn().mockReturnValue(provider),
    };
    const router = new KycProviderRouterService(
      registry as never,
      adapters as never,
    );

    const selected = await router.getProvider();

    expect(registry.findEnabledServiceId).toHaveBeenCalledWith('KYC');
    expect(registry.findRegistrations).toHaveBeenCalledWith('kyc-service-id');
    expect(adapters.resolve).toHaveBeenCalledWith('configured-adapter-key');
    expect(selected).toMatchObject({
      providerId: 'provider-id',
      providerConfigurationId: 'provider-config-id',
    });
  });

  it('fails safely when KYC service configuration is disabled', async () => {
    const registry = {
      findEnabledServiceId: jest.fn().mockResolvedValue(null),
      findRegistrations: jest.fn(),
    };
    const adapters = { resolve: jest.fn() };
    const router = new KycProviderRouterService(
      registry as never,
      adapters as never,
    );

    await expect(router.getProvider()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(registry.findRegistrations).not.toHaveBeenCalled();
    expect(adapters.resolve).not.toHaveBeenCalled();
  });

  it('fails safely when no configured provider or adapter is available', async () => {
    const registry = {
      findEnabledServiceId: jest.fn().mockResolvedValue('kyc-service-id'),
      findRegistrations: jest.fn().mockResolvedValue([]),
    };
    const adapters = { resolve: jest.fn() };
    const router = new KycProviderRouterService(
      registry as never,
      adapters as never,
    );

    await expect(router.getProvider()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(adapters.resolve).not.toHaveBeenCalled();
  });
});
