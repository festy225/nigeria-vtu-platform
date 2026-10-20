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
    updateProviderConfiguration: jest.fn(),
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

  it('restricts configuration updates to SUPER_ADMIN', () => {
    const roles = new Reflector().get(
      ROLES_KEY,
      ProviderManagementController.prototype.updateConfiguration,
    );

    expect(roles).toEqual(['SUPER_ADMIN']);
  });

  it('redacts credentials in the update response and omits secretRef', async () => {
    const configurationId = '660e8400-e29b-41d4-a716-446655440000';
    const actorId = 'super-admin-id';
    const dto = {
      priority: 2,
      isPrimary: true,
      isBackup: false,
      enabled: true,
      config: {
        region: 'NG',
        apiToken: 'must-not-be-returned',
        timeoutMs: 3000,
      },
    };

    registry.updateProviderConfiguration.mockResolvedValue({
      id: configurationId,
      providerId: 'provider-id',
      serviceId: null,
      priority: 2,
      isPrimary: true,
      isBackup: false,
      enabled: true,
      secretRef: 'env:PAYMENT_PROVIDER_SECRET',
      config: {
        region: 'NG',
        apiToken: 'must-not-be-returned',
        timeoutMs: 3000,
      },
      updatedAt: new Date('2026-10-15T00:00:00.000Z'),
    });

    const result = await controller.updateConfiguration(
      configurationId,
      dto as never,
      {
        user: {
          id: actorId,
          email: null,
          phone: null,
          roles: ['SUPER_ADMIN'],
        },
      } as never,
    );

    expect(registry.updateProviderConfiguration).toHaveBeenCalledWith(
      configurationId,
      dto,
      actorId,
    );

    expect(result.data.config).toEqual({
      region: 'NG',
      apiToken: '[REDACTED]',
      timeoutMs: 3000,
    });
    expect(result.data).not.toHaveProperty('secretRef');
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned');
    expect(JSON.stringify(result)).not.toContain('PAYMENT_PROVIDER_SECRET');
  });

  it('rejects an update when the authenticated user is missing', async () => {
    await expect(
      controller.updateConfiguration(
        '660e8400-e29b-41d4-a716-446655440000',
        { priority: 2 } as never,
        {} as never,
      ),
    ).rejects.toThrow('Authentication required');

    expect(registry.updateProviderConfiguration).not.toHaveBeenCalled();
  });
});
