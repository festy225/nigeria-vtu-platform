import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateSellerApplicationDto,
  ReviewSellerApplicationDto,
} from './seller.dtos';
import type { CreateMarketplaceProductDto } from './dto/create-marketplace-product.dto';
import type { UpdateMarketplaceProductDto } from './dto/update-marketplace-product.dto';

interface SellerReviewRow {
  id: string;
  user_id: string;
  onboarding_status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'MORE_INFORMATION_REQUIRED'
    | 'APPROVED'
    | 'SUSPENDED'
    | 'REJECTED';
}

interface EditableMarketplaceProductRow extends MarketplaceProductRow {
  has_variants: boolean;
}

export interface SellerReviewResult extends SellerReviewRow {
  reviewed_by: string;
  reviewed_at: Date;
}

export interface MarketplaceProductRow {
  id: string;
  seller_id: string;
  category_id: string;
  name: string;
  description: string;
  price_minor: string | number | null;
  currency: CurrencyCode | null;
  status: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class SellerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async isSellerApplicationEligible(userId: string): Promise<boolean> {
    const result = await this.database.query<{ eligible: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM business_membership_programs program
         JOIN business_membership_entitlements entitlement
           ON entitlement.membership_program_id = program.id
         WHERE program.program_code = 'SELLER'
           AND program.enabled = true
           AND entitlement.user_id = $1
           AND entitlement.status = 'ACTIVE'
           AND (
             entitlement.expires_at IS NULL
             OR entitlement.expires_at > now()
           )
           AND EXISTS (
             SELECT 1
             FROM business_membership_terms_acceptances acceptance
             WHERE acceptance.user_id = entitlement.user_id
               AND acceptance.membership_program_id = program.id
               AND acceptance.terms_version = program.terms_version
           )
       ) AS eligible`,
      [userId],
    );

    return result.rows[0]?.eligible ?? false;
  }

  async listApplications() {
    const result = await this.database.query(
      `SELECT
        id,
        user_id,
        seller_type,
        business_name,
        store_name,
        store_slug,
        onboarding_status,
        kyc_status,
        risk_status,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
       FROM marketplace_sellers
       ORDER BY created_at DESC, id DESC`,
    );

    return result.rows;
  }

  async createProduct(
    userId: string,
    dto: CreateMarketplaceProductDto,
  ): Promise<MarketplaceProductRow> {
    const name = dto.name.trim();
    const description = dto.description.trim();
    if (!name || !description) {
      throw new ConflictException('Product name and description are required');
    }
    this.validatePrice(dto.priceMinor);

    return this.database.withTransaction(async (client) => {
      const sellerResult = await client.query<{ id: string }>(
        `SELECT id
         FROM marketplace_sellers
         WHERE user_id = $1`,
        [userId],
      );
      const seller = sellerResult.rows[0];

      if (!seller) {
        throw new NotFoundException('Seller application not found');
      }

      const categoryResult = await client.query<{ id: string }>(
        `SELECT id
         FROM marketplace_product_categories
         WHERE id = $1 AND enabled = true`,
        [dto.categoryId],
      );
      if (!categoryResult.rows[0]) {
        throw new NotFoundException('Product category not found');
      }
      await this.requireCurrency(client, dto.currency);

      const result = await client.query<MarketplaceProductRow>(
        `INSERT INTO marketplace_products (
           seller_id,
           category_id,
           name,
           description,
           price_minor,
           currency
         )
         VALUES ($1, $2, $3, $4, $5, $6::currency_code)
         RETURNING id, seller_id, category_id, name, description,
                   price_minor, currency, status, enabled,
                   created_at, updated_at`,
        [
          seller.id,
          dto.categoryId,
          name,
          description,
          dto.priceMinor,
          dto.currency,
        ],
      );
      const product = result.rows[0];

      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_PRODUCT_CREATED',
          resourceType: 'MARKETPLACE_PRODUCT',
          resourceId: product.id,
          afterData: {
            sellerId: seller.id,
            categoryId: product.category_id,
            priceMinor: product.price_minor,
            currency: product.currency,
            status: product.status,
          },
        },
        client,
      );

      return product;
    });
  }

  async listSellerProducts(userId: string) {
    const result = await this.database.query<MarketplaceProductRow>(
      `SELECT product.id, product.seller_id, product.category_id,
              product.name, product.description,
              product.price_minor, product.currency, product.status,
              product.enabled, product.created_at, product.updated_at
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1
       ORDER BY product.created_at DESC, product.id DESC`,
      [userId],
    );
    return result.rows;
  }

  async getSellerProduct(userId: string, productId: string) {
    const result = await this.database.query<MarketplaceProductRow>(
      `SELECT product.id, product.seller_id, product.category_id,
              product.name, product.description,
              product.price_minor, product.currency, product.status,
              product.enabled, product.created_at, product.updated_at
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1 AND product.id = $2`,
      [userId, productId],
    );
    const product = result.rows[0];

    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }
    return product;
  }

  async updateSellerProduct(
    userId: string,
    productId: string,
    dto: UpdateMarketplaceProductDto,
  ): Promise<MarketplaceProductRow> {
    if (
      dto.name !== undefined && !dto.name.trim() ||
      dto.description !== undefined && !dto.description.trim()
    ) {
      throw new ConflictException('Product name and description are required');
    }
    if (dto.priceMinor !== undefined) {
      this.validatePrice(dto.priceMinor);
    }

    return this.database.withTransaction(async (client) => {
      const currentResult = await client.query<EditableMarketplaceProductRow>(
        `SELECT product.id, product.seller_id, product.category_id,
                product.name, product.description,
                product.price_minor, product.currency, product.status,
                EXISTS (
                  SELECT 1
                  FROM marketplace_product_variants variant
                  WHERE variant.product_id = product.id
                ) AS has_variants,
                product.enabled, product.created_at, product.updated_at
         FROM marketplace_products product
         JOIN marketplace_sellers seller ON seller.id = product.seller_id
         WHERE seller.user_id = $1 AND product.id = $2
         FOR UPDATE OF product`,
        [userId, productId],
      );
      const current = currentResult.rows[0];

      if (!current) {
        throw new NotFoundException('Marketplace product not found');
      }

      const pricingRequested =
        dto.priceMinor !== undefined || dto.currency !== undefined;
      if (pricingRequested && current.has_variants) {
        throw new ConflictException(
          'Variant products must use variant-level pricing',
        );
      }
      if (dto.currency !== undefined) {
        await this.requireCurrency(client, dto.currency);
      }
      const priceMinor =
        dto.priceMinor ??
        (current.price_minor === null
          ? null
          : this.toSafeMinor(current.price_minor));
      const currency = dto.currency ?? current.currency;
      if ((priceMinor === null) !== (currency === null)) {
        throw new ConflictException(
          'A marketplace product price requires both amount and currency',
        );
      }

      const categoryId = dto.categoryId ?? current.category_id;
      if (dto.categoryId) {
        if (dto.categoryId !== current.category_id) {
          const assignmentsResult = await client.query<{ has_assignments: boolean }>(
            `SELECT EXISTS (
               SELECT 1
               FROM marketplace_product_attribute_assignments
               WHERE product_id = $1
             ) AS has_assignments`,
            [productId],
          );
          if (assignmentsResult.rows[0]?.has_assignments) {
            throw new ConflictException(
              'Remove product attribute assignments before changing its category',
            );
          }
        }

        const categoryResult = await client.query<{ id: string }>(
          `SELECT id
           FROM marketplace_product_categories
           WHERE id = $1 AND enabled = true`,
          [dto.categoryId],
        );
        if (!categoryResult.rows[0]) {
          throw new NotFoundException('Product category not found');
        }
      }

      const result = await client.query<MarketplaceProductRow>(
        `UPDATE marketplace_products
         SET category_id = $1,
             name = $2,
             description = $3,
             price_minor = $4,
             currency = $5::currency_code,
             updated_at = now()
         WHERE id = $6 AND seller_id = $7
         RETURNING id, seller_id, category_id, name, description,
                   price_minor, currency, status, enabled,
                   created_at, updated_at`,
        [
          categoryId,
          dto.name?.trim() ?? current.name,
          dto.description?.trim() ?? current.description,
          priceMinor,
          currency,
          productId,
          current.seller_id,
        ],
      );
      const product = result.rows[0];

      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_PRODUCT_UPDATED',
          resourceType: 'MARKETPLACE_PRODUCT',
          resourceId: product.id,
          beforeData: {
            categoryId: current.category_id,
            name: current.name,
            priceMinor: current.price_minor,
            currency: current.currency,
            status: current.status,
          },
          afterData: {
            categoryId: product.category_id,
            name: product.name,
            priceMinor: product.price_minor,
            currency: product.currency,
            status: product.status,
          },
        },
        client,
      );

      return product;
    });
  }

  async reviewApplication(
    applicationId: string,
    reviewerId: string,
    dto: ReviewSellerApplicationDto,
  ): Promise<SellerReviewResult> {
    return this.database.withTransaction(async (client) => {
      const applicationResult = await client.query<SellerReviewRow>(
        `SELECT id, user_id, onboarding_status
         FROM marketplace_sellers
         WHERE id = $1
         FOR UPDATE`,
        [applicationId],
      );
      const application = applicationResult.rows[0];

      if (!application) {
        throw new NotFoundException('Seller application not found');
      }

      const nextStatus = this.reviewStatus(
        application.onboarding_status,
        dto.decision,
      );
      const updateResult = await client.query<SellerReviewResult>(
        `UPDATE marketplace_sellers
         SET onboarding_status = $1,
             reviewed_by = $2,
             reviewed_at = now(),
             updated_at = now()
         WHERE id = $3
           AND onboarding_status = $4
         RETURNING
           id,
           user_id,
           onboarding_status,
           reviewed_by,
           reviewed_at`,
        [
          nextStatus,
          reviewerId,
          applicationId,
          application.onboarding_status,
        ],
      );
      const reviewedApplication = updateResult.rows[0];

      if (!reviewedApplication) {
        throw new ConflictException(
          'Seller application changed while it was being reviewed',
        );
      }

      await this.audit.record(
        {
          actorId: reviewerId,
          action: 'SELLER_APPLICATION_REVIEWED',
          resourceType: 'MARKETPLACE_SELLER_APPLICATION',
          resourceId: application.id,
          beforeData: { onboardingStatus: application.onboarding_status },
          afterData: {
            onboardingStatus: reviewedApplication.onboarding_status,
            reviewedBy: reviewerId,
            reviewedAt: reviewedApplication.reviewed_at,
            decision: dto.decision,
          },
          reason: dto.reviewNote?.trim() || undefined,
        },
        client,
      );

      return reviewedApplication;
    });
  }

  async createApplication(
    userId: string,
    dto: CreateSellerApplicationDto,
  ) {
    if (!(await this.isSellerApplicationEligible(userId))) {
      throw new ForbiddenException(
        'An active SELLER membership and acceptance of the current SELLER terms are required to apply',
      );
    }

    const existing = await this.database.query(
      `SELECT id
       FROM marketplace_sellers
       WHERE user_id = $1`,
      [userId],
    );

    if (existing.rowCount) {
      throw new ConflictException(
        'A marketplace seller application already exists for this account',
      );
    }

    const storeSlug =
      dto.storeSlug?.trim().toLowerCase() ??
      this.buildSlug(dto.storeName);

    const duplicateSlug = await this.database.query(
      `SELECT id
       FROM marketplace_sellers
       WHERE store_slug = $1`,
      [storeSlug],
    );

    if (duplicateSlug.rowCount) {
      throw new ConflictException(
        'That store slug is already in use',
      );
    }

    const result = await this.database.query(
      `INSERT INTO marketplace_sellers (
        user_id,
        seller_type,
        business_name,
        store_name,
        store_slug,
        onboarding_status,
        kyc_status,
        risk_status
      )
      VALUES ($1, $2, $3, $4, $5, 'SUBMITTED', 'PENDING', 'NORMAL')
      RETURNING
        id,
        user_id,
        seller_type,
        business_name,
        store_name,
        store_slug,
        onboarding_status,
        kyc_status,
        risk_status,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at`,
      [
        userId,
        dto.sellerType,
        dto.businessName.trim(),
        dto.storeName.trim(),
        storeSlug,
      ],
    );

    return result.rows[0];
  }

  async getApplication(userId: string) {
    const result = await this.database.query(
      `SELECT
        id,
        user_id,
        seller_type,
        business_name,
        store_name,
        store_slug,
        onboarding_status,
        kyc_status,
        risk_status,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
       FROM marketplace_sellers
       WHERE user_id = $1`,
      [userId],
    );

    if (!result.rowCount) {
      throw new NotFoundException(
        'Marketplace seller application not found',
      );
    }

    return result.rows[0];
  }

  private reviewStatus(
    currentStatus: SellerReviewRow['onboarding_status'],
    decision: ReviewSellerApplicationDto['decision'],
  ): SellerReviewRow['onboarding_status'] {
    const transitions: Record<
      SellerReviewRow['onboarding_status'],
      Partial<Record<ReviewSellerApplicationDto['decision'], SellerReviewRow['onboarding_status']>>
    > = {
      DRAFT: {},
      SUBMITTED: {
        START_REVIEW: 'UNDER_REVIEW',
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        MORE_INFORMATION_REQUIRED: 'MORE_INFORMATION_REQUIRED',
      },
      UNDER_REVIEW: {
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        MORE_INFORMATION_REQUIRED: 'MORE_INFORMATION_REQUIRED',
      },
      MORE_INFORMATION_REQUIRED: {
        START_REVIEW: 'UNDER_REVIEW',
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        MORE_INFORMATION_REQUIRED: 'MORE_INFORMATION_REQUIRED',
      },
      APPROVED: {},
      SUSPENDED: {},
      REJECTED: {},
    };
    const nextStatus = transitions[currentStatus][decision];

    if (!nextStatus) {
      throw new ConflictException(
        `Cannot apply decision ${decision} to a seller application in ${currentStatus} status`,
      );
    }

    return nextStatus;
  }

  private buildSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug.slice(0, 220);
  }

  private validatePrice(priceMinor: number): void {
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) {
      throw new BadRequestException(
        'priceMinor must be a non-negative safe integer',
      );
    }
  }

  private toSafeMinor(value: string | number): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new BadRequestException(
        'Stored marketplace product price is outside the supported integer range',
      );
    }
    return amount;
  }

  private async requireCurrency(
    client: PoolClient,
    currency: CurrencyCode,
  ): Promise<void> {
    const result = await client.query<{ valid: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_enum
         WHERE enumtypid = 'currency_code'::regtype
           AND enumlabel = $1
       ) AS valid`,
      [currency],
    );
    if (!result.rows[0]?.valid) {
      throw new BadRequestException('Currency is not supported');
    }
  }
}
