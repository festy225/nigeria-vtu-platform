import { ServiceUnavailableException } from '@nestjs/common';
import { LogisticsProviderAdapterResolver } from '../src/modules/providers/adapters/logistics-provider-adapter.resolver';
import { MockLogisticsProviderAdapter } from '../src/modules/providers/adapters/mock-logistics-provider.adapter';
import { LogisticsProviderRouterService } from '../src/modules/providers/routing/logistics-provider-router.service';
import type { ProviderRegistrationRecord } from '../src/modules/providers/registry/provider-registry.types';

describe('LogisticsProviderRouterService', () => {
  const adapter = new MockLogisticsProviderAdapter();
  const adapterResolver = new LogisticsProviderAdapterResolver(adapter);
  const registry = {
    findRegistrations: jest.fn(),
  };

  const router = new LogisticsProviderRouterService(
    registry as never,
    adapterResolver,
  );

  const registration = (
    overrides: {
      enabled?: boolean;
      isPrimary?: boolean;
      isBackup?: boolean;
      status?: 'ACTIVE' | 'DISABLED';
      adapterKey?: string | null;
      serviceId?: string | null;
      logistics?: boolean;
      priority?: number;
    } = {},
  ): ProviderRegistrationRecord => ({
    provider: {
      id: 'provider-id',
      name: 'Configured logistics provider',
      adapterKey:
        overrides.adapterKey === undefined
          ? adapter.name
          : overrides.adapterKey,
      status: overrides.status ?? 'ACTIVE',
      baseUrl: null,
      capabilities: {
        logistics: overrides.logistics ?? true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    configuration: {
      id: 'provider-configuration-id',
      providerId: 'provider-id',
      serviceId: overrides.serviceId ?? null,
      priority: overrides.priority ?? 10,
      isPrimary: overrides.isPrimary ?? true,
      isBackup: overrides.isBackup ?? false,
      enabled: overrides.enabled ?? true,
      secretRef: 'configured-secret-reference',
      config: { configuredOption: 'value' },
      updatedAt: new Date(),
    },
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    registry.findRegistrations.mockResolvedValue([]);
  });

  it('selects an enabled primary logistics provider in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: null }),
    ]);

    try {
      await expect(router.getProvider()).resolves.toBe(adapter);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it('does not select a mock logistics adapter in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: null }),
    ]);

    try {
      await expect(router.getProvider()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it('does not select providers without logistics capability', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ logistics: false }),
    ]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not select disabled configurations or inactive providers', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ enabled: false }),
      registration({ status: 'DISABLED' }),
    ]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('requires a primary provider with no VTU service binding', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ isPrimary: false }),
      registration({ serviceId: 'some-service-id' }),
    ]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('selects the highest-priority eligible logistics provider', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ priority: 50 }),
      {
        ...registration({ priority: 10 }),
        provider: {
          ...registration({ priority: 10 }).provider,
          id: 'higher-priority-provider',
          adapterKey: adapter.name,
        },
        configuration: {
          ...registration({ priority: 10 }).configuration,
          id: 'higher-priority-configuration',
          providerId: 'higher-priority-provider',
        },
      },
    ]);

    const selected = await router.getProviderRegistration();

    expect(selected.providerId).toBe('higher-priority-provider');
    expect(selected.configuration.priority).toBe(10);
  });

  it('fails safely when there is no eligible configured provider', async () => {
    registry.findRegistrations.mockResolvedValue([]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails safely for missing or unregistered adapter keys', async () => {
    registry.findRegistrations
      .mockResolvedValueOnce([registration({ adapterKey: null })])
      .mockResolvedValueOnce([registration({ adapterKey: 'UNREGISTERED' })]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('resolves the adapter by stored configuration identity', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ enabled: false }),
    ]);

    const selected = await router.getProviderRegistrationByConfigurationId(
      'provider-configuration-id',
    );

    expect(selected.provider).toBe(adapter);
    expect(selected.providerConfigurationId).toBe(
      'provider-configuration-id',
    );
  });

  it('rejects an unknown configuration identity', async () => {
    registry.findRegistrations.mockResolvedValue([]);

    await expect(
      router.getProviderRegistrationByConfigurationId(
        'unknown-provider-configuration',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
