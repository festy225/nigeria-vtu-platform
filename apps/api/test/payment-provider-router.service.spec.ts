import { ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PaymentProviderAdapterResolver } from '../src/modules/providers/adapters/payment-provider-adapter.resolver';
import { MockPaymentProviderAdapter } from '../src/modules/providers/adapters/mock-payment-provider.adapter';
import { PaymentProviderRouterService } from '../src/modules/providers/routing/payment-provider-router.service';
import type { ProviderRegistrationRecord } from '../src/modules/providers/registry/provider-registry.types';

describe('PaymentProviderRouterService', () => {
  const adapter = new MockPaymentProviderAdapter();
  const adapterResolver = new PaymentProviderAdapterResolver(adapter);
  const registry = {
    findEnabledServiceId: jest.fn(),
    findRegistrations: jest.fn(),
  };
  const router = new PaymentProviderRouterService(
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
    } = {},
  ): ProviderRegistrationRecord => ({
    provider: {
      id: 'provider-id',
      name: 'Configured payment provider',
      adapterKey:
        overrides.adapterKey === undefined
          ? adapter.name
          : overrides.adapterKey,
      status: overrides.status ?? 'ACTIVE',
      baseUrl: null,
      capabilities: { payment: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    configuration: {
      id: 'provider-configuration-id',
      providerId: 'provider-id',
      serviceId: overrides.serviceId ?? null,
      priority: 10,
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
    registry.findEnabledServiceId.mockResolvedValue(null);
    registry.findRegistrations.mockResolvedValue([]);
  });

  it('allows the mock adapter in development', async () => {
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

  it('does not select a mock adapter in production', async () => {
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

  it('does not select a mock adapter when the runtime environment is unset', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: null }),
    ]);

    try {
      await expect(router.getProvider()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it('selects a configured production-capable adapter in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const productionAdapter = {
      name: 'CONFIGURED_PRODUCTION_ADAPTER',
      runtimeMode: 'production' as const,
      initializePayment: jest.fn(),
      verifyPayment: jest.fn(),
      verifyWebhook: jest.fn(),
      parseWebhook: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    jest
      .spyOn(adapterResolver, 'resolve')
      .mockReturnValue(productionAdapter);
    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: null, adapterKey: productionAdapter.name }),
    ]);

    try {
      const selected = await router.getProviderRegistration();
      expect(selected.provider).toBe(productionAdapter);
      expect(selected.providerConfigurationId).toBe(
        'provider-configuration-id',
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it('selects an enabled registration and resolves its configured adapter key', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: null }),
    ]);

    const selected = await router.getProviderRegistration();

    expect(selected.provider).toBe(adapter);
    expect(selected.providerId).toBe('provider-id');
    expect(selected.providerConfigurationId).toBe(
      'provider-configuration-id',
    );
    expect(selected.adapterKey).toBe(adapter.name);
    expect(selected.configuration.secretRef).toBe(
      'configured-secret-reference',
    );
    expect(registry.findRegistrations).toHaveBeenCalledWith(undefined);
  });

  it('resolves registrations for the requested enabled service code', async () => {
    registry.findEnabledServiceId.mockResolvedValue('ecommerce-service-id');
    registry.findRegistrations.mockResolvedValue([
      registration({ serviceId: 'ecommerce-service-id' }),
    ]);

    const selected = await router.getProviderRegistration('ECOMMERCE');

    expect(registry.findEnabledServiceId).toHaveBeenCalledWith('ECOMMERCE');
    expect(registry.findRegistrations).toHaveBeenCalledWith(
      'ecommerce-service-id',
    );
    expect(selected.serviceId).toBe('ecommerce-service-id');
  });

  it('does not select disabled configurations or inactive providers', async () => {
    registry.findRegistrations.mockResolvedValue([
      registration({ enabled: false }),
      registration({ status: 'DISABLED' }),
    ]);

    await expect(router.getProviderRegistration()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails safely when there is no eligible configured provider', async () => {
    registry.findRegistrations.mockResolvedValue([]);

    await expect(router.getProvider()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails safely when the requested service is not enabled', async () => {
    registry.findEnabledServiceId.mockResolvedValue(null);

    await expect(
      router.getProviderRegistration('ECOMMERCE'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(registry.findRegistrations).not.toHaveBeenCalled();
  });

  it('fails safely for missing or unregistered configured adapter keys', async () => {
    registry.findRegistrations
      .mockResolvedValueOnce([registration({ adapterKey: null })])
      .mockResolvedValueOnce([registration({ adapterKey: 'UNREGISTERED' })]);

    await expect(router.getProviderRegistration()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(router.getProviderRegistration()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('resolves the same adapter by its stored configuration identity', async () => {
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

  it('applies marketplace checkout migration after marketplace carts', () => {
    const runner = readFileSync(
      resolve(__dirname, '../scripts/migrate.mjs'),
      'utf8',
    );
    const cartIndex = runner.indexOf("'0031_marketplace_carts.sql'");
    const checkoutIndex = runner.indexOf(
      "'0032_marketplace_checkout_reservations.sql'",
    );

    expect(cartIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeGreaterThan(cartIndex);
  });
});
