import { ServiceUnavailableException } from '@nestjs/common';
import { FlutterwavePaymentProviderAdapter } from '../src/modules/providers/adapters/flutterwave-payment-provider.adapter';
import type {
  LookupPaymentRequest,
  ProviderExecutionConfiguration,
  VerifyPaymentRequest,
} from '../src/modules/providers/interfaces/payment-provider.interface';

describe('FlutterwavePaymentProviderAdapter', () => {
  const adapter = new FlutterwavePaymentProviderAdapter();
  const secret = 'FLWSECK_TEST_CHIMZO';
  const webhookHash = 'CHIMZO_WEBHOOK_TEST_HASH';

  const configuration: ProviderExecutionConfiguration = {
    id: 'flutterwave-test-config',
    config: { resolvedWebhookSecret: webhookHash },
    credentials: secret,
  };

  const lookupRequest: LookupPaymentRequest = {
    paymentReference: 'CHIMZO-PAY-001',
    amountMinor: 250000,
    currency: 'NGN',
    providerConfiguration: configuration,
  };

  const verifyRequest: VerifyPaymentRequest = {
    paymentReference: 'CHIMZO-PAY-001',
    providerReference: '123456',
    amountMinor: 250000,
    currency: 'NGN',
    providerConfiguration: configuration,
  };

  let fetchSpy: jest.SpyInstance;

  function mockResponse(payload: unknown, ok = true): void {
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

  it('identifies itself as the production Flutterwave adapter', () => {
    expect(adapter.name).toBe('FLUTTERWAVE');
    expect(adapter.runtimeMode).toBe('production');
  });

  it('initializes checkout with the configured credentials', async () => {
    mockResponse({
      status: 'success',
      data: { link: 'https://checkout.flutterwave.com/test-session' },
    });

    const result = await adapter.initializePayment({
      paymentReference: 'CHIMZO-PAY-001',
      amountMinor: 250000,
      currency: 'NGN',
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://chimzo.example/callback',
      metadata: { purpose: 'BUSINESS_MEMBERSHIP' },
      providerConfiguration: configuration,
    });

    expect(result).toMatchObject({
      providerName: 'FLUTTERWAVE',
      providerReference: 'CHIMZO-PAY-001',
      checkoutUrl: 'https://checkout.flutterwave.com/test-session',
      status: 'PENDING',
    });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body).toMatchObject({
      tx_ref: 'CHIMZO-PAY-001',
      amount: 2500,
      currency: 'NGN',
      redirect_url: 'https://chimzo.example/callback',
      customer: { email: 'customer@example.com' },
    });
    expect(options.headers.Authorization).toBe(`Bearer ${secret}`);
  });

  it('rejects initialization when credentials are missing', async () => {
    await expect(adapter.initializePayment({
      paymentReference: 'CHIMZO-PAY-001',
      amountMinor: 250000,
      currency: 'NGN',
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://chimzo.example/callback',
      metadata: {},
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects invalid payment amounts before calling Flutterwave', async () => {
    fetchSpy.mockClear();

    await expect(adapter.initializePayment({
      paymentReference: 'CHIMZO-PAY-001',
      amountMinor: 0,
      currency: 'NGN',
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://chimzo.example/callback',
      metadata: {},
      providerConfiguration: configuration,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a checkout response without a payment link', async () => {
    mockResponse({ status: 'success', data: {} });

    await expect(adapter.initializePayment({
      paymentReference: 'CHIMZO-PAY-001',
      amountMinor: 250000,
      currency: 'NGN',
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://chimzo.example/callback',
      metadata: {},
      providerConfiguration: configuration,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('verifies a successful transaction against reference, amount and currency', async () => {
    mockResponse({
      status: 'success',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'NGN',
        status: 'successful',
      },
    });

    const result = await adapter.verifyPayment(verifyRequest);

    expect(result).toMatchObject({
      providerName: 'FLUTTERWAVE',
      providerReference: '123456',
      status: 'SUCCESS',
      amountMinor: 250000,
      currency: 'NGN',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.flutterwave.com/v3/transactions/123456/verify',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${secret}`,
        }),
      }),
    );
  });

  it.each([
    ['transaction reference', { tx_ref: 'OTHER-REFERENCE' }],
    ['amount', { amount: 2501 }],
    ['currency', { currency: 'USD' }],
  ])('rejects verification with a mismatched %s', async (_field, override) => {
    mockResponse({
      status: 'success',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'NGN',
        status: 'successful',
        ...override,
      },
    });

    await expect(adapter.verifyPayment(verifyRequest))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('looks up a transaction using its payment reference', async () => {
    mockResponse({
      status: 'success',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'NGN',
        status: 'successful',
      },
    });

    const result = await adapter.lookupPayment(lookupRequest);

    expect(result.status).toBe('FOUND');
    expect(result.transaction).toMatchObject({
      providerName: 'FLUTTERWAVE',
      paymentReference: 'CHIMZO-PAY-001',
      providerReference: '123456',
      amountMinor: 250000,
      currency: 'NGN',
      status: 'SUCCESS',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/transactions/verify_by_reference?tx_ref=CHIMZO-PAY-001'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${secret}`,
        }),
      }),
    );
  });

  it('returns UNKNOWN when lookup credentials are missing', async () => {
    const result = await adapter.lookupPayment({
      ...lookupRequest,
      providerConfiguration: undefined,
    });

    expect(result).toEqual({ status: 'UNKNOWN' });
  });

  it('fails closed when lookup amount or currency does not match', async () => {
    mockResponse({
      status: 'success',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2501,
        currency: 'NGN',
        status: 'successful',
      },
    });

    expect(await adapter.lookupPayment(lookupRequest))
      .toEqual({ status: 'UNKNOWN' });
  });

  it('accepts a valid webhook hash with a case-insensitive header name', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: { event: 'charge.completed' },
      headers: { 'Verif-Hash': webhookHash },
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(true);
  });

  it('accepts a single-value webhook header array', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      headers: { 'VERIF-HASH': [webhookHash] },
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(true);
  });

  it.each([
    ['incorrect hash', { 'verif-hash': 'incorrect-hash' }],
    ['missing hash', {}],
    ['multiple header values', { 'verif-hash': [webhookHash, 'another'] }],
  ])('rejects webhook with %s', async (_case, headers) => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      headers,
      providerConfiguration: configuration,
    });

    expect(result.valid).toBe(false);
  });

  it('rejects webhook when the configured hash is missing', async () => {
    const result = await adapter.verifyWebhook({
      rawPayload: {},
      headers: { 'verif-hash': webhookHash },
      providerConfiguration: {
        ...configuration,
        config: {},
      },
    });

    expect(result.valid).toBe(false);
  });

  it('parses a successful Flutterwave webhook', () => {
    const payload = {
      event: 'charge.completed',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'NGN',
        status: 'successful',
        meta: { paymentReference: 'CHIMZO-PAY-001', attempt: 1 },
      },
    };

    expect(adapter.parseWebhook(payload)).toMatchObject({
      providerName: 'FLUTTERWAVE',
      eventType: 'charge.completed',
      paymentReference: 'CHIMZO-PAY-001',
      providerReference: '123456',
      amountMinor: 250000,
      currency: 'NGN',
      status: 'SUCCESS',
      metadata: { paymentReference: 'CHIMZO-PAY-001', attempt: 1 },
    });
  });

  it.each([
    ['failed', 'FAILED'],
    ['cancelled', 'FAILED'],
    ['pending', 'PENDING'],
  ])('maps Flutterwave status %s correctly', async (providerStatus, expected) => {
    mockResponse({
      status: 'success',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'NGN',
        status: providerStatus,
      },
    });

    const result = await adapter.verifyPayment(verifyRequest);

    expect(result.status).toBe(expected);
  });

  it('rejects webhooks with unsupported currency', () => {
    expect(() => adapter.parseWebhook({
      event: 'charge.completed',
      data: {
        id: 123456,
        tx_ref: 'CHIMZO-PAY-001',
        amount: 2500,
        currency: 'EUR',
        status: 'successful',
      },
    })).toThrow('Unsupported Flutterwave webhook currency');
  });

  it('returns PENDING when lookup cannot find a transaction during verification', async () => {
    mockResponse({ status: 'success', data: [] });

    const result = await adapter.verifyPayment({
      ...verifyRequest,
      providerReference: 'CHIMZO-PAY-001',
    });

    expect(result.status).toBe('PENDING');
    expect(result.providerReference).toBe('CHIMZO-PAY-001');
  });
});



