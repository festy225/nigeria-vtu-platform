import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { PaymentProviderRouterService } from '../providers/routing/payment-provider-router.service';
import type { FundWalletDto } from './dto/fund-wallet.dto';

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

@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly providers: PaymentProviderRouterService,
    private readonly config: ConfigService,
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