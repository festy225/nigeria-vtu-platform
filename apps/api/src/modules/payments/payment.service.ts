import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';
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
  constructor(private readonly db: DatabaseService) {}

  async createFundingIntent(userId: string, request: FundWalletDto) {
    if (!request.idempotencyKey.trim()) throw new BadRequestException('idempotencyKey is required');
    return this.db.withTransaction(async (client) => {
      const existing = await this.findExisting(client, userId, request.idempotencyKey);
      if (existing) return this.resolveExisting(existing, request);

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
        `INSERT INTO payments(reference,user_id,deposit_id,amount_minor,currency,state,idempotency_key)
         VALUES($1,$2,$3,$4,$5,'PENDING',$6)
         ON CONFLICT (user_id,idempotency_key) DO NOTHING
         RETURNING id`,
        [`PAY-${randomUUID()}`, userId, depositId, request.amountMinor, request.currency, request.idempotencyKey],
      );

      if (!payment.rows[0]) {
        await client.query('DELETE FROM deposits WHERE id=$1', [depositId]);
        const concurrent = await this.findExisting(client, userId, request.idempotencyKey);
        if (!concurrent) throw new ConflictException('Unable to resolve idempotent payment request');
        return this.resolveExisting(concurrent, request);
      }

      const created = await this.findByPaymentId(client, payment.rows[0].id);
      if (!created) throw new ConflictException('Unable to load created payment');
      return this.toFundingIntent(created);
    });
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
              d.id deposit_id,d.reference deposit_reference,d.wallet_id deposit_wallet_id,
              d.amount_minor deposit_amount_minor,d.currency deposit_currency,d.state deposit_state,
              d.created_at deposit_created_at
       FROM payments p JOIN deposits d ON d.id=p.deposit_id WHERE p.id=$1`,
      [paymentId],
    );
    return result.rows[0];
  }

  private resolveExisting(existing: FundingIntentRow, request: FundWalletDto) {
    if (
      existing.deposit_wallet_id !== request.walletId ||
      Number(existing.payment_amount_minor) !== request.amountMinor ||
      existing.payment_currency !== request.currency
    ) {
      throw new ConflictException('Idempotency key was reused with a different request');
    }
    return this.toFundingIntent(existing);
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
        idempotencyKey: row.payment_idempotency_key,
        createdAt: row.payment_created_at,
      },
      deposit: {
        id: row.deposit_id,
        reference: row.deposit_reference,
        walletId: row.deposit_wallet_id,
        amountMinor: Number(row.deposit_amount_minor),
        currency: row.deposit_currency,
        state: row.deposit_state,
        createdAt: row.deposit_created_at,
      },
    };
  }
}