import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { PoolClient } from 'pg';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export interface MoneyRequest { amountMinor: number; currency: CurrencyCode; idempotencyKey: string; description?: string; }
export interface TransferRequest extends MoneyRequest { destinationWalletId: string; }

@Injectable()
export class WalletService {
  constructor(private readonly db: DatabaseService) {}

  async getBalances(userId: string) {
    const result = await this.db.query(`SELECT w.id,w.currency,w.status,COALESCE(b.available_minor,0) available_minor,COALESCE(b.held_minor,0) held_minor FROM wallets w LEFT JOIN wallet_balances b ON b.wallet_id=w.id WHERE w.user_id=$1 ORDER BY w.currency`, [userId]);
    return result.rows;
  }

  async getStatement(userId: string, currency?: CurrencyCode) {
    const result = await this.db.query(`SELECT lt.reference,lt.operation,lt.currency,le.entry_type,le.amount_minor,lt.description,lt.created_at FROM ledger_entries le JOIN ledger_transactions lt ON lt.id=le.ledger_transaction_id JOIN wallets w ON w.id=le.wallet_id WHERE w.user_id=$1 AND ($2::currency_code IS NULL OR lt.currency=$2) ORDER BY le.created_at DESC LIMIT 250`, [userId, currency ?? null]);
    return result.rows;
  }

  async transfer(userId: string, sourceWalletId: string, request: TransferRequest) {
    this.validateAmount(request);
    return this.db.withTransaction((client) => this.postTransfer(client, userId, sourceWalletId, request.destinationWalletId, request, 'TRANSFER'));
  }

  async credit(userId: string, walletId: string, request: MoneyRequest, operation: 'DEPOSIT' | 'REFUND' | 'COMMISSION' = 'DEPOSIT') {
    this.validateAmount(request);
    return this.db.withTransaction(async (client) => {
      const existing = await this.findIdempotent(client, userId, request.idempotencyKey, operation, request);
      if (existing) return existing;
      const wallet = await this.lockWallet(client, walletId, userId, request.currency);
      const system = await this.getSystemWallet(client, request.currency);
      const result = await this.postEntries(client, system.id, wallet.id, request.amountMinor, request, operation);
      await client.query(`UPDATE wallet_balances SET available_minor=available_minor+$1,version=version+1,updated_at=now() WHERE wallet_id=$2`, [request.amountMinor, wallet.id]);
      return this.saveIdempotency(client, userId, request, operation, result);
    });
  }

  async debit(userId: string, walletId: string, request: MoneyRequest, operation: 'WITHDRAWAL' | 'SERVICE_PURCHASE' = 'WITHDRAWAL') {
    this.validateAmount(request);
    return this.db.withTransaction(async (client) => {
      const existing = await this.findIdempotent(client, userId, request.idempotencyKey, operation, request);
      if (existing) return existing;
      const wallet = await this.lockWallet(client, walletId, userId, request.currency);
      const system = await this.getSystemWallet(client, request.currency);
      const balance = await client.query<{ available_minor: string }>(`SELECT available_minor FROM wallet_balances WHERE wallet_id=$1 FOR UPDATE`, [wallet.id]);
      if (BigInt(balance.rows[0]?.available_minor ?? 0) < BigInt(request.amountMinor)) throw new BadRequestException('Insufficient wallet balance');
      const result = await this.postEntries(client, wallet.id, system.id, request.amountMinor, request, operation);
      await client.query(`UPDATE wallet_balances SET available_minor=available_minor-$1,version=version+1,updated_at=now() WHERE wallet_id=$2`, [request.amountMinor, wallet.id]);
      return this.saveIdempotency(client, userId, request, operation, result);
    });
  }
  async hold(
    userId: string,
    walletId: string,
    transactionId: string,
    amountMinor: number,
    currency: CurrencyCode,
    description?: string,
  ) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestException(
        'amountMinor must be a positive integer',
      );
    }

    return this.db.withTransaction(async (client) => {
      const wallet = await this.lockWallet(
        client,
        walletId,
        userId,
        currency,
      );

      await client.query(
        `INSERT INTO wallet_balances(wallet_id)
         VALUES($1)
         ON CONFLICT DO NOTHING`,
        [wallet.id],
      );

      const balance = await client.query<{
        available_minor: string;
      }>(
        `SELECT available_minor
         FROM wallet_balances
         WHERE wallet_id=$1
         FOR UPDATE`,
        [wallet.id],
      );

      if (
        BigInt(balance.rows[0]?.available_minor ?? 0) <
        BigInt(amountMinor)
      ) {
        throw new BadRequestException(
          'Insufficient wallet balance',
        );
      }

      const existing = await client.query<{
        id: string;
        wallet_id: string;
        amount_minor: string;
        released_at: string | null;
        captured_at: string | null;
      }>(
        `SELECT id, wallet_id, amount_minor, released_at, captured_at
         FROM wallet_holds
         WHERE transaction_id=$1
         FOR UPDATE`,
        [transactionId],
      );

      if (existing.rows[0]) {
        const hold = existing.rows[0];

        if (
          hold.wallet_id !== wallet.id ||
          BigInt(hold.amount_minor) !== BigInt(amountMinor)
        ) {
          throw new ConflictException(
            'Transaction already has a different wallet hold',
          );
        }

        return {
          holdId: hold.id,
          transactionId,
          walletId: wallet.id,
          amountMinor,
          currency,
          status: hold.captured_at
            ? 'CAPTURED'
            : hold.released_at
              ? 'RELEASED'
              : 'HELD',
        };
      }

      await client.query(
        `UPDATE wallet_balances
         SET available_minor = available_minor - $1,
             held_minor = held_minor + $1,
             version = version + 1,
             updated_at = now()
         WHERE wallet_id = $2`,
        [amountMinor, wallet.id],
      );

      const result = await client.query<{ id: string }>(
        `INSERT INTO wallet_holds(
           wallet_id,
           transaction_id,
           amount_minor
         )
         VALUES($1,$2,$3)
         RETURNING id`,
        [wallet.id, transactionId, amountMinor],
      );

      return {
        holdId: result.rows[0].id,
        transactionId,
        walletId: wallet.id,
        amountMinor,
        currency,
        status: 'HELD',
      };
    });
  }

  async captureHold(
    userId: string,
    transactionId: string,
  ) {
    return this.db.withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        wallet_id: string;
        amount_minor: string;
        captured_at: string | null;
        released_at: string | null;
        currency: CurrencyCode;
      }>(
        `SELECT
           h.id,
           h.wallet_id,
           h.amount_minor,
           h.captured_at,
           h.released_at,
           w.currency
         FROM wallet_holds h
         JOIN wallets w ON w.id=h.wallet_id
         WHERE h.transaction_id=$1
           AND w.user_id=$2
         FOR UPDATE`,
        [transactionId, userId],
      );

      const hold = result.rows[0];

      if (!hold) {
        throw new NotFoundException(
          'Wallet hold not found',
        );
      }

      if (hold.captured_at) {
        return {
          holdId: hold.id,
          transactionId,
          amountMinor: Number(hold.amount_minor),
          currency: hold.currency,
          status: 'CAPTURED',
        };
      }

      if (hold.released_at) {
        throw new ConflictException(
          'Wallet hold has already been released',
        );
      }

      const balance = await client.query(
        `SELECT held_minor
         FROM wallet_balances
         WHERE wallet_id=$1
         FOR UPDATE`,
        [hold.wallet_id],
      );

      if (
        BigInt(balance.rows[0]?.held_minor ?? 0) <
        BigInt(hold.amount_minor)
      ) {
        throw new ConflictException(
          'Wallet held balance is inconsistent',
        );
      }

      await client.query(
        `UPDATE wallet_balances
         SET held_minor = held_minor - $1,
             version = version + 1,
             updated_at = now()
         WHERE wallet_id=$2`,
        [hold.amount_minor, hold.wallet_id],
      );

      await client.query(
        `UPDATE wallet_holds
         SET captured_at=now()
         WHERE id=$1`,
        [hold.id],
      );

      return {
        holdId: hold.id,
        transactionId,
        amountMinor: Number(hold.amount_minor),
        currency: hold.currency,
        status: 'CAPTURED',
      };
    });
  }

  async releaseHold(
    userId: string,
    transactionId: string,
  ) {
    return this.db.withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        wallet_id: string;
        amount_minor: string;
        captured_at: string | null;
        released_at: string | null;
        currency: CurrencyCode;
      }>(
        `SELECT
           h.id,
           h.wallet_id,
           h.amount_minor,
           h.captured_at,
           h.released_at,
           w.currency
         FROM wallet_holds h
         JOIN wallets w ON w.id=h.wallet_id
         WHERE h.transaction_id=$1
           AND w.user_id=$2
         FOR UPDATE`,
        [transactionId, userId],
      );

      const hold = result.rows[0];

      if (!hold) {
        throw new NotFoundException(
          'Wallet hold not found',
        );
      }

      if (hold.released_at) {
        return {
          holdId: hold.id,
          transactionId,
          amountMinor: Number(hold.amount_minor),
          currency: hold.currency,
          status: 'RELEASED',
        };
      }

      if (hold.captured_at) {
        throw new ConflictException(
          'Wallet hold has already been captured',
        );
      }

      const balance = await client.query(
        `SELECT held_minor
         FROM wallet_balances
         WHERE wallet_id=$1
         FOR UPDATE`,
        [hold.wallet_id],
      );

      if (
        BigInt(balance.rows[0]?.held_minor ?? 0) <
        BigInt(hold.amount_minor)
      ) {
        throw new ConflictException(
          'Wallet held balance is inconsistent',
        );
      }

      await client.query(
        `UPDATE wallet_balances
         SET available_minor = available_minor + $1,
             held_minor = held_minor - $1,
             version = version + 1,
             updated_at = now()
         WHERE wallet_id=$2`,
        [hold.amount_minor, hold.wallet_id],
      );

      await client.query(
        `UPDATE wallet_holds
         SET released_at=now()
         WHERE id=$1`,
        [hold.id],
      );

      return {
        holdId: hold.id,
        transactionId,
        amountMinor: Number(hold.amount_minor),
        currency: hold.currency,
        status: 'RELEASED',
      };
    });
  }
  async reverse(userId: string, originalReference: string, idempotencyKey: string, reason?: string) {
    return this.db.withTransaction(async (client) => {
      const original = await client.query<{ id: string; currency: CurrencyCode; amount_minor: string; operation: string; wallet_id: string; user_id: string }>(`SELECT lt.id,lt.currency,le.amount_minor,lt.operation,le.wallet_id,w.user_id FROM ledger_transactions lt JOIN ledger_entries le ON le.ledger_transaction_id=lt.id JOIN wallets w ON w.id=le.wallet_id WHERE lt.reference=$1 AND le.entry_type='DEBIT'`, [originalReference]);
      if (!original.rows[0] || original.rows[0].user_id !== userId) throw new NotFoundException('Original transaction not found');
      return this.credit(userId, original.rows[0].wallet_id, { amountMinor: Number(original.rows[0].amount_minor), currency: original.rows[0].currency, idempotencyKey, description: reason ?? `Reversal of ${originalReference}` }, 'REFUND');
    });
  }

  private async postTransfer(client: PoolClient, userId: string, sourceId: string, destinationId: string, request: TransferRequest, operation: 'TRANSFER') {
    const existing = await this.findIdempotent(client, userId, request.idempotencyKey, operation, request);
    if (existing) return existing;
   const source = await this.lockWallet(
  client,
  sourceId,
  userId,
  request.currency,
);

const destination = await this.lockWallet(
  client,
  destinationId,
  undefined,
  request.currency,
  'USER',
);
    const balance = await client.query<{ available_minor: string }>(`SELECT available_minor FROM wallet_balances WHERE wallet_id=$1 FOR UPDATE`, [source.id]);
    if (BigInt(balance.rows[0]?.available_minor ?? 0) < BigInt(request.amountMinor)) throw new BadRequestException('Insufficient wallet balance');
    const result = await this.postEntries(client, source.id, destination.id, request.amountMinor, request, operation);
    await client.query(`UPDATE wallet_balances SET available_minor=available_minor-$1,version=version+1,updated_at=now() WHERE wallet_id=$2`, [request.amountMinor, source.id]);
    await client.query(`UPDATE wallet_balances SET available_minor=available_minor+$1,version=version+1,updated_at=now() WHERE wallet_id=$2`, [request.amountMinor, destination.id]);
    return this.saveIdempotency(client, userId, request, operation, result);
  }

  private async postEntries(client: PoolClient, debitWalletId: string, creditWalletId: string, amount: number, request: MoneyRequest, operation: string) {
    const reference = `WAL-${randomUUID()}`;
    const tx = await client.query<{ id: string }>(`INSERT INTO ledger_transactions(reference,operation,currency,source_type,description) VALUES($1,$2::wallet_operation,$3,$4,$5) RETURNING id`, [reference, operation, request.currency, 'WALLET_API', request.description ?? null]);
    await client.query(`INSERT INTO ledger_entries(ledger_transaction_id,wallet_id,entry_type,amount_minor) VALUES($1,$2,'DEBIT',$3),($1,$4,'CREDIT',$3)`, [tx.rows[0].id, debitWalletId, amount, creditWalletId]);
    return { reference, ledgerTransactionId: tx.rows[0].id, amountMinor: amount, currency: request.currency, status: 'SUCCESSFUL' };
  }

  private async lockWallet(
  client: PoolClient,
  walletId: string,
  userId: string | undefined,
  currency: CurrencyCode,
  walletKind?: 'USER' | 'SYSTEM',
) {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM wallets
     WHERE id=$1
       AND currency=$2
       AND status='ACTIVE'
       AND ($3::uuid IS NULL OR user_id=$3)
       AND ($4::varchar IS NULL OR wallet_kind=$4)
     FOR UPDATE`,
    [walletId, currency, userId ?? null, walletKind ?? null],
  );

  if (!result.rows[0]) {
    throw new NotFoundException('Active wallet not found');
  }

  await client.query(
    `INSERT INTO wallet_balances(wallet_id)
     VALUES($1)
     ON CONFLICT DO NOTHING`,
    [walletId],
  );

  return result.rows[0];
}

  private async getSystemWallet(client: PoolClient, currency: CurrencyCode) {
    const result = await client.query<{ id: string }>(`SELECT id FROM wallets WHERE wallet_kind='SYSTEM' AND currency=$1 AND status='ACTIVE' FOR UPDATE`, [currency]);
    if (!result.rows[0]) throw new BadRequestException(`No active ${currency} settlement wallet configured`);
    await client.query(`INSERT INTO wallet_balances(wallet_id) VALUES($1) ON CONFLICT DO NOTHING`, [result.rows[0].id]);
    return result.rows[0];
  }

  private async findIdempotent(client: PoolClient, userId: string, key: string, operation: string, request: MoneyRequest) {
    const hash = this.hash(request);
    const result = await client.query<{ request_hash: string; response: unknown }>(`SELECT request_hash,response FROM wallet_idempotency WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [userId, key]);
    if (!result.rows[0]) return null;
    if (result.rows[0].request_hash !== hash) throw new ConflictException('Idempotency key was reused with a different request');
    return result.rows[0].response;
  }

  private async saveIdempotency(client: PoolClient, userId: string, request: MoneyRequest, operation: string, response: unknown) {
    await client.query(`INSERT INTO wallet_idempotency(user_id,idempotency_key,operation,request_hash,response) VALUES($1,$2,$3,$4,$5)`, [userId, request.idempotencyKey, operation, this.hash(request), JSON.stringify(response)]);
    return response;
  }

  private hash(request: MoneyRequest) { return createHash('sha256').update(JSON.stringify({ amountMinor: request.amountMinor, currency: request.currency, description: request.description ?? null })).digest('hex'); }
  private validateAmount(request: MoneyRequest) { if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) throw new BadRequestException('amountMinor must be a positive integer'); if (!request.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required'); }
}
