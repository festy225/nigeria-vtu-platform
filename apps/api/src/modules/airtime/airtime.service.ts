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

      await this.db.query(
        `UPDATE transactions
         SET state = 'FUNDS_HELD',
             updated_at = now()
         WHERE id = $1
           AND state = 'CREATED'`,
        [transactionResult.id],
      );

      await this.db.query(
        `INSERT INTO transaction_state_history(
           transaction_id,
           from_state,
           to_state,
           reason,
           changed_by
         )
         VALUES($1, 'CREATED', 'FUNDS_HELD', $2, $3)`,
        [
          transactionResult.id,
          'Wallet funds successfully held',
          userId,
        ],
      );

      const selectedProvider = await this.providers.getProvider();

      const attemptResult = await this.db.query<{
        id: string;
      }>(
        `INSERT INTO provider_attempts(
           transaction_id,
           provider_id,
           attempt_no,
           state,
           request_reference,
           request_payload
         )
         VALUES(
           $1,
           $2,
           1,
           'NOT_SENT',
           $3,
           $4::jsonb
         )
         RETURNING id`,
        [
          transactionResult.id,
          selectedProvider.providerId,
          transactionResult.reference,
          JSON.stringify({
            network: dto.network,
            phoneNumber: dto.phoneNumber,
            amountMinor,
            currency,
          }),
        ],
      );

      const attempt = attemptResult.rows[0];

      await this.db.query(
        `UPDATE provider_attempts
         SET state = 'SENT',
             submitted_at = now()
         WHERE id = $1
           AND state = 'NOT_SENT'`,
        [attempt.id],
      );

      await this.db.query(
        `UPDATE transactions
         SET state = 'SUBMITTED',
             updated_at = now()
         WHERE id = $1
           AND state = 'FUNDS_HELD'`,
        [transactionResult.id],
      );

      await this.db.query(
        `INSERT INTO transaction_state_history(
           transaction_id,
           from_state,
           to_state,
           reason,
           changed_by
         )
         VALUES($1, 'FUNDS_HELD', 'SUBMITTED', $2, $3)`,
        [
          transactionResult.id,
          `Submitted to provider ${selectedProvider.providerId}`,
          userId,
        ],
      );

      let providerResponse;

      try {
        providerResponse =
          await selectedProvider.provider.purchaseAirtime({
            transactionReference: transactionResult.reference,
            network: dto.network,
            phoneNumber: dto.phoneNumber,
            amountMinor,
            currency,
          });
      } catch (providerError) {
        await this.db.query(
          `UPDATE provider_attempts
           SET state = 'UNKNOWN',
               error_code = 'PROVIDER_REQUEST_UNKNOWN',
               response_metadata = $2::jsonb,
               completed_at = now()
           WHERE id = $1`,
          [
            attempt.id,
            JSON.stringify({
              error:
                providerError instanceof Error
                  ? providerError.message
                  : 'Unknown provider error',
            }),
          ],
        );

        await this.db.query(
          `UPDATE transactions
           SET state = 'UNKNOWN',
               failure_code = 'PROVIDER_REQUEST_UNKNOWN',
               failure_message = $2,
               updated_at = now()
           WHERE id = $1`,
          [
            transactionResult.id,
            providerError instanceof Error
              ? providerError.message
              : 'Provider request outcome is unknown',
          ],
        );

        await this.db.query(
          `INSERT INTO transaction_state_history(
             transaction_id,
             from_state,
             to_state,
             reason,
             changed_by
           )
           VALUES($1, 'SUBMITTED', 'UNKNOWN', $2, $3)`,
          [
            transactionResult.id,
            'Provider request outcome is unknown; reconciliation required',
            userId,
          ],
        );

        throw new ServiceUnavailableException(
          'Airtime provider response is currently unknown. Your funds remain held while the transaction is reconciled.',
        );
      }

      const providerMetadata = JSON.stringify({
        providerName: providerResponse.providerName,
        rawPayload: providerResponse.rawPayload,
      });

      if (providerResponse.status === 'SUCCESS') {
        await this.db.query(
          `UPDATE provider_attempts
           SET state = 'SUCCESS',
               provider_reference = $2,
               response_metadata = $3::jsonb,
               completed_at = now()
           WHERE id = $1`,
          [
            attempt.id,
            providerResponse.providerReference,
            providerMetadata,
          ],
        );

        try {
          await this.wallets.captureHold(
            userId,
            transactionResult.id,
          );
        } catch (captureError) {
          await this.db.query(
            `UPDATE transactions
             SET state = 'UNKNOWN',
                 failure_code = 'HOLD_CAPTURE_FAILED',
                 failure_message = $2,
                 provider_reference = $3,
                 updated_at = now()
             WHERE id = $1`,
            [
              transactionResult.id,
              captureError instanceof Error
                ? captureError.message
                : 'Unable to capture wallet hold',
              providerResponse.providerReference,
            ],
          );

          await this.db.query(
            `INSERT INTO transaction_state_history(
               transaction_id,
               from_state,
               to_state,
               reason,
               changed_by
             )
             VALUES($1, 'SUBMITTED', 'UNKNOWN', $2, $3)`,
            [
              transactionResult.id,
              'Provider succeeded but wallet hold capture requires reconciliation',
              userId,
            ],
          );

          throw new ServiceUnavailableException(
            'Airtime was accepted by the provider, but payment finalization requires reconciliation.',
          );
        }

        await this.db.query(
          `UPDATE transactions
           SET state = 'SUCCESSFUL',
               provider_reference = $2,
               updated_at = now()
           WHERE id = $1`,
          [
            transactionResult.id,
            providerResponse.providerReference,
          ],
        );

        await this.db.query(
          `INSERT INTO transaction_state_history(
             transaction_id,
             from_state,
             to_state,
             reason,
             changed_by
           )
           VALUES($1, 'SUBMITTED', 'SUCCESSFUL', $2, $3)`,
          [
            transactionResult.id,
            'Airtime provider completed the transaction successfully',
            userId,
          ],
        );

        return {
          transactionId: transactionResult.id,
          transactionReference: transactionResult.reference,
          network: dto.network,
          phoneNumber: dto.phoneNumber,
          amountMinor,
          currency,
          status: 'SUCCESSFUL',
          providerReference:
            providerResponse.providerReference,
        };
      }

      if (providerResponse.status === 'FAILED') {
        await this.db.query(
          `UPDATE provider_attempts
           SET state = 'FAILED',
               provider_reference = $2,
               response_metadata = $3::jsonb,
               completed_at = now()
           WHERE id = $1`,
          [
            attempt.id,
            providerResponse.providerReference,
            providerMetadata,
          ],
        );

        await this.wallets.releaseHold(
          userId,
          transactionResult.id,
        );

        await this.db.query(
          `UPDATE transactions
           SET state = 'FAILED',
               failure_code = 'PROVIDER_FAILED',
               failure_message = 'Airtime provider rejected the transaction',
               provider_reference = $2,
               updated_at = now()
           WHERE id = $1`,
          [
            transactionResult.id,
            providerResponse.providerReference,
          ],
        );

        await this.db.query(
          `INSERT INTO transaction_state_history(
             transaction_id,
             from_state,
             to_state,
             reason,
             changed_by
           )
           VALUES($1, 'SUBMITTED', 'FAILED', $2, $3)`,
          [
            transactionResult.id,
            'Airtime provider rejected the transaction and wallet funds were released',
            userId,
          ],
        );

        return {
          transactionId: transactionResult.id,
          transactionReference: transactionResult.reference,
          network: dto.network,
          phoneNumber: dto.phoneNumber,
          amountMinor,
          currency,
          status: 'FAILED',
          providerReference:
            providerResponse.providerReference,
        };
      }

      if (providerResponse.status === 'PROCESSING') {
        await this.db.query(
          `UPDATE provider_attempts
           SET state = 'PROCESSING',
               provider_reference = $2,
               response_metadata = $3::jsonb
           WHERE id = $1`,
          [
            attempt.id,
            providerResponse.providerReference,
            providerMetadata,
          ],
        );

        await this.db.query(
          `UPDATE transactions
           SET state = 'PROCESSING',
               provider_reference = $2,
               updated_at = now()
           WHERE id = $1`,
          [
            transactionResult.id,
            providerResponse.providerReference,
          ],
        );

        await this.db.query(
          `INSERT INTO transaction_state_history(
             transaction_id,
             from_state,
             to_state,
             reason,
             changed_by
           )
           VALUES($1, 'SUBMITTED', 'PROCESSING', $2, $3)`,
          [
            transactionResult.id,
            'Airtime provider is still processing the transaction',
            userId,
          ],
        );

        return {
          transactionId: transactionResult.id,
          transactionReference: transactionResult.reference,
          network: dto.network,
          phoneNumber: dto.phoneNumber,
          amountMinor,
          currency,
          status: 'PROCESSING',
          providerReference:
            providerResponse.providerReference,
        };
      }

      await this.db.query(
        `UPDATE provider_attempts
         SET state = 'UNKNOWN',
             provider_reference = $2,
             response_metadata = $3::jsonb,
             completed_at = now()
         WHERE id = $1`,
        [
          attempt.id,
          providerResponse.providerReference,
          providerMetadata,
        ],
      );

      await this.db.query(
        `UPDATE transactions
         SET state = 'UNKNOWN',
             failure_code = 'PROVIDER_UNKNOWN',
             provider_reference = $2,
             updated_at = now()
         WHERE id = $1`,
        [
          transactionResult.id,
          providerResponse.providerReference,
        ],
      );

      await this.db.query(
        `INSERT INTO transaction_state_history(
           transaction_id,
           from_state,
           to_state,
           reason,
           changed_by
         )
         VALUES($1, 'SUBMITTED', 'UNKNOWN', $2, $3)`,
        [
          transactionResult.id,
          'Provider returned an unknown transaction status',
          userId,
        ],
      );

      throw new ServiceUnavailableException(
        'Airtime transaction status is currently unknown and requires reconciliation.',
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to process airtime purchase';

      const currentStateResult =
        await this.db.query<{ state: string }>(
          `SELECT state
           FROM transactions
           WHERE id = $1`,
          [transactionResult.id],
        );

      const currentState = currentStateResult.rows[0]?.state;

      if (currentState === 'CREATED') {
        await this.db.query(
          `UPDATE transactions
           SET state = 'FAILED',
               failure_code = 'FUNDS_HOLD_FAILED',
               failure_message = $2,
               updated_at = now()
           WHERE id = $1`,
          [transactionResult.id, message],
        );
      }

      throw error;
    }
  }}