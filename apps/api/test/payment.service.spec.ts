import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import type {
  InitializePaymentRequest,
  InitializePaymentResponse,
} from '../src/modules/providers/interfaces/payment-provider.interface';
import { PaymentService } from '../src/modules/payments/payment.service';
import { PaymentController } from '../src/modules/payments/payment.controller';
import { CreateMembershipPaymentDto } from '../src/modules/payments/dto/create-membership-payment.dto';

type QueryCall = [query: string, values?: unknown[]];
type QueryResultMock = { rows: Array<Record<string, unknown>> };
type QueryFunction = (query: string, values?: unknown[]) => Promise<QueryResultMock>;

describe('PaymentService membership payments', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const db = {
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const provider = {
    name: 'configured-provider',
    initializePayment: jest.fn<
      Promise<InitializePaymentResponse>,
      [InitializePaymentRequest]
    >(),
    verifyPayment: jest.fn(),
    verifyWebhook: jest.fn(),
    parseWebhook: jest.fn(),
    isAvailable: jest.fn(),
    lookupPayment: jest.fn(),
  };
  const providers = {
    getProvider: jest.fn().mockResolvedValue(provider),
    getProviderRegistration: jest.fn(),
    getProviderRegistrationByConfigurationId: jest.fn(),
  };
  const config = { get: jest.fn() };
  const providerSecretResolver = {
    resolve: jest.fn().mockReturnValue('resolved-test-secret'),
  };
  const walletService = { creditWithClient: jest.fn() };
  const marketplaceOrderService = {
  consumeInventoryReservation: jest.fn(),
  releaseInventoryReservation: jest.fn(),
  placePendingPaymentOrder: jest.fn(),
  cancelPendingPaymentOrder: jest.fn(),
};

const marketplaceCartService = {
  finalizePendingOrderCart: jest.fn(),
  releasePendingOrderCart: jest.fn(),
};
  const service = new PaymentService(
    db as never,
    providers as never,
    config as never,
    walletService as never,
    marketplaceOrderService as never,
    marketplaceCartService as never,
    providerSecretResolver as never,
  );

  const validRequest = {
    membershipProgramId: 'program-id',
    billingPeriod: 'ANNUAL' as const,
    idempotencyKey: 'membership-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // clearAllMocks() preserves queued mockResolvedValueOnce responses.
    // Reset stateful query/provider mocks to prevent cross-test leakage.
    client.query.mockReset();
    db.query.mockReset();
    provider.lookupPayment.mockReset();
    provider.verifyWebhook.mockReset();
    provider.parseWebhook.mockReset();

    providerSecretResolver.resolve.mockReturnValue('resolved-test-secret');
    db.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    providers.getProvider.mockResolvedValue(provider);
    providers.getProviderRegistrationByConfigurationId.mockResolvedValue({
      provider,
      providerId: 'provider-id',
      providerConfigurationId: 'provider-configuration-id',
      adapterKey: provider.name,
      serviceId: null,
      priority: 10,
      isPrimary: true,
      isBackup: false,
      configuration: {
        id: 'provider-configuration-id',
        config: { configuredValue: 'value' },
        secretRef: 'configured-secret-reference',
      },
      providerRecord: { id: 'provider-id' },
    });
    provider.initializePayment.mockResolvedValue({
      providerName: provider.name,
      providerReference: 'provider-ref',
      checkoutUrl: 'https://provider.invalid/checkout',
      status: 'PENDING',
      rawPayload: {},
    });
    client.query.mockResolvedValue({ rows: [] });
    db.query.mockResolvedValue({ rows: [] });

    provider.verifyWebhook.mockResolvedValue({
      valid: true,
      rawPayload: {},
    });
    provider.parseWebhook.mockReturnValue({
      providerName: provider.name,
      eventId: 'event-id',
      eventType: 'payment.success',
      paymentReference: 'PAY-membership',
      providerReference: 'provider-ref',
      amountMinor: 12000,
      currency: 'USD',
      status: 'SUCCESS',
      metadata: {},
      rawPayload: { eventId: 'event-id' },
    });

    providers.getProviderRegistration.mockResolvedValue({
      provider,
      providerId: 'provider-id',
      providerConfigurationId: 'provider-configuration-id',
      adapterKey: provider.name,
      serviceId: 'ecommerce-service-id',
      priority: 10,
      isPrimary: true,
      isBackup: false,
      configuration: { id: 'provider-configuration-id' },
      providerRecord: { id: 'provider-id' },
    });
  });

  it('creates a marketplace payment from the owned pending order and pins the configured provider', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'payment-id' }] });
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-reference',
          payment_user_id: 'user-id',
          payment_amount_minor: '2750',
          payment_currency: 'NGN',
          payment_state: 'PENDING',
          payment_purpose: 'MARKETPLACE_ORDER',
          payment_provider_configuration_id: 'provider-configuration-id',
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
        }],
      });

    const result = await service.createMarketplacePaymentIntent(
      'user-id',
      'user@example.test',
      { orderId: 'marketplace-order-id' },
    );

    expect(providers.getProviderRegistration).toHaveBeenCalledWith('ECOMMERCE');
    expect(provider.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 2750,
        currency: 'NGN',
        metadata: expect.objectContaining({
          marketplaceOrderId: 'marketplace-order-id',
          paymentPurpose: 'MARKETPLACE_ORDER',
        }),
      }),
    );
    const insert = (client.query.mock.calls as QueryCall[]).find(([query]) =>
      String(query).includes('INSERT INTO payments'),
    );
    expect(insert?.[0]).toContain('marketplace_order_id');
    expect(insert?.[0]).toContain('provider_configuration_id');
    expect(insert?.[0]).not.toMatch(/\border_id\b/);
    expect(insert?.[0]).toContain("'MARKETPLACE_ORDER'");
    expect(insert?.[1]).toEqual(
      expect.arrayContaining([
        'user-id',
        '2750',
        'NGN',
        'marketplace-order-marketplace-order-id',
        'marketplace-order-id',
        'provider-configuration-id',
      ]),
    );
    expect(result.payment).toMatchObject({
      purpose: 'MARKETPLACE_ORDER',
      amountMinor: 2750,
      currency: 'NGN',
      state: 'PENDING',
    });
    expect(result.checkout).toEqual({
      url: 'https://provider.invalid/checkout',
    });
  });

  it('preserves marketplace payment initialization state after an ambiguous provider timeout', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-reference',
          payment_user_id: 'user-id',
          payment_amount_minor: '2750',
          payment_currency: 'NGN',
          payment_state: 'PENDING',
          payment_purpose: 'MARKETPLACE_ORDER',
          payment_provider_configuration_id: 'provider-configuration-id',
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
        }],
      });

    provider.initializePayment.mockRejectedValueOnce(
      new Error('socket timeout after request was sent'),
    );

    await expect(
      service.createMarketplacePaymentIntent(
        'user-id',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(BadGatewayException);

    expect(provider.initializePayment).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();

    const transactionQueries = client.query.mock.calls
      .map(([sql]) => String(sql));

    expect(
      transactionQueries.some((sql) => /provider_status\s*=\s*'FAILED'/i.test(sql)),
    ).toBe(false);
  });

  it('does not reveal or pay an order belonging to another customer', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createMarketplacePaymentIntent(
        'different-user',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(providers.getProviderRegistration).not.toHaveBeenCalled();
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('rejects marketplace orders not awaiting payment', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'marketplace-order-id',
        customer_id: 'user-id',
        status: 'CANCELLED',
        total_minor: '2750',
        currency: 'NGN',
      }],
    });

    await expect(
      service.createMarketplacePaymentIntent(
        'user-id',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(ConflictException);

    expect(providers.getProviderRegistration).not.toHaveBeenCalled();
  });

  it('rejects zero-total orders without creating a payment', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'marketplace-order-id',
        customer_id: 'user-id',
        status: 'PENDING_PAYMENT',
        total_minor: '0',
        currency: 'NGN',
      }],
    });

    await expect(
      service.createMarketplacePaymentIntent(
        'user-id',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(providers.getProviderRegistration).not.toHaveBeenCalled();
  });

  it('reuses a pending marketplace payment without routing or initializing another provider request', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-reference',
          payment_user_id: 'user-id',
          payment_amount_minor: '2750',
          payment_currency: 'NGN',
          payment_state: 'PENDING',
          payment_purpose: 'MARKETPLACE_ORDER',
          payment_provider_configuration_id: 'provider-configuration-id',
          payment_provider_name: provider.name,
          payment_provider_reference: 'provider-reference',
          payment_provider_status: 'PENDING',
          payment_provider_checkout_url: 'https://provider.invalid/checkout',
        }],
      });

    const result = await service.createMarketplacePaymentIntent(
      'user-id',
      'user@example.test',
      { orderId: 'marketplace-order-id' },
    );

    expect(result.payment.reference).toBe('PAY-reference');
    expect(providers.getProviderRegistration).not.toHaveBeenCalled();
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('does not replace an existing payment that is initializing or terminal', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-reference',
          payment_user_id: 'user-id',
          payment_amount_minor: '2750',
          payment_currency: 'NGN',
          payment_state: 'PENDING',
          payment_purpose: 'MARKETPLACE_ORDER',
          payment_provider_configuration_id: 'provider-configuration-id',
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
        }],
      });

    await expect(
      service.createMarketplacePaymentIntent(
        'user-id',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(ConflictException);
    expect(providers.getProviderRegistration).not.toHaveBeenCalled();
  });

  it('fails safely when configured ECOMMERCE routing is unavailable', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '2750',
          currency: 'NGN',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    providers.getProviderRegistration.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );

    await expect(
      service.createMarketplacePaymentIntent(
        'user-id',
        'user@example.test',
        { orderId: 'marketplace-order-id' },
      ),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('passes the authenticated customer and only the route order ID to the service', async () => {
    const createMarketplacePaymentIntent = jest.fn();
    const controller = new PaymentController({
      createMarketplacePaymentIntent,
    } as never);
    const user = {
      id: 'authenticated-customer-id',
      email: 'customer@example.test',
      phone: null,
      roles: [],
    };

    controller.createMarketplacePayment(user, 'marketplace-order-id');

    expect(createMarketplacePaymentIntent).toHaveBeenCalledWith(
      user.id,
      user.email,
      { orderId: 'marketplace-order-id' },
    );
  });

  it('keeps wallet funding deposit-backed without supplying a membership program', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'wallet-id', user_id: 'user-id', currency: 'USD', status: 'ACTIVE' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'deposit-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'payment-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-wallet',
          payment_user_id: 'user-id',
          payment_amount_minor: '1200',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_idempotency_key: 'wallet-key',
          payment_created_at: new Date(),
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
          deposit_id: 'deposit-id',
          deposit_reference: 'DEP-wallet',
          deposit_wallet_id: 'wallet-id',
          deposit_amount_minor: '1200',
          deposit_currency: 'USD',
          deposit_state: 'PENDING',
          deposit_created_at: new Date(),
        }],
      });

    await service.createFundingIntent('user-id', 'user@example.test', {
      walletId: 'wallet-id',
      amountMinor: 1200,
      currency: 'USD',
      idempotencyKey: 'wallet-key',
    });

    const paymentInsert = (client.query.mock.calls as QueryCall[]).find(([query]) =>
      String(query).includes('INSERT INTO payments'),
    );
    expect(paymentInsert).toBeDefined();
    expect(String(paymentInsert?.[0])).toContain('deposit_id');
    expect(String(paymentInsert?.[0])).not.toContain('membership_program_id');
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payments'),
      expect.any(Array),
    );
  });

  it('requires a membership program ID at the request boundary', async () => {
    const request = new CreateMembershipPaymentDto();
    request.billingPeriod = 'MONTHLY';
    request.idempotencyKey = 'membership-key';

    const errors = await validate(request);

    expect(errors.map((error) => error.property)).toContain(
      'membershipProgramId',
    );
  });

  it('rejects a nonexistent membership program before creating a payment', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createMembershipPaymentIntent(
        'user-id',
        'user@example.test',
        validRequest,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('rejects a disabled membership program without creating a payment', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: validRequest.membershipProgramId,
        enabled: false,
        monthly_price_minor: '1500',
        annual_price_minor: '12000',
        currency: 'USD',
      }],
    });

    await expect(
      service.createMembershipPaymentIntent(
        'user-id',
        'user@example.test',
        validRequest,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('rejects a billing period without a configured price', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: validRequest.membershipProgramId,
        enabled: true,
        monthly_price_minor: '1500',
        annual_price_minor: null,
        currency: 'USD',
      }],
    });

    await expect(
      service.createMembershipPaymentIntent(
        'user-id',
        'user@example.test',
        validRequest,
      ),
    ).rejects.toThrow('configured annual price is not valid');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('creates a program-linked membership payment using configured annual price and currency', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: validRequest.membershipProgramId,
          enabled: true,
          monthly_price_minor: '1500',
          annual_price_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'payment-id',
          payment_reference: 'PAY-membership',
          payment_user_id: 'user-id',
          payment_amount_minor: '12000',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_purpose: 'BUSINESS_MEMBERSHIP',
          membership_program_id: validRequest.membershipProgramId,
          membership_billing_period: 'ANNUAL',
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
          payment_created_at: new Date(),
        }],
      });

    const result = await service.createMembershipPaymentIntent(
      'user-id',
      'user@example.test',
      validRequest,
    );

    const paymentInsert = (client.query.mock.calls as QueryCall[]).find(([query]) =>
      String(query).includes('INSERT INTO payments'),
    );
    expect(paymentInsert?.[0]).toContain("'BUSINESS_MEMBERSHIP'");
    expect(paymentInsert?.[0]).toContain('membership_program_id');
    expect(paymentInsert?.[0]).toContain('membership_billing_period');
    expect(paymentInsert?.[1]).toEqual(expect.arrayContaining([
      validRequest.membershipProgramId,
      'ANNUAL',
    ]));
    expect(provider.initializePayment.mock.calls[0]?.[0]).toMatchObject({
      amountMinor: 12000,
      currency: 'USD',
      metadata: {
        paymentPurpose: 'BUSINESS_MEMBERSHIP',
        membershipProgramId: validRequest.membershipProgramId,
        billingPeriod: 'ANNUAL',
      },
    });
    expect(result).toMatchObject({
      payment: {
        userId: 'user-id',
        purpose: 'BUSINESS_MEMBERSHIP',
        membershipProgramId: validRequest.membershipProgramId,
        billingPeriod: 'ANNUAL',
        amountMinor: 12000,
        currency: 'USD',
        state: 'PENDING',
      },
    });
    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      /entitlement/i.test(String(query)),
    )).toBe(false);
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('reuses the same membership payment for an identical idempotency request', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: validRequest.membershipProgramId,
          enabled: true,
          monthly_price_minor: '1500',
          annual_price_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'existing-payment',
          payment_reference: 'PAY-existing',
          payment_user_id: 'user-id',
          payment_amount_minor: '12000',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_purpose: 'BUSINESS_MEMBERSHIP',
          membership_program_id: validRequest.membershipProgramId,
          membership_billing_period: 'ANNUAL',
          payment_provider_name: provider.name,
          payment_provider_reference: 'provider-ref',
          payment_provider_status: 'PENDING',
          payment_provider_checkout_url: 'https://provider.invalid/checkout',
          payment_created_at: new Date(),
        }],
      });

    const result = await service.createMembershipPaymentIntent(
      'user-id',
      'user@example.test',
      validRequest,
    );

    expect(result.payment.reference).toBe('PAY-existing');
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key for a different billing period', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: validRequest.membershipProgramId,
          enabled: true,
          monthly_price_minor: '12000',
          annual_price_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'existing-payment',
          payment_reference: 'PAY-existing',
          payment_user_id: 'user-id',
          payment_amount_minor: '12000',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_purpose: 'BUSINESS_MEMBERSHIP',
          membership_program_id: validRequest.membershipProgramId,
          membership_billing_period: 'MONTHLY',
          payment_provider_name: provider.name,
          payment_provider_reference: 'provider-ref',
          payment_provider_status: 'PENDING',
          payment_provider_checkout_url: 'https://provider.invalid/checkout',
          payment_created_at: new Date(),
        }],
      });

    await expect(
      service.createMembershipPaymentIntent(
        'user-id',
        'user@example.test',
        validRequest,
      ),
    ).rejects.toThrow(ConflictException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key for a different membership program', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: validRequest.membershipProgramId,
          enabled: true,
          monthly_price_minor: '1500',
          annual_price_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'existing-payment',
          payment_reference: 'PAY-existing',
          payment_user_id: 'user-id',
          payment_amount_minor: '12000',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_purpose: 'BUSINESS_MEMBERSHIP',
          membership_program_id: 'different-program-id',
          membership_billing_period: 'ANNUAL',
          payment_provider_name: provider.name,
          payment_provider_reference: 'provider-ref',
          payment_provider_status: 'PENDING',
          payment_provider_checkout_url: 'https://provider.invalid/checkout',
          payment_created_at: new Date(),
        }],
      });

    await expect(
      service.createMembershipPaymentIntent(
        'user-id',
        'user@example.test',
        validRequest,
      ),
    ).rejects.toThrow(ConflictException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('creates a separate membership payment when another user uses the same idempotency key', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: validRequest.membershipProgramId,
          enabled: true,
          monthly_price_minor: '1500',
          annual_price_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          payment_id: 'second-user-payment',
          payment_reference: 'PAY-second-user',
          payment_user_id: 'second-user-id',
          payment_amount_minor: '12000',
          payment_currency: 'USD',
          payment_state: 'PENDING',
          payment_purpose: 'BUSINESS_MEMBERSHIP',
          membership_program_id: validRequest.membershipProgramId,
          membership_billing_period: 'ANNUAL',
          payment_provider_name: null,
          payment_provider_reference: null,
          payment_provider_status: 'INITIALIZING',
          payment_provider_checkout_url: null,
          payment_created_at: new Date(),
        }],
      });

    const result = await service.createMembershipPaymentIntent(
      'second-user-id',
      'second-user@example.test',
      validRequest,
    );

    const queryCalls = client.query.mock.calls as QueryCall[];
    expect(queryCalls[1]?.[0]).toContain(
      'WHERE user_id = $1 AND idempotency_key = $2',
    );
    expect(queryCalls[1]?.[1]).toEqual([
      'second-user-id',
      validRequest.idempotencyKey,
    ]);
    expect(queryCalls[2]?.[1]).toEqual(expect.arrayContaining([
      'second-user-id',
      validRequest.idempotencyKey,
    ]));
    expect(result.payment).toMatchObject({
      id: 'second-user-payment',
      reference: 'PAY-second-user',
      userId: 'second-user-id',
    });
    expect(provider.initializePayment).toHaveBeenCalledTimes(1);
  });

  const webhookPayment = (
    state = 'PENDING',
    purpose:
      | 'WALLET_FUNDING'
      | 'BUSINESS_MEMBERSHIP'
      | 'MARKETPLACE_ORDER' = 'BUSINESS_MEMBERSHIP',
  ) => ({
    payment_id: 'payment-id',
    payment_reference: 'PAY-membership',
    payment_user_id: 'user-id',
    payment_amount_minor: '12000',
    payment_currency: 'USD',
    payment_state: state,
    payment_purpose: purpose,
    provider_configuration_id:
      purpose === 'MARKETPLACE_ORDER'
        ? 'provider-configuration-id'
        : null,
    membership_program_id:
      purpose === 'BUSINESS_MEMBERSHIP' ? validRequest.membershipProgramId : null,
    payment_provider_name: provider.name,
    payment_provider_reference: 'provider-ref',
    deposit_id: purpose === 'WALLET_FUNDING' ? 'deposit-id' : null,
  });

  const configureWebhook = (status: 'SUCCESS' | 'FAILED' | 'UNKNOWN') => {
    provider.verifyWebhook.mockResolvedValue({ valid: true, rawPayload: {} });
    provider.parseWebhook.mockReturnValue({
      providerName: provider.name,
      eventId: 'event-id',
      eventType: `payment.${status.toLowerCase()}`,
      paymentReference: 'PAY-membership',
      providerReference: 'provider-ref',
      amountMinor: 12000,
      currency: 'USD',
      status,
      metadata: {},
      rawPayload: { eventId: 'event-id' },
    });
  };
  const webhookPayload = (overrides: Record<string, unknown> = {}) => ({
    eventId: 'event-id',
    paymentReference: 'PAY-membership',
    ...overrides,
  });

  it('creates one ACTIVE entitlement for a verified successful membership payment', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 3, validity_unit: 'MONTH' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-id' }] });

    const result = await service.completeFromWebhook(webhookPayload());

    expect(result).toMatchObject({ status: 'SUCCESSFUL', alreadyProcessed: false });
    const queryCalls = client.query.mock.calls as QueryCall[];
    expect(String(queryCalls[1]?.[0])).toContain("state='SUCCESSFUL'");
    expect(String(queryCalls[3]?.[0])).toContain(
      'INSERT INTO business_membership_entitlements',
    );
    expect(String(queryCalls[3]?.[0])).toContain("'ACTIVE'");
    expect(String(queryCalls[3]?.[0])).toContain(
      'make_interval(months => $4::integer)',
    );
    expect(queryCalls[3]?.[1]).toEqual([
      'user-id',
      validRequest.membershipProgramId,
      'payment-id',
      3,
      'MONTH',
    ]);
    expect(String(queryCalls[3]?.[0])).not.toMatch(
      /amount_minor|currency|provider/i,
    );
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('does not duplicate or extend an entitlement for a repeated successful webhook', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 1, validity_unit: 'DAY' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-id' }] });

    await service.completeFromWebhook(webhookPayload());

    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment('SUCCESSFUL')] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 1, validity_unit: 'DAY' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.completeFromWebhook(webhookPayload());

    const queryCalls = client.query.mock.calls as QueryCall[];
    const entitlementInserts = queryCalls.filter(([query]) =>
      String(query).includes('INSERT INTO business_membership_entitlements'),
    );
    expect(result).toMatchObject({ status: 'SUCCESSFUL', alreadyProcessed: true });
    expect(entitlementInserts).toHaveLength(2);
    expect(String(entitlementInserts[0]?.[0])).toContain(
      'ON CONFLICT (payment_id) DO NOTHING',
    );
    expect(String(entitlementInserts[1]?.[0])).toContain(
      'ON CONFLICT (payment_id) DO NOTHING',
    );
    expect(
      queryCalls.filter(([query]) =>
        String(query).includes("SET state='SUCCESSFUL'"),
      ),
    ).toHaveLength(1);
  });

  it('does not create an entitlement for a failed membership payment', async () => {
    configureWebhook('FAILED');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.completeFromWebhook(webhookPayload());

    expect(result?.status).toBe('FAILED');
    expect(client.query).toHaveBeenCalledTimes(2);
    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      String(query).includes('business_membership_entitlements'),
    )).toBe(false);
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('reconciles a stale initializing marketplace payment when lookup confirms success', async () => {
    const candidate = {
      payment_id: 'payment-id',
      recovery_claim_token: 'recovery-claim-token',
      recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
      payment_reference: 'PAY-marketplace-recovery',
      payment_user_id: 'user-id',
      payment_amount_minor: '12000',
      payment_currency: 'USD',
      payment_state: 'PENDING',
      payment_purpose: 'MARKETPLACE_ORDER',
      membership_program_id: null,
      provider_configuration_id: 'provider-configuration-id',
      payment_provider_name: provider.name,
      payment_provider_reference: null,
      deposit_id: null,
      marketplace_order_id: 'marketplace-order-id',
    };

    db.query.mockResolvedValueOnce({ rows: [candidate] });
    provider.lookupPayment.mockResolvedValueOnce({
      status: 'FOUND',
      transaction: {
        providerName: provider.name,
        paymentReference: candidate.payment_reference,
        providerReference: 'provider-ref-recovered',
        amountMinor: 12000,
        currency: 'USD',
        status: 'SUCCESS',
        rawPayload: { transactionId: 'provider-transaction-id' },
      },
    });

    client.query
      .mockResolvedValueOnce({
        rows: [{
          ...candidate,
          payment_provider_status: 'INITIALIZING',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'item-1' }, { id: 'item-2' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 1, unresolved: 0 });
    expect(
      providers.getProviderRegistrationByConfigurationId,
    ).toHaveBeenCalledWith('provider-configuration-id');
    expect(provider.lookupPayment).toHaveBeenCalledWith({
      providerConfiguration: {
        id: 'provider-configuration-id',
        config: { configuredValue: 'value' },
        credentials: 'resolved-test-secret',
      },
      paymentReference: 'PAY-marketplace-recovery',
      amountMinor: 12000,
      currency: 'USD',
    });
    expect(providerSecretResolver.resolve).toHaveBeenCalledWith(
      'configured-secret-reference',
    );
    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).toHaveBeenCalledTimes(2);
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).toHaveBeenCalledWith(client, 'marketplace-order-id');
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).toHaveBeenCalledWith(client, 'user-id', 'marketplace-order-id');

    const update = (client.query.mock.calls as QueryCall[]).find(([query]) =>
      String(query).includes("SET state='SUCCESSFUL'"),
    );
    expect(update?.[1]).toEqual([
      'provider-ref-recovered',
      JSON.stringify({ transactionId: 'provider-transaction-id' }),
      'payment-id',
    ]);
  });

  it('leaves a marketplace payment unresolved when provider lookup is unknown', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        payment_id: 'payment-id',
        recovery_claim_token: 'recovery-claim-token',
        recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
        payment_reference: 'PAY-marketplace-recovery',
        payment_amount_minor: '12000',
        payment_currency: 'USD',
        payment_state: 'PENDING',
        payment_purpose: 'MARKETPLACE_ORDER',
        provider_configuration_id: 'provider-configuration-id',
        payment_provider_name: provider.name,
      }],
    });
    provider.lookupPayment.mockResolvedValueOnce({ status: 'UNKNOWN' });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 1 });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('does not look up or settle a marketplace payment without a pinned provider configuration', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        payment_id: 'payment-id',
        recovery_claim_token: 'recovery-claim-token',
        recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
        payment_reference: 'PAY-marketplace-recovery',
        payment_amount_minor: '12000',
        payment_currency: 'USD',
        payment_state: 'PENDING',
        payment_purpose: 'MARKETPLACE_ORDER',
        provider_configuration_id: null,
        payment_provider_name: provider.name,
      }],
    });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 1 });
    expect(
      providers.getProviderRegistrationByConfigurationId,
    ).not.toHaveBeenCalled();
    expect(provider.lookupPayment).not.toHaveBeenCalled();
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('does not settle a recovery lookup whose transaction identity does not match', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        payment_id: 'payment-id',
        recovery_claim_token: 'recovery-claim-token',
        recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
        payment_reference: 'PAY-marketplace-recovery',
        payment_amount_minor: '12000',
        payment_currency: 'USD',
        payment_state: 'PENDING',
        payment_purpose: 'MARKETPLACE_ORDER',
        provider_configuration_id: 'provider-configuration-id',
        payment_provider_name: provider.name,
      }],
    });
    provider.lookupPayment.mockResolvedValueOnce({
      status: 'FOUND',
      transaction: {
        providerName: 'different-provider',
        paymentReference: 'PAY-marketplace-recovery',
        providerReference: 'provider-ref-recovered',
        amountMinor: 12000,
        currency: 'USD',
        status: 'SUCCESS',
        rawPayload: {},
      },
    });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 1 });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });


it.each([
  {
    field: 'provider name',
    overrides: { providerName: 'different-provider' },
  },
  {
    field: 'payment reference',
    overrides: { paymentReference: 'different-payment-reference' },
  },
  {
    field: 'provider reference',
    overrides: { providerReference: '' },
  },
  {
    field: 'amount',
    overrides: { amountMinor: 12001 },
  },
  {
    field: 'currency',
    overrides: { currency: 'NGN' },
  },
  {
    field: 'pending provider status',
    overrides: { status: 'PENDING' },
  },
  {
    field: 'failed provider status',
    overrides: { status: 'FAILED' },
  },
])(
  'does not settle recovery when the provider lookup has a mismatched $field',
  async ({ overrides }) => {
    const candidate = {
      payment_id: 'payment-id',
      recovery_claim_token: 'recovery-claim-token',
      recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
      payment_reference: 'PAY-marketplace-recovery',
      payment_user_id: 'user-id',
      payment_amount_minor: '12000',
      payment_currency: 'USD',
      payment_state: 'PENDING',
      payment_purpose: 'MARKETPLACE_ORDER',
      membership_program_id: null,
      provider_configuration_id: 'provider-configuration-id',
      payment_provider_name: provider.name,
      payment_provider_reference: null,
      deposit_id: null,
      marketplace_order_id: 'marketplace-order-id',
    };

    db.query.mockResolvedValueOnce({ rows: [candidate] });
    provider.lookupPayment.mockResolvedValueOnce({
      status: 'FOUND',
      transaction: {
        providerName: provider.name,
        paymentReference: candidate.payment_reference,
        providerReference: 'provider-ref-recovered',
        amountMinor: 12000,
        currency: 'USD',
        status: 'SUCCESS',
        rawPayload: {},
        ...overrides,
      },
    });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 1 });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  },
);

it('leaves a marketplace payment unresolved when provider lookup throws', async () => {
  const candidate = {
    payment_id: 'payment-id',
    recovery_claim_token: 'recovery-claim-token',
    recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
    payment_reference: 'PAY-marketplace-recovery',
    payment_user_id: 'user-id',
    payment_amount_minor: '12000',
    payment_currency: 'USD',
    payment_state: 'PENDING',
    payment_purpose: 'MARKETPLACE_ORDER',
    membership_program_id: null,
    provider_configuration_id: 'provider-configuration-id',
    payment_provider_name: provider.name,
    payment_provider_reference: null,
    deposit_id: null,
    marketplace_order_id: 'marketplace-order-id',
  };

  db.query.mockResolvedValueOnce({ rows: [candidate] });
  provider.lookupPayment.mockRejectedValueOnce(new Error('lookup timeout'));

  const result = await service.recoverInitializingMarketplacePayments();

  expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 1 });
  expect(db.withTransaction).not.toHaveBeenCalled();
  expect(client.query).not.toHaveBeenCalled();
});


it.each([
  {
    field: 'payment reference',
    overrides: { payment_reference: 'PAY-different-reference' },
  },
  {
    field: 'customer',
    overrides: { payment_user_id: 'different-customer-id' },
  },
  {
    field: 'amount',
    overrides: { payment_amount_minor: '12001' },
  },
  {
    field: 'currency',
    overrides: { payment_currency: 'NGN' },
  },
  {
    field: 'provider name',
    overrides: { payment_provider_name: 'different-provider' },
  },
  {
    field: 'marketplace order',
    overrides: { marketplace_order_id: 'different-marketplace-order-id' },
  },
  {
    field: 'provider configuration',
    overrides: { provider_configuration_id: 'different-configuration-id' },
  },
  {
    field: 'recovery claim token',
    overrides: { recovery_claim_token: 'different-recovery-claim-token' },
  },
  {
    field: 'expired recovery claim',
    overrides: { recovery_claim_expires_at: '2000-01-01T00:00:00.000Z' },
  },
  {
    field: 'payment purpose',
    overrides: { payment_purpose: 'DEPOSIT' },
  },
  {
    field: 'provider status',
    overrides: { payment_provider_status: 'SUCCESS' },
  },
])(
  'skips recovery settlement when the locked payment $field changes',
  async ({ overrides }) => {
    const candidate = {
      payment_id: 'payment-id',
      recovery_claim_token: 'recovery-claim-token',
      recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
      payment_reference: 'PAY-marketplace-recovery',
      payment_user_id: 'user-id',
      payment_amount_minor: '12000',
      payment_currency: 'USD',
      payment_state: 'PENDING',
      payment_purpose: 'MARKETPLACE_ORDER',
      membership_program_id: null,
      provider_configuration_id: 'provider-configuration-id',
      payment_provider_name: provider.name,
      payment_provider_reference: null,
      deposit_id: null,
      marketplace_order_id: 'marketplace-order-id',
    };

    db.query.mockResolvedValueOnce({ rows: [candidate] });

    provider.lookupPayment.mockResolvedValueOnce({
      status: 'FOUND',
      transaction: {
        providerName: provider.name,
        paymentReference: candidate.payment_reference,
        providerReference: 'provider-ref-recovered',
        amountMinor: 12000,
        currency: 'USD',
        status: 'SUCCESS',
        rawPayload: {},
      },
    });

    client.query.mockResolvedValueOnce({
      rows: [{
        ...candidate,
        payment_provider_status: 'INITIALIZING',
        ...overrides,
      }],
    });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 0 });
    expect(db.withTransaction).toHaveBeenCalledTimes(1);

    // Only the locked-payment read should run. No settlement writes should follow.
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();
  },
);

it('skips settlement if the payment has already changed before recovery locks it', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        payment_id: 'payment-id',
        recovery_claim_token: 'recovery-claim-token',
        recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
        payment_reference: 'PAY-marketplace-recovery',
        payment_amount_minor: '12000',
        payment_currency: 'USD',
        payment_state: 'PENDING',
        payment_purpose: 'MARKETPLACE_ORDER',
        provider_configuration_id: 'provider-configuration-id',
        payment_provider_name: provider.name,
      }],
    });
    provider.lookupPayment.mockResolvedValueOnce({
      status: 'FOUND',
      transaction: {
        providerName: provider.name,
        paymentReference: 'PAY-marketplace-recovery',
        providerReference: 'provider-ref-recovered',
        amountMinor: 12000,
        currency: 'USD',
        status: 'SUCCESS',
        rawPayload: {},
      },
    });
    client.query.mockResolvedValueOnce({
      rows: [{
        payment_id: 'payment-id',
        recovery_claim_token: 'recovery-claim-token',
        recovery_claim_expires_at: '2099-01-01T00:00:00.000Z',
        payment_reference: 'PAY-marketplace-recovery',
        payment_amount_minor: '12000',
        payment_currency: 'USD',
        payment_state: 'SUCCESSFUL',
        payment_purpose: 'MARKETPLACE_ORDER',
        provider_configuration_id: 'provider-configuration-id',
        payment_provider_name: provider.name,
        payment_provider_status: 'SUCCESS',
        marketplace_order_id: 'marketplace-order-id',
      }],
    });

    const result = await service.recoverInitializingMarketplacePayments();

    expect(result).toEqual({ scanned: 1, settled: 0, unresolved: 0 });
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();
  });

  it('settles a successful marketplace payment exactly once', async () => {
    configureWebhook('SUCCESS');

    const payment = {
      ...webhookPayment('PENDING', 'MARKETPLACE_ORDER'),
      marketplace_order_id: 'marketplace-order-id',
      payment_amount_minor: '12000',
      payment_currency: 'USD',
    };

    client.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'item-1' }, { id: 'item-2' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.completeFromWebhook(webhookPayload());

    expect(result).toMatchObject({
      status: 'SUCCESSFUL',
      paymentReference: 'PAY-membership',
      alreadyProcessed: false,
    });

    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).toHaveBeenNthCalledWith(1, client, 'marketplace-order-id', 'item-1');
    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).toHaveBeenNthCalledWith(2, client, 'marketplace-order-id', 'item-2');
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).toHaveBeenCalledWith(client, 'marketplace-order-id');
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).toHaveBeenCalledWith(client, 'user-id', 'marketplace-order-id');

    const queryCalls = client.query.mock.calls as QueryCall[];
    const paymentUpdate = queryCalls.find(([query]) =>
      String(query).includes("SET state='SUCCESSFUL'"),
    );

    expect(paymentUpdate?.[1]).toEqual([
      'provider-ref',
      JSON.stringify({ eventId: 'event-id' }),
      'payment-id',
    ]);
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('rejects a late successful webhook for a failed marketplace payment', async () => {
    configureWebhook('SUCCESS');

    client.query.mockResolvedValueOnce({
      rows: [
        {
          ...webhookPayment('FAILED', 'MARKETPLACE_ORDER'),
          marketplace_order_id: 'marketplace-order-id',
        },
      ],
    });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow(
      'A failed marketplace payment cannot be settled as successful',
    );

    // A late success must not process the cancelled order.
    expect(client.query).toHaveBeenCalledTimes(1);

    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();

    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();

    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();
  });

  it('does not settle inventory or finalize the cart for a repeated successful marketplace webhook', async () => {
    configureWebhook('SUCCESS');

    client.query.mockResolvedValueOnce({
      rows: [{
        ...webhookPayment('SUCCESSFUL', 'MARKETPLACE_ORDER'),
        marketplace_order_id: 'marketplace-order-id',
      }],
    });

    const result = await service.completeFromWebhook(webhookPayload());

    expect(result).toMatchObject({
      status: 'SUCCESSFUL',
      paymentReference: 'PAY-membership',
      alreadyProcessed: true,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('does not complete payment settlement when inventory consumption fails', async () => {
    configureWebhook('SUCCESS');

    client.query
      .mockResolvedValueOnce({
        rows: [{
          ...webhookPayment('PENDING', 'MARKETPLACE_ORDER'),
          marketplace_order_id: 'marketplace-order-id',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'item-1' }, { id: 'item-2' }],
      });

    marketplaceOrderService.consumeInventoryReservation
      .mockRejectedValueOnce(new ConflictException('Inventory reservation unavailable'));

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow('Inventory reservation unavailable');

    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).toHaveBeenCalledTimes(1);
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();

    const queryCalls = client.query.mock.calls as QueryCall[];
    expect(
      queryCalls.some(([query]) =>
        String(query).includes("SET state='SUCCESSFUL'"),
      ),
    ).toBe(false);
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('rejects marketplace settlement when the order amount or currency differs', async () => {
    configureWebhook('SUCCESS');

    client.query
      .mockResolvedValueOnce({
        rows: [{
          ...webhookPayment('PENDING', 'MARKETPLACE_ORDER'),
          marketplace_order_id: 'marketplace-order-id',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '11999',
          currency: 'USD',
        }],
      });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow(ConflictException);

    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();

    const queryCalls = client.query.mock.calls as QueryCall[];
    expect(
      queryCalls.some(([query]) =>
        String(query).includes("SET state='SUCCESSFUL'"),
      ),
    ).toBe(false);
  });

  it('rejects marketplace settlement when the order has no items', async () => {
    configureWebhook('SUCCESS');

    client.query
      .mockResolvedValueOnce({
        rows: [{
          ...webhookPayment('PENDING', 'MARKETPLACE_ORDER'),
          marketplace_order_id: 'marketplace-order-id',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'marketplace-order-id',
          customer_id: 'user-id',
          status: 'PENDING_PAYMENT',
          total_minor: '12000',
          currency: 'USD',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow(ConflictException);

    expect(
      marketplaceOrderService.consumeInventoryReservation,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceOrderService.placePendingPaymentOrder,
    ).not.toHaveBeenCalled();
    expect(
      marketplaceCartService.finalizePendingOrderCart,
    ).not.toHaveBeenCalled();

    const queryCalls = client.query.mock.calls as QueryCall[];
    expect(
      queryCalls.some(([query]) =>
        String(query).includes("SET state='SUCCESSFUL'"),
      ),
    ).toBe(false);
  });

  it('uses the pinned provider configuration and rejects marketplace payments without order linkage', async () => {
    configureWebhook('SUCCESS');
    client.query.mockResolvedValueOnce({
      rows: [webhookPayment('PENDING', 'MARKETPLACE_ORDER')],
    });

    await expect(
      service.completeFromWebhook(
        webhookPayload({ providerName: 'attacker-selected-provider' }),
      ),
    ).rejects.toThrow('Marketplace order not found');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(
      providers.getProviderRegistrationByConfigurationId,
    ).toHaveBeenCalledWith('provider-configuration-id');
    expect(providers.getProvider).not.toHaveBeenCalled();
    expect(providerSecretResolver.resolve).toHaveBeenCalledWith(
      'configured-secret-reference',
    );
expect(provider.verifyWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfiguration: {
          id: 'provider-configuration-id',
          config: { configuredValue: 'value' },
          credentials: 'resolved-test-secret',
        },
      }),
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
  });

  it('rejects a marketplace callback when no provider configuration is pinned', async () => {
    const payment = webhookPayment('PENDING', 'MARKETPLACE_ORDER');
    payment.provider_configuration_id = null;
    client.query.mockResolvedValueOnce({ rows: [payment] });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(
      providers.getProviderRegistrationByConfigurationId,
    ).not.toHaveBeenCalled();
    expect(providers.getProvider).not.toHaveBeenCalled();
    expect(provider.verifyWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ['provider reference', { providerReference: 'other-provider-reference' }],
    ['amount', { amountMinor: 12001 }],
    ['currency', { currency: 'NGN' }],
  ])('rejects pinned marketplace callback with mismatched %s', async (_field, eventOverrides) => {
    configureWebhook('SUCCESS');
    provider.parseWebhook.mockReturnValueOnce({
      providerName: provider.name,
      eventId: 'event-id',
      eventType: 'payment.success',
      paymentReference: 'PAY-membership',
      providerReference: 'provider-ref',
      amountMinor: 12000,
      currency: 'USD',
      status: 'SUCCESS',
      metadata: {},
      rawPayload: {},
      ...eventOverrides,
    });
    client.query.mockResolvedValueOnce({
      rows: [webhookPayment('PENDING', 'MARKETPLACE_ORDER')],
    });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow(ConflictException);

    expect(
      providers.getProviderRegistrationByConfigurationId,
    ).toHaveBeenCalledWith('provider-configuration-id');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('credits successful wallet funding without creating a membership entitlement', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment('PENDING', 'WALLET_FUNDING')] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'deposit-id',
          wallet_id: 'wallet-id',
          amount_minor: '12000',
          currency: 'USD',
          state: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.completeFromWebhook(webhookPayload());

    expect(result?.status).toBe('SUCCESSFUL');
    expect(walletService.creditWithClient).toHaveBeenCalledTimes(1);
    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      String(query).includes('business_membership_entitlements'),
    )).toBe(false);
  });

  it('calculates expiration using the configured program validity period', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 2, validity_unit: 'YEAR' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await service.completeFromWebhook(webhookPayload());

    const entitlementInsert = (client.query.mock.calls as QueryCall[]).find(
      ([query]) =>
        String(query).includes('INSERT INTO business_membership_entitlements'),
    );
    expect(String(entitlementInsert?.[0])).toContain(
      'make_interval(years => $4::integer)',
    );
    expect(entitlementInsert?.[1]).toEqual([
      'user-id',
      validRequest.membershipProgramId,
      'payment-id',
      2,
      'YEAR',
    ]);
  });

  it('leaves expires_at NULL when program validity is not configured', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: null, validity_unit: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await service.completeFromWebhook(webhookPayload());

    const entitlementInsert = (client.query.mock.calls as QueryCall[]).find(
      ([query]) =>
        String(query).includes('INSERT INTO business_membership_entitlements'),
    );
    expect(String(entitlementInsert?.[0])).toContain(
      'WHEN $4::integer IS NULL THEN NULL',
    );
    expect(entitlementInsert?.[1]).toEqual([
      'user-id',
      validRequest.membershipProgramId,
      'payment-id',
      null,
      null,
    ]);
  });

  it('rejects invalid program validity instead of inventing an expiry', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: null, validity_unit: 'MONTH' }],
      });

    await expect(
      service.completeFromWebhook(webhookPayload()),
    ).rejects.toThrow('Membership program validity configuration is invalid');

    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      String(query).includes('INSERT INTO business_membership_entitlements'),
    )).toBe(false);
  });
});
