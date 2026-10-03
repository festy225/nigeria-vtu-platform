import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type {
  SubmitKycVerificationResponse,
  KycVerificationStatusResponse,
} from '../providers/interfaces/kyc-provider.interface';
import { KycProviderRouterService } from '../providers/routing/kyc-provider-router.service';
import {
  normalizeKycProviderDecision,
  type NormalizedKycResult,
  type KycVerificationRecord,
  type KycVerificationStatus,
} from './kyc.types';

interface KycRecordRow {
  id: string;
  seller_id: string;
  user_id: string;
  status: KycVerificationStatus;
  provider_reference: string | null;
  submitted_at: Date | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SellerRow {
  id: string;
  user_id: string;
  onboarding_status: string;
}

@Injectable()
export class KycService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly providers: KycProviderRouterService,
  ) {}

  async startForApprovedSeller(
    userId: string,
  ): Promise<KycVerificationRecord> {
    const sellerResult = await this.database.query<SellerRow>(
      `SELECT id, user_id, onboarding_status
       FROM marketplace_sellers
       WHERE user_id = $1`,
      [userId],
    );
    const seller = sellerResult.rows[0];

    if (!seller) {
      throw new NotFoundException('Seller application not found');
    }

    if (seller.onboarding_status !== 'APPROVED') {
      throw new ForbiddenException(
        'Seller application must be approved before KYC can start',
      );
    }

    const existing = await this.database.query<KycRecordRow>(
      `SELECT id, seller_id, user_id, status, provider_reference,
              submitted_at, verified_at, created_at, updated_at
       FROM kyc_verifications
       WHERE seller_id = $1 AND user_id = $2`,
      [seller.id, userId],
    );
    if (existing.rows[0]) {
      return this.mapRecord(existing.rows[0]);
    }

    let providerConfigurationId: string;
    try {
      const provider = await this.providers.getProvider();
      providerConfigurationId = provider.providerConfigurationId;
    } catch (error) {
      await this.audit.record({
        actorId: userId,
        action: 'KYC_PROVIDER_RESOLUTION_FAILED',
        resourceType: 'MARKETPLACE_SELLER_APPLICATION',
        resourceId: seller.id,
        afterData: { applicationStatus: seller.onboarding_status },
      });
      throw error;
    }

    return this.database.withTransaction(async (client) => {
      const lockedSellerResult = await client.query<SellerRow>(
        `SELECT id, user_id, onboarding_status
         FROM marketplace_sellers
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [seller.id, userId],
      );
      const lockedSeller = lockedSellerResult.rows[0];

      if (!lockedSeller) {
        throw new NotFoundException('Approved seller application not found');
      }

      if (lockedSeller.onboarding_status !== 'APPROVED') {
        throw new ForbiddenException(
          'Seller application must be approved before KYC can start',
        );
      }

      const existingResult = await client.query<KycRecordRow>(
        `SELECT id, seller_id, user_id, status, provider_reference,
                submitted_at, verified_at, created_at, updated_at
         FROM kyc_verifications
         WHERE seller_id = $1
         FOR UPDATE`,
        [lockedSeller.id],
      );
      if (existingResult.rows[0]) {
        return this.mapRecord(existingResult.rows[0]);
      }

      const insertResult = await client.query<KycRecordRow>(
        `INSERT INTO kyc_verifications (
           seller_id,
           user_id,
           status,
           provider_configuration_id
         )
         VALUES ($1, $2, 'PENDING', $3)
         ON CONFLICT (seller_id) DO NOTHING
         RETURNING id, seller_id, user_id, status, provider_reference,
                   submitted_at, verified_at, created_at, updated_at`,
        [lockedSeller.id, lockedSeller.user_id, providerConfigurationId],
      );
      let record = insertResult.rows[0];

      if (!record) {
        const concurrentResult = await client.query<KycRecordRow>(
          `SELECT id, seller_id, user_id, status, provider_reference,
                  submitted_at, verified_at, created_at, updated_at
           FROM kyc_verifications
           WHERE seller_id = $1
           FOR UPDATE`,
          [lockedSeller.id],
        );
        record = concurrentResult.rows[0];
        if (!record) {
          throw new ConflictException(
            'KYC verification was started concurrently; retry the request',
          );
        }
        return this.mapRecord(record);
      }

      await this.audit.record(
        {
          actorId: userId,
          action: 'KYC_VERIFICATION_STARTED',
          resourceType: 'KYC_VERIFICATION',
          resourceId: record.id,
          afterData: { status: record.status },
        },
        client,
      );

      return this.mapRecord(record);
    });
  }

  async getForAuthenticatedUser(
    userId: string,
  ): Promise<KycVerificationRecord> {
    const result = await this.database.query<KycRecordRow>(
      `SELECT verification.id, verification.seller_id, verification.user_id,
              verification.status, verification.provider_reference,
              verification.submitted_at, verification.verified_at,
              verification.created_at, verification.updated_at
       FROM kyc_verifications verification
       JOIN marketplace_sellers seller
         ON seller.id = verification.seller_id
       WHERE seller.user_id = $1
         AND verification.user_id = $1`,
      [userId],
    );
    const record = result.rows[0];

    if (!record) {
      throw new NotFoundException('KYC verification not found');
    }

    return this.mapRecord(record);
  }

  async recordSubmissionResult(
    verificationId: string,
    result: SubmitKycVerificationResponse,
  ): Promise<KycVerificationRecord> {
    if (!result.communicationSucceeded || !result.providerReference) {
      throw new ServiceUnavailableException(
        'KYC provider did not confirm submission',
      );
    }

    return this.updateProviderState(
      verificationId,
      'PENDING',
      result.providerReference,
      true,
    );
  }

  async recordVerificationResult(
    verificationId: string,
    result: KycVerificationStatusResponse,
  ): Promise<KycVerificationRecord> {
    if (!result.communicationSucceeded) {
      throw new ServiceUnavailableException(
        'KYC provider status could not be verified',
      );
    }

    const nextStatus = result.decision
      ? normalizeKycProviderDecision(result.decision)
      : undefined;

    if (!nextStatus) {
      return this.findRecord(verificationId);
    }

    return this.applyNormalizedResult(verificationId, {
      status: nextStatus,
      providerReference: result.providerReference,
      source: 'PROVIDER',
    });
  }

  async applyNormalizedResult(
    verificationId: string,
    result: NormalizedKycResult,
  ): Promise<KycVerificationRecord> {
    const validStatuses: KycVerificationStatus[] = [
      'PENDING',
      'IN_REVIEW',
      'VERIFIED',
      'REJECTED',
      'MORE_INFORMATION_REQUIRED',
    ];
    if (!validStatuses.includes(result.status)) {
      throw new BadRequestException('Invalid normalized KYC status');
    }
    if (
      result.providerReference !== undefined &&
      (!result.providerReference.trim() ||
        result.providerReference.length > 180)
    ) {
      throw new BadRequestException('Invalid KYC provider reference');
    }
    if (
      result.reasonCode !== undefined &&
      !/^[A-Z0-9_.-]{1,100}$/.test(result.reasonCode)
    ) {
      throw new BadRequestException('Invalid normalized KYC reason code');
    }

    return this.updateProviderState(
      verificationId,
      result.status,
      result.providerReference,
      false,
      result.source,
      result.reasonCode,
    );
  }

  private async updateProviderState(
    verificationId: string,
    status: KycVerificationStatus,
    providerReference: string | undefined,
    submitted: boolean,
    source: 'PROVIDER' | 'SYSTEM' = 'PROVIDER',
    reasonCode?: string,
  ): Promise<KycVerificationRecord> {
    return this.database.withTransaction(async (client) => {
      const current = await this.findRecordForUpdate(client, verificationId);

      const allowedTransitions: Record<
        KycVerificationStatus,
        KycVerificationStatus[]
      > = {
        PENDING: [
          'PENDING',
          'IN_REVIEW',
          'VERIFIED',
          'REJECTED',
          'MORE_INFORMATION_REQUIRED',
        ],
        IN_REVIEW: [
          'IN_REVIEW',
          'VERIFIED',
          'REJECTED',
          'MORE_INFORMATION_REQUIRED',
        ],
        VERIFIED: ['VERIFIED'],
        REJECTED: ['REJECTED'],
        MORE_INFORMATION_REQUIRED: [
          'IN_REVIEW',
          'VERIFIED',
          'REJECTED',
          'MORE_INFORMATION_REQUIRED',
        ],
      };
      if (!allowedTransitions[current.status].includes(status)) {
        throw new ConflictException(
          `Invalid KYC status transition from ${current.status} to ${status}`,
        );
      }

      if (status === 'VERIFIED') {
        const sellerResult = await client.query<{ onboarding_status: string }>(
          `SELECT onboarding_status
           FROM marketplace_sellers
           WHERE id = $1
           FOR SHARE`,
          [current.seller_id],
        );
        if (sellerResult.rows[0]?.onboarding_status !== 'APPROVED') {
          throw new ForbiddenException(
            'Only an approved seller application can have verified KYC',
          );
        }
      }

      const updatedResult = await client.query<KycRecordRow>(
        `UPDATE kyc_verifications
         SET status = $1,
             provider_reference = COALESCE($2, provider_reference),
             submitted_at = CASE
               WHEN $3::boolean THEN COALESCE(submitted_at, now())
               ELSE submitted_at
             END,
             verified_at = CASE
               WHEN $1 = 'VERIFIED' THEN COALESCE(verified_at, now())
               ELSE NULL
             END,
             updated_at = now()
         WHERE id = $4
         RETURNING id, seller_id, user_id, status, provider_reference,
                   submitted_at, verified_at, created_at, updated_at`,
        [status, providerReference ?? null, submitted, verificationId],
      );
      const record = updatedResult.rows[0];

      if (
        current.status !== record.status ||
        (providerReference !== undefined &&
          current.provider_reference !== record.provider_reference)
      ) {
        await this.audit.record(
          {
            action: 'KYC_VERIFICATION_STATUS_CHANGED',
            resourceType: 'KYC_VERIFICATION',
            resourceId: record.id,
            beforeData: { status: current.status },
            afterData: {
              status: record.status,
              source,
              ...(reasonCode ? { reasonCode } : {}),
            },
          },
          client,
        );
      }

      return this.mapRecord(record);
    });
  }

  private async findRecord(
    verificationId: string,
  ): Promise<KycVerificationRecord> {
    const result = await this.database.query<KycRecordRow>(
      `SELECT id, seller_id, user_id, status, provider_reference,
              submitted_at, verified_at, created_at, updated_at
       FROM kyc_verifications
       WHERE id = $1`,
      [verificationId],
    );
    const record = result.rows[0];

    if (!record) {
      throw new NotFoundException('KYC verification not found');
    }

    return this.mapRecord(record);
  }

  private async findRecordForUpdate(
    client: PoolClient,
    verificationId: string,
  ): Promise<KycRecordRow> {
    const result = await client.query<KycRecordRow>(
      `SELECT id, seller_id, user_id, status, provider_reference,
              submitted_at, verified_at, created_at, updated_at
       FROM kyc_verifications
       WHERE id = $1
       FOR UPDATE`,
      [verificationId],
    );
    const record = result.rows[0];

    if (!record) {
      throw new NotFoundException('KYC verification not found');
    }

    return record;
  }

  private mapRecord(record: KycRecordRow): KycVerificationRecord {
    return {
      id: record.id,
      sellerId: record.seller_id,
      userId: record.user_id,
      status: record.status,
      providerReference: record.provider_reference,
      submittedAt: record.submitted_at,
      verifiedAt: record.verified_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
