import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSecretResolver } from '../src/modules/providers/security/provider-secret-resolver.service';

describe('ProviderSecretResolver', () => {
  const secretValue = 'test-only-secret-value';
  let config: { get: jest.Mock };
  let resolver: ProviderSecretResolver;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    };
    resolver = new ProviderSecretResolver(
      config as unknown as ConfigService,
    );
  });

  it('resolves a supported environment-variable reference', () => {
    config.get.mockReturnValue(secretValue);

    expect(resolver.resolve('env:CHIMZO_TEST_PAYMENT_SECRET')).toBe(
      secretValue,
    );
    expect(config.get).toHaveBeenCalledWith(
      'CHIMZO_TEST_PAYMENT_SECRET',
    );
  });

  it('rejects an unsupported reference format', () => {
    expect(() => resolver.resolve('plain-text-secret')).toThrow(
      ServiceUnavailableException,
    );
    expect(config.get).not.toHaveBeenCalled();
  });

  it('rejects environment names that do not follow the supported format', () => {
    expect(() => resolver.resolve('env:lowercase_name')).toThrow(
      ServiceUnavailableException,
    );
    expect(config.get).not.toHaveBeenCalled();
  });

  it('rejects a missing secret', () => {
    config.get.mockReturnValue(undefined);

    expect(() => resolver.resolve('env:CHIMZO_TEST_PAYMENT_SECRET')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects an empty or whitespace-only secret', () => {
    config.get.mockReturnValue('   ');

    expect(() => resolver.resolve('env:CHIMZO_TEST_PAYMENT_SECRET')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not include the secret value in a missing-secret error', () => {
    config.get.mockReturnValue(undefined);

    let errorMessage = '';

    try {
      resolver.resolve('env:CHIMZO_TEST_PAYMENT_SECRET');
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).not.toContain(secretValue);
    expect(errorMessage).toBe(
      'Provider credentials are not configured',
    );
  });
});
