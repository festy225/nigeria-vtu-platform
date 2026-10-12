import { validate } from 'class-validator';
import { CreateProviderConfigurationDto } from '../src/modules/providers/dto/create-provider-configuration.dto';

describe('CreateProviderConfigurationDto secretRef validation', () => {
  const validPayload = {
    providerId: '550e8400-e29b-41d4-a716-446655440000',
    priority: 10,
    isPrimary: true,
    isBackup: false,
    enabled: true,
    secretRef: 'env:CHIMZO_PAYMENT_PROVIDER_SECRET',
  };

  it('accepts a supported environment-variable reference', async () => {
    const dto = Object.assign(
      new CreateProviderConfigurationDto(),
      validPayload,
    );

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it.each([
    'plain-text-secret',
    'env:lowercase_name',
    'env:NAME-WITH-DASH',
    'env:',
    '',
    'env:VALID_NAME;unexpected',
  ])('rejects an unsupported reference: %s', async (secretRef) => {
    const dto = Object.assign(
      new CreateProviderConfigurationDto(),
      { ...validPayload, secretRef },
    );

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'secretRef')).toBe(true);
  });
});
