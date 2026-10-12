import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../src/common/auth/auth.decorators';
import {
  ProviderManagementController,
  redactProviderConfiguration,
} from '../src/modules/providers/management/provider-management.controller';

describe('ProviderManagementController configuration responses', () => {
  const registry = {
    createProviderConfiguration: jest.fn(),
    findConfigurations: jest.fn(),
  };

  let controller: ProviderManagementController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProviderManagementController(registry as never);
  });

  it('redacts nested credential-like keys while preserving ordinary settings', () => {
    const input = {
      endpoint: 'https://provider.example',
      timeoutMs: 5000,
      apiKey: 'secret-api-key',
      nested: {
        client_secret: 'client-secret-value',
        Authorization: 'Bearer private-value',
        accessToken: 'access-token-value',
        privateKey: 'private-key-value',
        region: 'NG',
      },
      routes: [
        { name: 'primary', signature: 'signature-value' },
      ],
    };

    const output = redactProviderConfiguration(input);

    expect(output).toEqual({
      endpoint: 'https://provider.example',
      timeoutMs: 5000,
      apiKey: '[REDACTED]',
      nested: {
        client_secret: '[REDACTED]',
        Authorization: '[REDACTED]',
        accessToken: '[REDACTED]',
        privateKey: '[REDACTED]',
        region: 'NG',
      },
      routes: [
        { name: 'primary', signature: '[REDACTED]' },
      ],
    });

    // Redaction must not mutate the source object.
    expect(input.apiKey).toBe('secret-api-key');
    expect(input.nested.client_secret).toBe('client-secret-value');
  });

  it('redacts credentials in the create-configuration response and omits secretRef', async () => {
    registry.createProviderConfiguration.mockResolvedValue({
      id: 'configuration-id',
      providerId: 'provider-id',
      serviceId: null,
      priority: 10,
      isPrimary: true,
      isBackup: false,
      enabled: true,
      secretRef: 'env:PAYMENT_PROVIDER_SECRET',
      config: {
        apiToken: 'do-not-return',
        timeoutMs: 3000,
      },
      updatedAt: new Date('2026-10-12T00:00:00.000Z'),
    });

    const result = await controller.createConfiguration(
      {
        providerId: 'provider-id',
        priority: 10,
        isPrimary: true,
        isBackup: false,
        enabled: true,
        secretRef: 'env:PAYMENT_PROVIDER_SECRET',
        config: { apiToken: 'do-not-return', timeoutMs: 3000 },
      } as never,
      {
        user: {
          id: 'super-admin-id',
          email: null,
          phone: null,
          roles: ['SUPER_ADMIN'],
        },
      } as never,
    );

    expect(result.data.config).toEqual({
      apiToken: '[REDACTED]',
      timeoutMs: 3000,
    });
    expect(result.data).not.toHaveProperty('secretRef');
  });

  it('redacts credentials in the configuration-list response and omits secretRef', async () => {
    registry.findConfigurations.mockResolvedValue([
      {
        id: 'configuration-id',
        providerId: 'provider-id',
        serviceId: null,
        priority: 10,
        isPrimary: true,
        isBackup: false,
        enabled: true,
        secretRef: 'env:PAYMENT_PROVIDER_SECRET',
        config: {
          region: 'NG',
          nested: { privateKey: 'do-not-return' },
        },
        updatedAt: new Date('2026-10-12T00:00:00.000Z'),
      },
    ]);

    const result = await controller.findConfigurations('provider-id');

    expect(result.data[0].config).toEqual({
      region: 'NG',
      nested: { privateKey: '[REDACTED]' },
    });
    expect(result.data[0]).not.toHaveProperty('secretRef');
  });

  it('restricts configuration creation to SUPER_ADMIN', () => {
    const roles = new Reflector().get(
      ROLES_KEY,
      ProviderManagementController.prototype.createConfiguration,
    );

    expect(roles).toEqual(['SUPER_ADMIN']);
  });

  it('redacts credentials embedded in URLs while preserving ordinary parameters', () => {
    const input = {
      endpoint:
        'https://service.example/path?region=NG&api_key=private123&mode=test',
      authenticatedEndpoint:
        'https://provider-user:provider-password@service.example/api',
      tokenEndpoint:
        'https://service.example/oauth?access_token=private-token#section',
      ordinaryUrl:
        'https://service.example/path?region=NG&mode=test',
    };

    expect(redactProviderConfiguration(input)).toEqual({
      endpoint:
        'https://service.example/path?region=NG&api_key=[REDACTED]&mode=test',
      authenticatedEndpoint:
        'https://[REDACTED]@service.example/api',
      tokenEndpoint:
        'https://service.example/oauth?access_token=[REDACTED]#section',
      ordinaryUrl:
        'https://service.example/path?region=NG&mode=test',
    });

    // Sanitization must not mutate the original configuration.
    expect(input.authenticatedEndpoint).toContain('provider-password');
    expect(input.endpoint).toContain('private123');
  });

  it('redacts sensitive query parameters regardless of their position', () => {
    expect(
      redactProviderConfiguration(
        'https://service.example/path?client_secret=secret-value&region=NG',
      ),
    ).toBe(
      'https://service.example/path?client_secret=[REDACTED]&region=NG',
    );

    expect(
      redactProviderConfiguration(
        'https://service.example/path?region=NG&signature=private-signature',
      ),
    ).toBe(
      'https://service.example/path?region=NG&signature=[REDACTED]',
    );
  });

});
