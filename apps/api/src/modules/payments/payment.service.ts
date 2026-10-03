import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { PaymentProviderRouterService } from '../providers/routing/payment-provider-router.service';
import type {
  CreateMembershipPaymentDto,
  MembershipBillingPeriod,
} from './dto/create-membership-payment.dto';
import type { CreateMarketplacePaymentDto } from './dto/create-marketplace-payment.dto';
import type { FundWalletDto } from './dto/fund-wallet.dto';
import { WalletService } from '../wallets/wallet.service';

type PaymentPurpose =
  | 'WALLET_FUNDING'
  | 'BUSINESS_MEMBERSHIP'
  | 'MARKETPLACE_ORDER';

interface FundingIntentRow {
  payment_id: string;
  payment_reference: string;
  payment_user_id: string;
  payment_amount_minor: string;
  payment_currency: CurrencyCode;
  payment_state: string;
  payment_idempotency_key: string;
  payment_created_at: Date;
  payment_provider_name: string | null;
  payment_provider_reference: string | null;
  payment_provider_status: string | null;
  payment_provider_checkout_url: string | null;
  deposit_id: string;
  deposit_reference: string;
  deposit_wallet_id: string;
  deposit_amount_minor: string;
  deposit_currency: CurrencyCode;
  deposit_state: string;
  deposit_created_at: Date;
}

interface WalletRow { id: string; user_id: string; currency: CurrencyCode; status: string; }

interface MembershipProgramRow {
  id: string;
  enabled: boolean;
  monthly_price_minor: string | null;
  annual_price_minor: string | null;
  currency: CurrencyCode;
}

interface MembershipPaymentRow {
  payment_id: string;
  payment_reference: string;
  payment_user_id: string;
  payment_amount_minor: string;
  payment_currency: CurrencyCode;
  payment_state: string;
  payment_purpose: PaymentPurpose;
  membership_program_id: string | null;
  membership_billing_period: MembershipBillingPeriod | null;
  payment_provider_name: string | null;
  payment_provider_reference: string | null;
  payment_provider_status: string | null;
  payment_provider_checkout_url: string | null;
  payment_created_at: Date;
}

interface PaymentSettlementRow {
  payment_id: string;
  payment_reference: string;
  payment_user_id: string;
  payment_amount_minor: string;
  payment_currency: CurrencyCode;
  payment_state: string;
  payment_purpose: PaymentPurpose;
  membership_program_id: string | null;
  payment_provider_name: string | null;
  payment_provider_reference: string | null;
  deposit_id: string | null;
}

interface MarketplaceOrderPaymentSource {
  id: string;
  customer_id: string;
  status: string;
  total_minor: string;
  currency: CurrencyCode;
}

interface MarketplacePaymentRow {
  payment_id: string;
  payment_reference: string;
  payment_user_id: string;
  payment_amount_minor: string;
  payment_currency: CurrencyCode;
  payment_state: string;
  payment_purpose: PaymentPurpose;
  payment_provider_configuration_id: string | null;
  payment_provider_name: string | null;
  payment_provider_reference: string | null;
  payment_provider_status: string | null;
  payment_provider_checkout_url: string | null;
}

interface MembershipValidityRow {
  validity_duration: number | null;
  validity_unit: string | null;
}

interface DepositSettlementRow {
  id: string;
  wallet_id: string;
  amount_minor: string;
  currency: CurrencyCode;
  state: string;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly providers: PaymentProviderRouterService,
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
  ) {}

  async createFundingIntent(userId: string, customerEmail: string | null, request: FundWalletDto) {
    if (!request.idempotencyKey.trim()) throw new BadRequestException('idempotencyKey is required');
    if (!customerEmail?.trim()) throw new BadRequestException('An email address is required to initialize payment');

    const initialization = await this.db.withTransaction(async (client) => {
      const existing = await this.findExisting(client, userId, request.idempotencyKey);
      if (existing) {
        this.validateExisting(existing, request);
        if (existing.payment_provider_reference && existing.payment_provider_checkout_url && existing.payment_provider_name) {
          return { row: existing, shouldInitialize: false };
        }
        if (existing.payment_provider_status === 'INITIALIZING') {
          throw new ConflictException('Payment provider initialization is already in progress');
        }
        if (existing.payment_provider_status === 'FAILED') {
          throw new ServiceUnavailableException('Payment provider initialization previously failed');
        }

        const claimed = await client.query<{ id: string }>(
          `UPDATE payments SET provider_status='INITIALIZING'
           WHERE id=$1 AND provider_status IS NULL
           RETURNING id`,
          [existing.payment_id],
        );
        if (!claimed.rows[0]) throw new ConflictException('Payment provider initialization is already in progress');
        return { row: { ...existing, payment_provider_status: 'INITIALIZING' }, shouldInitialize: true };
      }

      const wallet = await this.lockWallet(client, userId, request.walletId);
      if (wallet.status !== 'ACTIVE') throw new BadRequestException('Wallet is not active');
      if (wallet.currency !== request.currency) throw new BadRequestException('Currency does not match wallet currency');

      const deposit = await client.query<{ id: string }>(
        `INSERT INTO deposits(wallet_id,reference,amount_minor,currency,state)
         VALUES($1,$2,$3,$4,'PENDING')
         RETURNING id`,
        [wallet.id, `DEP-${randomUUID()}`, request.amountMinor, request.currency],
      );
      const depositId = deposit.rows[0].id;
      const payment = await client.query<{ id: string }>(
        `INSERT INTO payments(reference,user_id,deposit_id,amount_minor,currency,state,idempotency_key,provider_status)
         VALUES($1,$2,$3,$4,$5,'PENDING',$6,'INITIALIZING')
         ON CONFLICT (user_id,idempotency_key) DO NOTHING
         RETURNING id`,
        [`PAY-${randomUUID()}`, userId, depositId, request.amountMinor, request.currency, request.idempotencyKey],
      );

      if (!payment.rows[0]) {
        await client.query('DELETE FROM deposits WHERE id=$1', [depositId]);
        const concurrent = await this.findExisting(client, userId, request.idempotencyKey);
        if (!concurrent) throw new ConflictException('Unable to resolve idempotent payment request');
        this.validateExisting(concurrent, request);
        if (concurrent.payment_provider_reference && concurrent.payment_provider_checkout_url && concurrent.payment_provider_name) {
          return { row: concurrent, shouldInitialize: false };
        }
        throw new ConflictException('Payment provider initialization is already in progress');
      }

      const created = await this.findByPaymentId(client, payment.rows[0].id);
      if (!created) throw new ConflictException('Unable to load created payment');
      return { row: created, shouldInitialize: true };
    });

    if (!initialization.shouldInitialize) return this.toFundingIntent(initialization.row);

    let providerName: string | undefined;
    try {
      const provider = await this.providers.getProvider();
      providerName = provider.name;
      const response = await provider.initializePayment({
        paymentReference: initialization.row.payment_reference,
        amountMinor: Number(initialization.row.payment_amount_minor),
        currency: initialization.row.payment_currency,
        customerEmail: customerEmail.trim(),
        callbackUrl: this.callbackUrl(),
        metadata: {
          paymentReference: initialization.row.payment_reference,
          depositReference: initialization.row.deposit_reference,
          walletId: initialization.row.deposit_wallet_id,
        },
      });
if (response.status !== 'PENDING') {
  throw new BadGatewayException(
    `Payment provider returned unexpected initialization status: ${response.status}`,
  );
}
      await this.db.query(
        `UPDATE payments
         SET provider_name=$1,provider_reference=$2,provider_status=$3,provider_checkout_url=$4,
             provider_metadata=$5
         WHERE id=$6 AND state='PENDING' AND provider_status='INITIALIZING'`,
        [response.providerName, response.providerReference, response.status, response.checkoutUrl, JSON.stringify({ status: response.status }), initialization.row.payment_id],
      );

      return this.toFundingIntent({
        ...initialization.row,
        payment_provider_name: response.providerName,
        payment_provider_reference: response.providerReference,
        payment_provider_status: response.status,
        payment_provider_checkout_url: response.checkoutUrl,
      });
    } catch (error) {
      await this.db.query(
        `UPDATE payments SET provider_name=COALESCE(provider_name,$1),provider_status='FAILED'
         WHERE id=$2 AND state='PENDING' AND provider_status='INITIALIZING'`,
        [providerName ?? null, initialization.row.payment_id],
      );
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException('Payment provider initialization failed');
    }
  }

  async createMembershipPaymentIntent(
    userId: string,
    customerEmail: string | null,
    request: CreateMembershipPaymentDto,
  ) {
    if (!request.idempotencyKey.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (!customerEmail?.trim()) {
      throw new BadRequestException(
        'An email address is required to initialize payment',
      );
    }
    if (!['MONTHLY', 'ANNUAL'].includes(request.billingPeriod)) {
      throw new BadRequestException('A valid membership billing period is required');
    }

    const initialization = await this.db.withTransaction(async (client) => {
      const programResult = await client.query<MembershipProgramRow>(
        `SELECT id, enabled, monthly_price_minor, annual_price_minor, currency
         FROM business_membership_programs
         WHERE id = $1
         FOR SHARE`,
        [request.membershipProgramId],
      );
      const program = programResult.rows[0];
      if (!program) {
        throw new NotFoundException('Business membership program not found');
      }
      if (!program.enabled) {
        throw new ForbiddenException(
          'Business membership program is not enabled',
        );
      }

      const configuredPrice = request.billingPeriod === 'MONTHLY'
        ? program.monthly_price_minor
        : program.annual_price_minor;
      const amountMinor = configuredPrice === null
        ? NaN
        : Number(configuredPrice);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new BadRequestException(
          `The configured ${request.billingPeriod.toLowerCase()} price is not valid for this program`,
        );
      }

      const existing = await this.findMembershipPaymentByIdempotencyKey(
        client,
        userId,
        request.idempotencyKey,
      );
      if (existing) {
        this.validateExistingMembershipPayment(existing, request);
        if (
          existing.payment_provider_reference &&
          existing.payment_provider_checkout_url &&
          existing.payment_provider_name
        ) {
          return { row: existing, shouldInitialize: false };
        }
        if (existing.payment_provider_status === 'INITIALIZING') {
          throw new ConflictException(
            'Payment provider initialization is already in progress',
          );
        }
        if (existing.payment_provider_status === 'FAILED') {
          throw new ServiceUnavailableException(
            'Payment provider initialization previously failed',
          );
        }

        const claimed = await client.query<{ id: string }>(
          `UPDATE payments
           SET provider_status = 'INITIALIZING'
           WHERE id = $1 AND state = 'PENDING' AND provider_status IS NULL
           RETURNING id`,
          [existing.payment_id],
        );
        if (!claimed.rows[0]) {
          throw new ConflictException(
            'Payment provider initialization is already in progress',
          );
        }

        return {
          row: { ...existing, payment_provider_status: 'INITIALIZING' },
          shouldInitialize: true,
        };
      }

      const inserted = await client.query<MembershipPaymentRow>(
        `INSERT INTO payments (
           reference,
           user_id,
           amount_minor,
           currency,
           state,
           idempotency_key,
           provider_status,
           purpose,
           membership_program_id,
           membership_billing_period
         )
         VALUES (
           $1, $2, $3, $4, 'PENDING', $5, 'INITIALIZING',
           'BUSINESS_MEMBERSHIP', $6, $7
         )
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING
           id payment_id,
           reference payment_reference,
           user_id payment_user_id,
           amount_minor payment_amount_minor,
           currency payment_currency,
           state payment_state,
           purpose payment_purpose,
           membership_program_id,
           membership_billing_period,
           provider_name payment_provider_name,
           provider_reference payment_provider_reference,
           provider_status payment_provider_status,
           provider_checkout_url payment_provider_checkout_url,
           created_at payment_created_at`,
        [
          `PAY-${randomUUID()}`,
          userId,
          amountMinor,
          program.currency,
          request.idempotencyKey,
          program.id,
          request.billingPeriod,
        ],
      );

      if (inserted.rows[0]) {
        return { row: inserted.rows[0], shouldInitialize: true };
      }

      const concurrent = await this.findMembershipPaymentByIdempotencyKey(
        client,
        userId,
        request.idempotencyKey,
      );
      if (!concurrent) {
        throw new ConflictException(
          'Unable to resolve idempotent membership payment request',
        );
      }
      this.validateExistingMembershipPayment(concurrent, request);
      if (
        concurrent.payment_provider_reference &&
        concurrent.payment_provider_checkout_url &&
        concurrent.payment_provider_name
      ) {
        return { row: concurrent, shouldInitialize: false };
      }
      throw new ConflictException(
        'Payment provider initialization is already in progress',
      );
    });

    if (!initialization.shouldInitialize) {
      return this.toMembershipPaymentIntent(initialization.row);
    }

    let providerName: string | undefined;
    try {
      const provider = await this.providers.getProvider();
      providerName = provider.name;
      const response = await provider.initializePayment({
        paymentReference: initialization.row.payment_reference,
        amountMinor: Number(initialization.row.payment_amount_minor),
        currency: initialization.row.payment_currency,
        customerEmail: customerEmail.trim(),
        callbackUrl: this.callbackUrl(),
        metadata: {
          paymentReference: initialization.row.payment_reference,
          paymentPurpose: 'BUSINESS_MEMBERSHIP',
          membershipProgramId: initialization.row.membership_program_id ?? '',
          billingPeriod: initialization.row.membership_billing_period ?? '',
        },
      });

      if (response.status !== 'PENDING') {
        throw new BadGatewayException(
          `Payment provider returned unexpected initialization status: ${response.status}`,
        );
      }

      await this.db.query(
        `UPDATE payments
         SET provider_name = $1,
             provider_reference = $2,
             provider_status = $3,
             provider_checkout_url = $4,
             provider_metadata = $5
         WHERE id = $6
           AND state = 'PENDING'
           AND purpose = 'BUSINESS_MEMBERSHIP'
           AND provider_status = 'INITIALIZING'`,
        [
          response.providerName,
          response.providerReference,
          response.status,
          response.checkoutUrl,
          JSON.stringify({ status: response.status }),
          initialization.row.payment_id,
        ],
      );

      return this.toMembershipPaymentIntent({
        ...initialization.row,
        payment_provider_name: response.providerName,
        payment_provider_reference: response.providerReference,
        payment_provider_status: response.status,
        payment_provider_checkout_url: response.checkoutUrl,
      });
    } catch (error) {
      await this.db.query(
        `UPDATE payments
         SET provider_name = COALESCE(provider_name, $1),
             provider_status = 'FAILED'
         WHERE id = $2
           AND state = 'PENDING'
           AND purpose = 'BUSINESS_MEMBERSHIP'
           AND provider_status = 'INITIALIZING'`,
        [providerName ?? null, initialization.row.payment_id],
      );
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new BadGatewayException('Payment provider initialization failed');
    }
  }

  async createMarketplacePaymentIntent(
    userId: string,
    customerEmail: string | null,
    request: CreateMarketplacePaymentDto,
  ) {
    if (!customerEmail?.trim()) {
      throw new BadRequestException(
        'An email address is required to initialize payment',
      );
    }

    const preflight = await this.db.withTransaction(async (client) => {
      const order = await this.lockMarketplaceOrder(
        client,
        userId,
        request.orderId,
      );
      this.validateMarketplaceOrderForPayment(order);

      const existing = await this.findMarketplacePaymentForOrder(
        client,
        order.id,
      );
      return { order, existing };
    });

    if (preflight.existing) {
      return this.toReusableMarketplacePayment(preflight.existing);
    }

    const providerRegistration =
      await this.providers.getProviderRegistration('ECOMMERCE');
    const initialization = await this.db.withTransaction(async (client) => {
      const order = await this.lockMarketplaceOrder(
        client,
        userId,
        request.orderId,
      );
      this.validateMarketplaceOrderForPayment(order);

      const existing = await this.findMarketplacePaymentForOrder(
        client,
        order.id,
      );
      if (existing) {
        return { row: existing, created: false };
      }

      const paymentReference = `PAY-${randomUUID()}`;
      const result = await client.query<MarketplacePaymentRow>(
        `INSERT INTO payments (
           reference,
           user_id,
           amount_minor,
           currency,
           state,
           idempotency_key,
           provider_status,
           purpose,
           marketplace_order_id,
           provider_configuration_id
         )
         VALUES (
           $1, $2, $3, $4, 'PENDING', $5, 'INITIALIZING',
           'MARKETPLACE_ORDER', $6, $7
         )
         RETURNING
           id payment_id,
           reference payment_reference,
           user_id payment_user_id,
           amount_minor payment_amount_minor,
           currency payment_currency,
           state payment_state,
           purpose payment_purpose,
           provider_configuration_id payment_provider_configuration_id,
           provider_name payment_provider_name,
           provider_reference payment_provider_reference,
           provider_status payment_provider_status,
           provider_checkout_url payment_provider_checkout_url`,
        [
          paymentReference,
          userId,
          order.total_minor,
          order.currency,
          `marketplace-order-${order.id}`,
          order.id,
          providerRegistration.providerConfigurationId,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ConflictException(
          'Unable to create marketplace payment for this order',
        );
      }
      return { row, created: true };
    });

    if (!initialization.created) {
      return this.toReusableMarketplacePayment(initialization.row);
    }

    const row = initialization.row;
    const provider = providerRegistration.provider;
    try {
      const response = await provider.initializePayment({
        paymentReference: row.payment_reference,
        amountMinor: Number(row.payment_amount_minor),
        currency: row.payment_currency,
        customerEmail: customerEmail.trim(),
        callbackUrl: this.callbackUrl(),
        metadata: {
          paymentReference: row.payment_reference,
          marketplaceOrderId: request.orderId,
          paymentPurpose: 'MARKETPLACE_ORDER',
        },
      });

      if (response.status !== 'PENDING') {
        throw new BadGatewayException(
          `Payment provider returned unexpected initialization status: ${response.status}`,
        );
      }

      const updated = await this.db.query(
        `UPDATE payments
         SET provider_name = $1,
             provider_reference = $2,
             provider_status = $3,
             provider_checkout_url = $4,
             provider_metadata = $5
         WHERE id = $6
           AND state = 'PENDING'
           AND purpose = 'MARKETPLACE_ORDER'
           AND provider_configuration_id = $7
           AND provider_status = 'INITIALIZING'
         RETURNING id`,
        [
          response.providerName,
          response.providerReference,
          response.status,
          response.checkoutUrl,
          JSON.stringify({ status: response.status }),
          row.payment_id,
          providerRegistration.providerConfigurationId,
        ],
      );
      if (!updated.rows[0]) {
        throw new ConflictException(
          'Marketplace payment initialization is no longer pending',
        );
      }

      return this.toMarketplacePaymentIntent({
        ...row,
        payment_provider_name: response.providerName,
        payment_provider_reference: response.providerReference,
        payment_provider_status: response.status,
        payment_provider_checkout_url: response.checkoutUrl,
      });
    } catch (error) {
      await this.db.query(
        `UPDATE payments
         SET provider_name = COALESCE(provider_name, $1),
             provider_status = 'FAILED'
         WHERE id = $2
           AND state = 'PENDING'
           AND purpose = 'MARKETPLACE_ORDER'
           AND provider_status = 'INITIALIZING'`,
        [provider.name, row.payment_id],
      );
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new BadGatewayException('Payment provider initialization failed');
    }
  }

  async completeFromWebhook(
    rawPayload: unknown,
    headers: Record<string, string | string[] | undefined> = {},
  ) {
    const provider = await this.providers.getProvider();

    const verification = await provider.verifyWebhook({
      rawPayload,
      headers,
    });

    if (!verification.valid) {
      throw new BadRequestException('Invalid payment provider webhook');
    }

    const event = provider.parseWebhook(verification.rawPayload);

    if (!event.paymentReference || !event.providerReference) {
      throw new BadRequestException(
        'Payment webhook is missing required references',
      );
    }

    return this.db.withTransaction(async (client) => {
      const result = await client.query<PaymentSettlementRow>(
        `SELECT
           id payment_id,
           reference payment_reference,
           user_id payment_user_id,
           amount_minor payment_amount_minor,
           currency payment_currency,
           state payment_state,
           purpose payment_purpose,
           membership_program_id,
           provider_name payment_provider_name,
           provider_reference payment_provider_reference,
           deposit_id
         FROM payments
         WHERE reference = $1
         FOR UPDATE`,
        [event.paymentReference],
      );

      const payment = result.rows[0];

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.payment_purpose === 'MARKETPLACE_ORDER') {
        throw new ServiceUnavailableException(
          'Marketplace payment settlement is not available',
        );
      }

      if (
        payment.payment_provider_reference &&
        payment.payment_provider_reference !== event.providerReference
      ) {
        throw new ConflictException(
          'Payment provider reference does not match',
        );
      }

      if (
        Number(payment.payment_amount_minor) !== event.amountMinor ||
        payment.payment_currency !== event.currency
      ) {
        throw new ConflictException(
          'Payment amount or currency does not match',
        );
      }

      if (
        payment.payment_provider_name &&
        payment.payment_provider_name !== event.providerName
      ) {
        throw new ConflictException('Payment provider does not match');
      }

      if (payment.payment_state === 'SUCCESSFUL') {
        if (
          event.status === 'SUCCESS' &&
          payment.payment_purpose === 'BUSINESS_MEMBERSHIP'
        ) {
          await this.ensureMembershipEntitlement(client, payment);
        }
        return {
          status: 'SUCCESSFUL',
          paymentReference: payment.payment_reference,
          alreadyProcessed: true,
        };
      }

      let deposit: DepositSettlementRow | undefined;
      if (payment.payment_purpose === 'WALLET_FUNDING') {
        if (!payment.deposit_id) {
          throw new NotFoundException('Payment not found');
        }
        const depositResult = await client.query<DepositSettlementRow>(
          `SELECT id, wallet_id, amount_minor, currency, state
           FROM deposits
           WHERE id = $1
           FOR UPDATE`,
          [payment.deposit_id],
        );
        deposit = depositResult.rows[0];
        if (!deposit) {
          throw new NotFoundException('Payment not found');
        }
      }

      if (event.status === 'FAILED') {
        await client.query(
          `UPDATE payments
           SET state='FAILED',
               provider_status='FAILED',
               provider_metadata=$1
           WHERE id=$2`,
          [JSON.stringify(event.rawPayload), payment.payment_id],
        );

        if (deposit) {
          await client.query(
            `UPDATE deposits
             SET state='FAILED',
                 external_reference=$1
             WHERE id=$2`,
            [event.providerReference, deposit.id],
          );
        }

        return {
          status: 'FAILED',
          paymentReference: payment.payment_reference,
          alreadyProcessed: false,
        };
      }

      if (event.status !== 'SUCCESS') {
        return {
          status: 'PENDING',
          paymentReference: payment.payment_reference,
          alreadyProcessed: false,
        };
      }

      if (deposit) {
        await this.walletService.creditWithClient(
          client,
          payment.payment_user_id,
          deposit.wallet_id,
          {
            amountMinor: Number(deposit.amount_minor),
            currency: deposit.currency,
            idempotencyKey: `payment-deposit:${payment.payment_id}`,
            description: `Wallet funding ${payment.payment_reference}`,
          },
          'DEPOSIT',
        );
      }

      await client.query(
        `UPDATE payments
         SET state='SUCCESSFUL',
             provider_reference=$1,
             provider_status='SUCCESS',
             provider_metadata=$2
         WHERE id=$3`,
        [
          event.providerReference,
          JSON.stringify(event.rawPayload),
          payment.payment_id,
        ],
      );

      if (deposit) {
        await client.query(
          `UPDATE deposits
           SET state='SUCCESSFUL',
               external_reference=$1
           WHERE id=$2`,
          [event.providerReference, deposit.id],
        );
      }

      if (payment.payment_purpose === 'BUSINESS_MEMBERSHIP') {
        await this.ensureMembershipEntitlement(client, payment);
      }

      return {
        status: 'SUCCESSFUL',
        paymentReference: payment.payment_reference,
        alreadyProcessed: false,
      };
    });
  }

  private async ensureMembershipEntitlement(
    client: PoolClient,
    payment: PaymentSettlementRow,
  ): Promise<void> {
    if (!payment.membership_program_id) {
      throw new ConflictException(
        'Business membership payment has no membership program',
      );
    }

    const programResult = await client.query<MembershipValidityRow>(
      `SELECT validity_duration, validity_unit
       FROM business_membership_programs
       WHERE id = $1
       FOR SHARE`,
      [payment.membership_program_id],
    );
    const program = programResult.rows[0];

    if (!program) {
      throw new NotFoundException('Membership program not found');
    }

    const duration = program.validity_duration;
    const unit = program.validity_unit;
    const validUnits = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
    if (
      (duration === null) !== (unit === null) ||
      (duration !== null &&
        (duration <= 0 || unit === null || !validUnits.includes(unit)))
    ) {
      throw new InternalServerErrorException(
        'Membership program validity configuration is invalid',
      );
    }

    await client.query(
      `WITH grant_time AS (
         SELECT now() AS starts_at
       )
       INSERT INTO business_membership_entitlements (
         user_id,
         membership_program_id,
         payment_id,
         status,
         starts_at,
         expires_at
       )
       SELECT
         $1,
         $2,
         $3,
         'ACTIVE',
         grant_time.starts_at,
         CASE
           WHEN $4::integer IS NULL THEN NULL
           ELSE grant_time.starts_at + CASE $5::text
             WHEN 'DAY' THEN make_interval(days => $4::integer)
             WHEN 'WEEK' THEN make_interval(weeks => $4::integer)
             WHEN 'MONTH' THEN make_interval(months => $4::integer)
             WHEN 'YEAR' THEN make_interval(years => $4::integer)
           END
         END
       FROM grant_time
       ON CONFLICT (payment_id) DO NOTHING`,
      [
        payment.payment_user_id,
        payment.membership_program_id,
        payment.payment_id,
        duration,
        unit,
      ],
    );
  }

  private async lockMarketplaceOrder(
    client: PoolClient,
    userId: string,
    orderId: string,
  ): Promise<MarketplaceOrderPaymentSource> {
    const result = await client.query<MarketplaceOrderPaymentSource>(
      `SELECT id, customer_id, status, total_minor, currency
       FROM marketplace_orders
       WHERE id = $1 AND customer_id = $2
       FOR UPDATE`,
      [orderId, userId],
    );
    const order = result.rows[0];
    if (!order) {
      throw new NotFoundException('Marketplace order not found');
    }
    return order;
  }

  private validateMarketplaceOrderForPayment(
    order: MarketplaceOrderPaymentSource,
  ) {
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(
        'Marketplace order is not awaiting payment',
      );
    }

    const amountMinor = Number(order.total_minor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new BadRequestException(
        'Marketplace order total is not a valid payment amount',
      );
    }
    if (amountMinor === 0) {
      throw new BadRequestException(
        'Zero-total marketplace orders cannot be paid until a payment policy is defined',
      );
    }
  }

  private async findMarketplacePaymentForOrder(
    client: PoolClient,
    orderId: string,
  ): Promise<MarketplacePaymentRow | undefined> {
    const result = await client.query<MarketplacePaymentRow>(
      `SELECT
         id payment_id,
         reference payment_reference,
         user_id payment_user_id,
         amount_minor payment_amount_minor,
         currency payment_currency,
         state payment_state,
         purpose payment_purpose,
         provider_configuration_id payment_provider_configuration_id,
         provider_name payment_provider_name,
         provider_reference payment_provider_reference,
         provider_status payment_provider_status,
         provider_checkout_url payment_provider_checkout_url
       FROM payments
       WHERE marketplace_order_id = $1
       FOR UPDATE`,
      [orderId],
    );
    return result.rows[0];
  }

  private toReusableMarketplacePayment(row: MarketplacePaymentRow) {
    if (
      row.payment_purpose !== 'MARKETPLACE_ORDER' ||
      row.payment_state !== 'PENDING' ||
      row.payment_provider_status !== 'PENDING' ||
      !row.payment_provider_configuration_id ||
      !row.payment_provider_name ||
      !row.payment_provider_reference ||
      !row.payment_provider_checkout_url
    ) {
      throw new ConflictException(
        'A marketplace payment already exists and cannot be safely reused',
      );
    }

    return this.toMarketplacePaymentIntent(row);
  }

  private toMarketplacePaymentIntent(row: MarketplacePaymentRow) {
    return {
      payment: {
        id: row.payment_id,
        reference: row.payment_reference,
        userId: row.payment_user_id,
        purpose: row.payment_purpose,
        amountMinor: Number(row.payment_amount_minor),
        currency: row.payment_currency,
        state: row.payment_state,
      },
      provider: row.payment_provider_name && row.payment_provider_reference
        ? {
          name: row.payment_provider_name,
          reference: row.payment_provider_reference,
          status: row.payment_provider_status ?? 'PENDING',
        }
        : undefined,
      checkout: row.payment_provider_checkout_url
        ? { url: row.payment_provider_checkout_url }
        : undefined,
    };
  }

  private async findMembershipPaymentByIdempotencyKey(
    client: PoolClient,
    userId: string,
    idempotencyKey: string,
  ) {
    const result = await client.query<MembershipPaymentRow>(
      `SELECT
         id payment_id,
         reference payment_reference,
         user_id payment_user_id,
         amount_minor payment_amount_minor,
         currency payment_currency,
         state payment_state,
         purpose::text payment_purpose,
         membership_program_id,
         membership_billing_period::text membership_billing_period,
         provider_name payment_provider_name,
         provider_reference payment_provider_reference,
         provider_status payment_provider_status,
         provider_checkout_url payment_provider_checkout_url,
         created_at payment_created_at
       FROM payments
       WHERE user_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [userId, idempotencyKey],
    );
    return result.rows[0];
  }

  private validateExistingMembershipPayment(
    existing: MembershipPaymentRow,
    request: CreateMembershipPaymentDto,
  ) {
    if (
      existing.payment_purpose !== 'BUSINESS_MEMBERSHIP' ||
      existing.membership_program_id?.toLowerCase() !==
        request.membershipProgramId.toLowerCase() ||
      existing.membership_billing_period !== request.billingPeriod
    ) {
      throw new ConflictException(
        'Idempotency key was reused with a different request',
      );
    }
  }

  private toMembershipPaymentIntent(row: MembershipPaymentRow) {
    return {
      payment: {
        id: row.payment_id,
        reference: row.payment_reference,
        userId: row.payment_user_id,
        purpose: row.payment_purpose,
        membershipProgramId: row.membership_program_id,
        billingPeriod: row.membership_billing_period,
        amountMinor: Number(row.payment_amount_minor),
        currency: row.payment_currency,
        state: row.payment_state,
      },
      provider: row.payment_provider_name && row.payment_provider_reference
        ? {
          name: row.payment_provider_name,
          reference: row.payment_provider_reference,
          status: row.payment_provider_status ?? 'PENDING',
        }
        : undefined,
      checkout: row.payment_provider_checkout_url
        ? { url: row.payment_provider_checkout_url }
        : undefined,
    };
  }

  private callbackUrl() {
    const configured = this.config.get<string>('PAYMENT_CALLBACK_URL');
    if (configured) return configured;
    const apiBaseUrl = this.config.get<string>('API_BASE_URL') ?? `http://localhost:${this.config.get<number>('PORT', 3001)}/api/v1`;
    return `${apiBaseUrl.replace(/\/$/, '')}/payments/callback`;
  }

  private async lockWallet(client: PoolClient, userId: string, walletId: string) {
    const result = await client.query<WalletRow>(
      `SELECT id,user_id,currency,status FROM wallets WHERE id=$1 FOR UPDATE`,
      [walletId],
    );
    const wallet = result.rows[0];
    if (!wallet || wallet.user_id !== userId) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  private async findExisting(client: PoolClient, userId: string, idempotencyKey: string) {
    const result = await client.query<FundingIntentRow>(
      `SELECT p.id payment_id,p.reference payment_reference,p.user_id payment_user_id,
              p.amount_minor payment_amount_minor,p.currency payment_currency,p.state payment_state,
              p.idempotency_key payment_idempotency_key,p.created_at payment_created_at,
              p.provider_name payment_provider_name,p.provider_reference payment_provider_reference,
              p.provider_status payment_provider_status,p.provider_checkout_url payment_provider_checkout_url,
              d.id deposit_id,d.reference deposit_reference,d.wallet_id deposit_wallet_id,
              d.amount_minor deposit_amount_minor,d.currency deposit_currency,d.state deposit_state,
              d.created_at deposit_created_at
       FROM payments p JOIN deposits d ON d.id=p.deposit_id
       WHERE p.user_id=$1 AND p.idempotency_key=$2
       FOR UPDATE OF p,d`,
      [userId, idempotencyKey],
    );
    return result.rows[0];
  }

  private async findByPaymentId(client: PoolClient, paymentId: string) {
    const result = await client.query<FundingIntentRow>(
      `SELECT p.id payment_id,p.reference payment_reference,p.user_id payment_user_id,
              p.amount_minor payment_amount_minor,p.currency payment_currency,p.state payment_state,
              p.idempotency_key payment_idempotency_key,p.created_at payment_created_at,
              p.provider_name payment_provider_name,p.provider_reference payment_provider_reference,
              p.provider_status payment_provider_status,p.provider_checkout_url payment_provider_checkout_url,
              d.id deposit_id,d.reference deposit_reference,d.wallet_id deposit_wallet_id,
              d.amount_minor deposit_amount_minor,d.currency deposit_currency,d.state deposit_state,
              d.created_at deposit_created_at
       FROM payments p JOIN deposits d ON d.id=p.deposit_id WHERE p.id=$1`,
      [paymentId],
    );
    return result.rows[0];
  }

  private validateExisting(existing: FundingIntentRow, request: FundWalletDto) {
    if (
      existing.deposit_wallet_id !== request.walletId ||
      Number(existing.payment_amount_minor) !== request.amountMinor ||
      existing.payment_currency !== request.currency
    ) {
      throw new ConflictException('Idempotency key was reused with a different request');
    }
  }

  private toFundingIntent(row: FundingIntentRow) {
    return {
      payment: {
        id: row.payment_id,
        reference: row.payment_reference,
        userId: row.payment_user_id,
        depositId: row.deposit_id,
        amountMinor: Number(row.payment_amount_minor),
        currency: row.payment_currency,
        state: row.payment_state,
      },
      deposit: {
        id: row.deposit_id,
        reference: row.deposit_reference,
        walletId: row.deposit_wallet_id,
        amountMinor: Number(row.deposit_amount_minor),
        currency: row.deposit_currency,
        state: row.deposit_state,
      },
      provider: row.payment_provider_name && row.payment_provider_reference
        ? {
          name: row.payment_provider_name,
          reference: row.payment_provider_reference,
          status: row.payment_provider_status ?? 'PENDING',
        }
        : undefined,
      checkout: row.payment_provider_checkout_url
        ? { url: row.payment_provider_checkout_url }
        : undefined,
    };
  }
}