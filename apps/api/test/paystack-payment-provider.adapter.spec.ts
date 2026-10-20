import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PaystackPaymentProviderAdapter } from '../src/modules/providers/adapters/paystack-payment-provider.adapter';
import type {
  LookupPaymentRequest,
  ProviderExecutionConfiguration,
} from '../src/modules/providers/interfaces/payment-provider.interface';

describe('PaystackPaymentProviderAdapter', () => {
  const adapter = new PaystackPaymentProviderAdapter();
  const secret = 'sk_test_CHIMZOSandbox123';
  const configuration: ProviderExecutionConfiguration = {
    id: 'paystack-test-config',
    config: {},
    credentials: secret,
  };

  const lookupRequest: LookupPaymentRequest = {
    paymentReference: 'CHIMZO-PAY-001',
    amountMinor: 250000,
    currency: 'NGN',
    providerConfiguration: configuration,
  };

  const successfulPayload = {
    status: true,
    data: {
      id: 123456,
      reference: 'CHIMZO-PAY-001',
      amount: 250000,
      currency: 'NGN',
      status: 'success',
    },
  };

  let fetchSpy: jest.SpyInstance;

  function mockPaystackResponse(payload: unknown, ok = true): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok,
      json: async () => payload,
    } as Response);
  }

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('identifies itself as a test-only Paystack adapter', () => {
    expect(adapter.name).toBe('PAYSTACK');
    expect(adapter.runtimeMode).toBe('test-only');
  });

  it('rejects initialization without a valid sandbox secret', async () => {
    await expect(
      adapter.initializePayment({
        paymentReference: 'CHIMZO-PAY-001',
        amountMinor: 250000,
        currency: 'NGN',
        customerEmail: 'customer@example.com',
        callbackUrl: 'https://example.com/callback',
        metadata: {},
        providerConfiguration: {
          ...configuration,
          credentials: 'sk_live_not_allowed',
        },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('looks up a transaction using the configured sandbox credentials', async () => {
    mockPaystackResponse(successfulPayload);

    const result = await adapter.lookupPayment(lookupRequest);

    expect(result.status).toBe('FOUND');
    expect(result.transaction).toMatchObject({
      providerName: 'PAYSTACK',
      paymentReference: 'CHIMZO-PAY-001',
      providerReference: '123456',
      amountMinor: 250000,
      currency: 'NGN',
      status: 'SUCCESS',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/verify/CHIMZO-PAY-001',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${secret}`,
        }),
      }),
    );
  });

  it.each([
    ['payment reference', { reference: 'OTHER-REFERENCE' }],
    ['amount', { amount: 250001 }],
    ['currency', { currency: 'USD' }],
    ['transaction ID', { id: undefined }],
  ])('fails closed when the Paystack %s does not match', async (_field, override) => {
    const payload = {
      status: true,
      data: {
        ...successfulPayload.data,
        ...override,
      },
    };
    mockPaystackResponse(payload);

    const result = await adapter.lookupPayment(lookupRequest);

    expect(result).toEqual({ status: 'UNKNOWN' });
  });

  it('returns UNKNOWN when credentials are missing', async () => {
    const result = await adapter.lookupPayment({
      ...lookupRequest,
      providerConfiguration: undefined,
    });

    expect(result).toEqual({ status: 'UNKNOWN' });
  });

  it('returns UNKNOWN when Paystack reports an unsuccessful API response', async () => {
    mockPaystackResponse({ status: false, data: {} });

    const result = await adapter.lookupPayment(lookupRequest);

    expect(result).toEqual({ status: 'UNKNOWN' });
  });

  it('forwards provider configuration through verifyPayment', async () => {
    mockPaystackResponse(successfulPayload);

    const result = await adapter.verifyPayment({
      paymentReference: 'CHIMZO-PAY-001',
      providerReference: '123456',
      amountMinor: 250000,
      currency: 'NGN',
      providerConfiguration: configuration,
    });

    expect(result).toMatchObject({
      providerName: 'PAYSTACK',
      providerReference: '123456',
      status: 'SUCCESS',
      amountMinor: 250000,
      currency: 'NGN',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/transaction/verify/CHIMZO-PAY-001'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${secret}`,
        }),
      }),
    );
  });

  it('accepts a webhook with a valid HMAC SHA-512 signature and original raw body', async () => {
    const rawBody = Buffer.from(
      '{"event":"charge.success","data":{"reference":"CHIMZO-PAY-001"}}',
    );
    const signature = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    const result = await adapter.verifyWebhook({
      rawPayload: JSON.parse(rawBody.toString('utf8')),
      rawBody,
      headers: { 'x-paystack-signature': signature },
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(true);
  });

  it('rejects an invalid webhook signature', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      rawBody: Buffer.from('{"event":"charge.success"}'),
      headers: { 'x-paystack-signature': 'a'.repeat(128) },
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(false);
  });

  it('rejects a webhook when the original raw body is missing', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      headers: { 'x-paystack-signature': 'a'.repeat(128) },
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(false);
  });

  it('rejects a webhook when the sandbox secret is invalid', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      rawBody: Buffer.from('{}'),
      headers: { 'x-paystack-signature': 'a'.repeat(128) },
      providerConfiguration: {
        ...configuration,
        credentials: 'sk_live_not_allowed',
      },
    });

    expect(result.valid).toBe(false);
  });

  it.each(['EUR', undefined])(
    'rejects webhooks with missing or unsupported currency (%s)',
    (currency) => {
      expect(() => adapter.parseWebhook({
        event: 'charge.success',
        data: {
          id: 123456,
          reference: 'CHIMZO-PAY-001',
          amount: 250000,
          status: 'success',
          currency,
        },
      })).toThrow('Unsupported Paystack webhook currency');
    },
  );
});
