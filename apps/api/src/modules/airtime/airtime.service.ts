import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { WalletService } from '../wallets/wallet.service';
import { FeatureService } from '../features/feature.service';
import { AirtimeProviderRouterService } from '../providers/routing/airtime-provider-router.service';
import type { PurchaseAirtimeDto } from './airtime.dtos';

@Injectable()
export class AirtimeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly wallets: WalletService,
    private readonly features: FeatureService,
    private readonly providers: AirtimeProviderRouterService,
  ) {}

  async purchase(
  userId: string,
  dto: PurchaseAirtimeDto,
) {
  const featureEnabled =
    await this.features.isEnabled('AIRTIME_ENABLED');

  if (!featureEnabled) {
    throw new ServiceUnavailableException(
      'Airtime service is currently unavailable',
    );
  }

  if (!/^(0[789]\d{9})$/.test(dto.phoneNumber)) {
    throw new BadRequestException(
      'Enter a valid Nigerian phone number',
    );
  }

  const amountMinor = dto.amountMinor;
  const currency: CurrencyCode = 'NGN';

  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    throw new BadRequestException(
      'amountMinor must be a positive integer',
    );
  }

  /*
   * Check that the Airtime service exists and is operational.
   */
  const serviceResult = await this.db.query<{
    id: string;
    code: string;
    enabled: boolean;
  }>(
    `SELECT id, code, enabled
     FROM services
     WHERE code = 'AIRTIME'
     LIMIT 1`,
  );

  const service = serviceResult.rows[0];

  if (!service) {
    throw new ServiceUnavailableException(
      'Airtime service is not configured',
    );
  }

  if (!service.enabled) {
    throw new ServiceUnavailableException(
      'Airtime service is currently unavailable',
    );
  }

  /*
   * Find the customer's active NGN wallet.
   */
  const walletResult = await this.db.query<{
    id: string;
  }>(
    `SELECT id
     FROM wallets
     WHERE user_id = $1
       AND currency = $2
       AND wallet_kind = 'USER'
       AND status = 'ACTIVE'
     LIMIT 1`,
    [userId, currency],
  );

  const wallet = walletResult.rows[0];

  if (!wallet) {
    throw new ServiceUnavailableException(
      'NGN wallet is not available',
    );
  }

  /*
   * Prevent accidental duplicate purchases.
   */
  const existingResult = await this.db.query<{
    id: string;
    reference: string;
    state: string;
    amount_minor: string;
  }>(
    `SELECT id, reference, state, amount_minor
     FROM transactions
     WHERE user_id = $1
       AND idempotency_key = $2
     LIMIT 1`,
    [userId, dto.idempotencyKey],
  );

  const existing = existingResult.rows[0];

  if (existing) {
    if (BigInt(existing.amount_minor) !== BigInt(amountMinor)) {
      throw new BadRequestException(
        'Idempotency key was already used with a different amount',
      );
    }

    return {
      transactionId: existing.id,
      transactionReference: existing.reference,
      network: dto.network,
      phoneNumber: dto.phoneNumber,
      amountMinor,
      currency,
      status: existing.state,
    };
  }

  /*
   * Create the transaction in CREATED state.
   *
   * The provider is NOT called yet.
   */
  const transactionReference = `AIR-${randomUUID()}`;

  const transactionResult =
    await this.db.withTransaction(async (client) => {
      const transaction = await client.query<{
        id: string;
        reference: string;
      }>(
        `INSERT INTO transactions(
           reference,
           user_id,
           service_id,
           currency,
           amount_minor,
           fee_minor,
           commission_minor,
           state,
           idempotency_key,
           request_hash
         )
         VALUES(
           $1,
           $2,
           $3,
           $4,
           $5,
           0,
           0,
           'CREATED',
           $6,
           $7
         )
         RETURNING id, reference`,
        [
          transactionReference,
          userId,
          service.id,
          currency,
          amountMinor,
          dto.idempotencyKey,
          `${dto.network}:${dto.phoneNumber}:${amountMinor}`,
        ],
      );

      const created = transaction.rows[0];

      await client.query(
        `INSERT INTO airtime_transactions(
           transaction_id,
           network,
           phone_number,
           amount_minor
         )
         VALUES($1,$2,$3,$4)`,
        [
          created.id,
          dto.network,
          dto.phoneNumber,
          amountMinor,
        ],
      );

      return created;
    });

  /*
   * Hold the customer's money.
   *
   * WalletService owns its own database transaction.
   */
  try {
    const hold = await this.wallets.hold(
      userId,
      wallet.id,
      transactionResult.id,
      amountMinor,
      currency,
      `Airtime purchase ${transactionResult.reference}`,
    );

    /*
     * Only after the wallet hold succeeds do we mark
     * the transaction as FUNDS_HELD.
     */
    await this.db.query(
      `UPDATE transactions
       SET state = 'FUNDS_HELD',
           updated_at = now()
       WHERE id = $1
         AND state = 'CREATED'`,
      [transactionResult.id],
    );

    return {
      transactionId: transactionResult.id,
      transactionReference: transactionResult.reference,
      network: dto.network,
      phoneNumber: dto.phoneNumber,
      amountMinor,
      currency,
      status: hold.status === 'HELD'
        ? 'FUNDS_HELD'
        : hold.status,
    };
  } catch (error) {
    /*
     * The hold failed, so the transaction must not remain
     * in CREATED forever.
     */
    await this.db.query(
      `UPDATE transactions
       SET state = 'FAILED',
           failure_code = 'FUNDS_HOLD_FAILED',
           failure_message = $2,
           updated_at = now()
       WHERE id = $1
         AND state = 'CREATED'`,
      [
        transactionResult.id,
        error instanceof Error
          ? error.message
          : 'Unable to hold wallet funds',
      ],
    );

    throw error;
  }
}
}
