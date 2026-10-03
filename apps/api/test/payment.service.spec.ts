import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import type {
  InitializePaymentRequest,
  InitializePaymentResponse,
} from '../src/modules/providers/interfaces/payment-provider.interface';
import { PaymentService } from '../src/modules/payments/payment.service';
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
  };
  const providers = {
    getProvider: jest.fn().mockResolvedValue(provider),
  };
  const config = { get: jest.fn() };
  const walletService = { creditWithClient: jest.fn() };
  const service = new PaymentService(
    db as never,
    providers as never,
    config as never,
    walletService as never,
  );

  const validRequest = {
    membershipProgramId: 'program-id',
    billingPeriod: 'ANNUAL' as const,
    idempotencyKey: 'membership-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    providers.getProvider.mockResolvedValue(provider);
    provider.initializePayment.mockResolvedValue({
      providerName: provider.name,
      providerReference: 'provider-ref',
      checkoutUrl: 'https://provider.invalid/checkout',
      status: 'PENDING',
      rawPayload: {},
    });
    client.query.mockResolvedValue({ rows: [] });
    db.query.mockResolvedValue({ rows: [] });
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
    purpose: 'WALLET_FUNDING' | 'BUSINESS_MEMBERSHIP' = 'BUSINESS_MEMBERSHIP',
  ) => ({
    payment_id: 'payment-id',
    payment_reference: 'PAY-membership',
    payment_user_id: 'user-id',
    payment_amount_minor: '12000',
    payment_currency: 'USD',
    payment_state: state,
    payment_purpose: purpose,
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

  it('creates one ACTIVE entitlement for a verified successful membership payment', async () => {
    configureWebhook('SUCCESS');
    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 3, validity_unit: 'MONTH' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-id' }] });

    const result = await service.completeFromWebhook({ eventId: 'event-id' });

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

    await service.completeFromWebhook({ eventId: 'event-id' });

    client.query
      .mockResolvedValueOnce({ rows: [webhookPayment('SUCCESSFUL')] })
      .mockResolvedValueOnce({
        rows: [{ validity_duration: 1, validity_unit: 'DAY' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.completeFromWebhook({ eventId: 'event-id' });

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

    const result = await service.completeFromWebhook({ eventId: 'event-id' });

    expect(result.status).toBe('FAILED');
    expect(client.query).toHaveBeenCalledTimes(2);
    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      String(query).includes('business_membership_entitlements'),
    )).toBe(false);
    expect(walletService.creditWithClient).not.toHaveBeenCalled();
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

    const result = await service.completeFromWebhook({ eventId: 'event-id' });

    expect(result.status).toBe('SUCCESSFUL');
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

    await service.completeFromWebhook({ eventId: 'event-id' });

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

    await service.completeFromWebhook({ eventId: 'event-id' });

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
      service.completeFromWebhook({ eventId: 'event-id' }),
    ).rejects.toThrow('Membership program validity configuration is invalid');

    expect((client.query.mock.calls as QueryCall[]).some(([query]) =>
      String(query).includes('INSERT INTO business_membership_entitlements'),
    )).toBe(false);
  });
});
