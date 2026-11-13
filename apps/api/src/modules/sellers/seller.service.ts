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
import type { CreateSellerLocationDto } from './dto/create-seller-location.dto';
import type { ReviewMarketplaceProductDto } from './dto/review-marketplace-product.dto';

interface SellerReviewRow {
  id: string;
  user_id: string;
  business_registration_status: string | null;
  kyc_status: string;
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
  image_url: string | null;
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
         JOIN payments payment
           ON payment.id = entitlement.payment_id
          AND payment.user_id = entitlement.user_id
          AND payment.membership_program_id = entitlement.membership_program_id
         WHERE program.program_code = 'SELLER'
           AND program.enabled = true
           AND entitlement.user_id = $1
           AND entitlement.status = 'ACTIVE'
           AND entitlement.starts_at <= now()
           AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now())
           AND payment.purpose = 'BUSINESS_MEMBERSHIP'
           AND payment.state = 'SUCCESSFUL'
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

  async activateSellerMembership(userId: string) {
    return this.database.withTransaction(async (client) => {
      const entitlement = await this.requireVerifiedMembership(
        client,
        userId,
        'SELLER',
      );
      await this.audit.record(
        {
          actorId: userId,
          action: 'SELLER_MEMBERSHIP_ACTIVATED',
          resourceType: 'USER',
          resourceId: userId,
          afterData: { membershipPaymentId: entitlement.payment_id },
        },
        client,
      );
      return { active: true, sellerType: 'SELLER' as const };
    });
  }

  async activateWholesalerUpgrade(userId: string) {
    return this.activateSellerUpgrade(userId, 'WHOLESALER');
  }

  async activateDistributorUpgrade(userId: string) {
    return this.activateSellerUpgrade(userId, 'DISTRIBUTOR');
  }

  private async activateSellerUpgrade(
    userId: string,
    target: 'WHOLESALER' | 'DISTRIBUTOR',
  ) {
    return this.database.withTransaction(async (client) => {
      const sellerResult = await client.query<{
        id: string;
        seller_type: string;
        onboarding_status: string;
        kyc_status: string;
      }>(
        `SELECT id, seller_type, onboarding_status, kyc_status
         FROM marketplace_sellers
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const seller = sellerResult.rows[0];

      if (!seller) {
        throw new NotFoundException('Marketplace seller application not found');
      }

      if (
        seller.onboarding_status !== 'APPROVED' ||
        seller.kyc_status !== 'VERIFIED'
      ) {
        throw new ForbiddenException(
          `${target === 'WHOLESALER' ? 'Wholesaler' : 'Distributor'} upgrades require an approved seller application and verified KYC`,
        );
      }

      if (target === 'WHOLESALER') {
        if (!['RETAILER', 'WHOLESALER', 'DISTRIBUTOR'].includes(seller.seller_type)) {
          throw new ForbiddenException('A valid seller account is required for a Wholesaler upgrade');
        }
        await this.requireVerifiedMembership(client, userId, 'SELLER');
      } else {
        if (!['WHOLESALER', 'DISTRIBUTOR'].includes(seller.seller_type)) {
          throw new ForbiddenException(
            'Distributor upgrades require an existing Wholesaler account',
          );
        }
        await this.requireVerifiedMembership(client, userId, 'SELLER');
        await this.requireVerifiedMembership(client, userId, 'WHOLESALER');
      }

      const entitlement = await this.requireVerifiedMembership(
        client,
        userId,
        target,
      );
      const roles = target === 'WHOLESALER'
        ? ['SELLER', 'WHOLESALER']
        : ['SELLER', 'WHOLESALER', 'DISTRIBUTOR'];
      await this.grantMembershipRoles(client, userId, roles);

      const nextSellerType = target === 'WHOLESALER' &&
        seller.seller_type === 'DISTRIBUTOR'
        ? 'DISTRIBUTOR'
        : target;
      if (seller.seller_type !== nextSellerType) {
        await client.query(
          `UPDATE marketplace_sellers
           SET seller_type = $2, updated_at = now()
           WHERE id = $1`,
          [seller.id, nextSellerType],
        );
      }

      await this.audit.record(
        {
          actorId: userId,
          action: `${target}_UPGRADE_ACTIVATED`,
          resourceType: 'MARKETPLACE_SELLER',
          resourceId: seller.id,
          beforeData: { sellerType: seller.seller_type },
          afterData: {
            sellerType: nextSellerType,
            membershipPaymentId: entitlement.payment_id,
          },
        },
        client,
      );

      return { active: true, sellerType: nextSellerType };
    });
  }

  private async requireVerifiedMembership(
    client: PoolClient,
    userId: string,
    programCode: 'SELLER' | 'WHOLESALER' | 'DISTRIBUTOR',
  ): Promise<{ payment_id: string }> {
    const result = await client.query<{ payment_id: string }>(
      `SELECT payment.id AS payment_id
       FROM business_membership_programs program
       JOIN business_membership_entitlements entitlement
         ON entitlement.membership_program_id = program.id
       JOIN payments payment
         ON payment.id = entitlement.payment_id
        AND payment.user_id = entitlement.user_id
        AND payment.membership_program_id = entitlement.membership_program_id
       WHERE program.program_code = $2
         AND entitlement.user_id = $1
         AND entitlement.status = 'ACTIVE'
         AND entitlement.starts_at <= now()
         AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now())
         AND payment.purpose = 'BUSINESS_MEMBERSHIP'
         AND payment.state = 'SUCCESSFUL'
         AND EXISTS (
           SELECT 1
           FROM business_membership_terms_acceptances acceptance
           WHERE acceptance.user_id = entitlement.user_id
             AND acceptance.membership_program_id = program.id
             AND acceptance.terms_version = program.terms_version
         )
       ORDER BY entitlement.created_at DESC
       LIMIT 1
       FOR UPDATE OF entitlement`,
      [userId, programCode],
    );
    if (!result.rows[0]) {
      throw new ForbiddenException(
        `A successful ${programCode} membership payment and current terms acceptance are required`,
      );
    }
    return result.rows[0];
  }

  private async grantMembershipRoles(
    client: PoolClient,
    userId: string,
    roleCodes: string[],
  ): Promise<void> {
    const roles = await client.query<{ id: string; code: string }>(
      `SELECT id, code::text AS code
       FROM roles
       WHERE code::text = ANY($1::text[])`,
      [roleCodes],
    );
    const configured = new Set(roles.rows.map((role) => role.code));
    const missing = roleCodes.filter((roleCode) => !configured.has(roleCode));
    if (missing.length) {
      throw new ConflictException(`${missing.join(', ')} role is not configured`);
    }
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, role.role_id
       FROM unnest($2::uuid[]) AS role(role_id)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roles.rows.map((role) => role.id)],
    );
  }

  async getSellerIdByUserId(userId: string): Promise<string> {
    const result = await this.database.query<{
      id: string;
      onboarding_status: string;
      kyc_status: string;
    }>(
      `SELECT id, onboarding_status, kyc_status
       FROM marketplace_sellers
       WHERE user_id = $1`,
      [userId],
    );

    const seller = result.rows[0];
    if (!seller) {
      throw new NotFoundException('Seller application not found');
    }
    if (
      seller.onboarding_status !== 'APPROVED' ||
      seller.kyc_status !== 'VERIFIED'
    ) {
      throw new ForbiddenException(
        'Seller access requires an approved application and verified KYC',
      );
    }

    return seller.id;
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


  async getApplicationById(applicationId: string) {
    const result = await this.database.query(
      `SELECT
        id, user_id, seller_type, business_name, store_name, store_slug,
        business_description, business_registration_status,
        cac_registration_number, business_email, business_phone,
        business_address, products_services_description, product_categories,
        onboarding_status, kyc_status, risk_status, reviewed_by,
        reviewed_at, created_at, updated_at
       FROM marketplace_sellers
       WHERE id = $1`,
      [applicationId],
    );

    if (!result.rowCount) {
      throw new NotFoundException('Seller application not found');
    }

    const documents = await this.database.query(
      `SELECT
        id, seller_id, document_type, original_filename, mime_type,
        size_bytes, verification_status, reviewer_note, reviewed_at,
        uploaded_at
       FROM seller_application_documents
       WHERE seller_id = $1
       ORDER BY uploaded_at DESC`,
      [applicationId],
    );

    return { ...result.rows[0], documents: documents.rows };
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
      const sellerResult = await client.query<{
        id: string;
        onboarding_status: string;
        kyc_status: string;
      }>(
        `SELECT id, onboarding_status, kyc_status
         FROM marketplace_sellers
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const seller = sellerResult.rows[0];

      if (!seller) {
        throw new NotFoundException('Seller application not found');
      }
      if (
        seller.onboarding_status !== 'APPROVED' ||
        seller.kyc_status !== 'VERIFIED'
      ) {
        throw new ForbiddenException(
          'Seller access requires an approved application and verified KYC',
        );
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
     image_url,
     price_minor,
     currency
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7::currency_code)
   RETURNING id, seller_id, category_id, name, description,
             image_url, price_minor, currency, status, enabled,
             created_at, updated_at`,
        [
          seller.id,
          dto.categoryId,
          name,
           description,
           dto.imageUrl ?? null,
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
              product.image_url, product.price_minor, product.currency, product.status,
              product.enabled, product.created_at, product.updated_at
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1
         AND seller.onboarding_status = 'APPROVED'
         AND seller.kyc_status = 'VERIFIED'
       ORDER BY product.created_at DESC, product.id DESC`,
      [userId],
    );
    return result.rows;
  }

  async getSellerProduct(userId: string, productId: string) {
    const result = await this.database.query<MarketplaceProductRow>(
      `SELECT product.id, product.seller_id, product.category_id,
              product.name, product.description,
              product.image_url, product.price_minor, product.currency, product.status,
              product.enabled, product.created_at, product.updated_at
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1
         AND seller.onboarding_status = 'APPROVED'
         AND seller.kyc_status = 'VERIFIED'
         AND product.id = $2`,
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
                product.image_url, product.price_minor, product.currency, product.status,
                EXISTS (
                  SELECT 1
                  FROM marketplace_product_variants variant
                  WHERE variant.product_id = product.id
                ) AS has_variants,
                product.enabled, product.created_at, product.updated_at
         FROM marketplace_products product
         JOIN marketplace_sellers seller ON seller.id = product.seller_id
         WHERE seller.user_id = $1
         AND seller.onboarding_status = 'APPROVED'
         AND seller.kyc_status = 'VERIFIED'
         AND product.id = $2
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
             image_url = $4,
             price_minor = $5,
             currency = $6::currency_code,
             updated_at = now()
         WHERE id = $7 AND seller_id = $8
         RETURNING id, seller_id, category_id, name, description,
                   image_url, price_minor, currency, status, enabled,
                   created_at, updated_at`,
        [
          categoryId,
          dto.name?.trim() ?? current.name,
          dto.description?.trim() ?? current.description,
          dto.imageUrl === undefined ? current.image_url : dto.imageUrl,
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

  async moderateProduct(
    productId: string,
    moderatorId: string,
    dto: ReviewMarketplaceProductDto,
  ): Promise<{ id: string; status: string; enabled: boolean }> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        status: string;
        enabled: boolean;
        onboarding_status: string;
        kyc_status: string;
        risk_status: string;
        category_enabled: boolean;
        has_base_price: boolean;
        has_valid_variant_price: boolean;
      }>(
        `SELECT product.id,
                product.status,
                product.enabled,
                seller.onboarding_status,
                seller.kyc_status,
                seller.risk_status,
                category.enabled AS category_enabled,
                (product.price_minor IS NOT NULL AND product.currency IS NOT NULL)
                  AS has_base_price,
                EXISTS (
                  SELECT 1
                  FROM marketplace_product_variants variant
                  WHERE variant.product_id = product.id
                    AND variant.enabled = true
                    AND variant.price_minor IS NOT NULL
                    AND variant.currency IS NOT NULL
                ) AS has_valid_variant_price
         FROM marketplace_products product
         JOIN marketplace_sellers seller ON seller.id = product.seller_id
         JOIN marketplace_product_categories category ON category.id = product.category_id
         WHERE product.id = $1
         FOR UPDATE OF product, seller`,
        [productId],
      );

      const product = result.rows[0];
      if (!product) {
        throw new NotFoundException('Marketplace product not found');
      }

      const allowedTransitions: Record<string, string[]> = {
        START_REVIEW: ['SUBMITTED'],
        APPROVE: ['SUBMITTED', 'UNDER_REVIEW'],
        PUBLISH: ['APPROVED'],
        REJECT: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'],
        SUSPEND: ['LIVE', 'APPROVED'],
      };

      if (!allowedTransitions[dto.decision]?.includes(product.status)) {
        throw new ConflictException(
          `Cannot apply ${dto.decision} to a product with status ${product.status}`,
        );
      }

      if (
        dto.decision === 'PUBLISH' &&
        (
          product.onboarding_status !== 'APPROVED' ||
          product.kyc_status !== 'VERIFIED' ||
          !['NORMAL', 'WATCH'].includes(product.risk_status) ||
          !product.category_enabled ||
          (!product.has_base_price && !product.has_valid_variant_price)
        )
      ) {
        throw new ConflictException(
          'Product cannot be published until seller approval, KYC, category, risk, and pricing requirements are satisfied',
        );
      }

      const statusByDecision: Record<string, string> = {
        START_REVIEW: 'UNDER_REVIEW',
        APPROVE: 'APPROVED',
        PUBLISH: 'LIVE',
        REJECT: 'REJECTED',
        SUSPEND: 'SUSPENDED',
      };
      const nextStatus = statusByDecision[dto.decision];
      const enabled = dto.decision === 'PUBLISH';

      const updatedResult = await client.query<{
        id: string;
        status: string;
        enabled: boolean;
      }>(
        `UPDATE marketplace_products
         SET status = $1::marketplace_product_status,
             enabled = $2,
             updated_at = now()
         WHERE id = $3 AND status = $4
         RETURNING id, status, enabled`,
        [nextStatus, enabled, productId, product.status],
      );

      const updated = updatedResult.rows[0];
      if (!updated) {
        throw new ConflictException('Product status changed; reload and retry');
      }

      await this.audit.record(
        {
          actorId: moderatorId,
          action: 'MARKETPLACE_PRODUCT_MODERATED',
          resourceType: 'MARKETPLACE_PRODUCT',
          resourceId: updated.id,
          beforeData: {
            status: product.status,
            enabled: product.enabled,
          },
          afterData: {
            status: updated.status,
            enabled: updated.enabled,
            decision: dto.decision,
          },
          reason: dto.reviewNote?.trim() || undefined,
        },
        client,
      );

      return updated;
    });
  }
  async reviewApplication(
    applicationId: string,
    reviewerId: string,
    dto: ReviewSellerApplicationDto,
  ): Promise<SellerReviewResult> {
    return this.database.withTransaction(async (client) => {
      const applicationResult = await client.query<SellerReviewRow>(
        `SELECT id, user_id, onboarding_status, business_registration_status, kyc_status
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
      if (dto.decision === 'APPROVE') {
        const documentResult = await client.query<{ document_type: string }>(
          `SELECT document_type
           FROM seller_application_documents
           WHERE seller_id = $1
             AND verification_status = 'ACCEPTED'`,
          [applicationId],
        );
        const acceptedTypes = new Set(
          documentResult.rows.map((row) => row.document_type),
        );
        const requiredTypes = ["IDENTITY_DOCUMENT", "ADDRESS_PROOF"];
        if (application.business_registration_status === 'REGISTERED') {
          requiredTypes.push("CAC_CERTIFICATE");
        }
        const missingTypes = requiredTypes.filter(
          (type) => !acceptedTypes.has(type),
        );
        if (missingTypes.length) {
          throw new ConflictException(
            `Cannot approve seller application until required documents are accepted: ${missingTypes.join(", ")}`,
          );
        }
      }

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

      if (
        reviewedApplication.onboarding_status === 'APPROVED' &&
        application.kyc_status === 'VERIFIED'
      ) {
        await this.grantMembershipRoles(client, application.user_id, ['SELLER']);
      }

      await client.query(
        `INSERT INTO seller_application_reviews (
           seller_id,
           reviewer_id,
           decision,
           review_note
         )
         VALUES ($1, $2, $3, $4)`,
        [
          applicationId,
          reviewerId,
          dto.decision,
          dto.reviewNote?.trim() || null,
        ],
      );

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
      `SELECT id FROM marketplace_sellers WHERE user_id = $1`,
      [userId],
    );

    if (existing.rowCount) {
      throw new ConflictException(
        'A marketplace seller application already exists for this account',
      );
    }

    const storeSlug =
      dto.storeSlug?.trim().toLowerCase() ||
      (dto.storeName?.trim() ? this.buildSlug(dto.storeName) : null);

    if (storeSlug) {
      const existingSlug = await this.database.query(
        `SELECT id FROM marketplace_sellers WHERE store_slug = $1`,
        [storeSlug],
      );
      if (existingSlug.rowCount) {
        throw new ConflictException('That store slug is already in use');
      }
    }

    try {
      const result = await this.database.query(
        `INSERT INTO marketplace_sellers (
          user_id, seller_type, business_name, store_name, store_slug,
          business_description, business_registration_status,
          cac_registration_number, business_email, business_phone,
          business_address, products_services_description, product_categories,
          onboarding_status, kyc_status, risk_status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          'DRAFT', 'PENDING', 'NORMAL'
        )
        RETURNING *`,
        [
          userId,
          dto.sellerType ?? 'RETAILER',
          dto.businessName?.trim() || null,
          dto.storeName?.trim() || null,
          storeSlug,
          dto.businessDescription?.trim() || null,
          dto.businessRegistrationStatus ?? null,
          dto.cacRegistrationNumber?.trim() || null,
          dto.businessEmail?.trim() || null,
          dto.businessPhone?.trim() || null,
          dto.businessAddress?.trim() || null,
          dto.productsServicesDescription?.trim() || null,
          dto.productCategories?.map((category) => category.trim()) ?? null,
        ],
      );

      return result.rows[0];
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505'
      ) {
        const existingUser = await this.database.query(
          `SELECT id FROM marketplace_sellers WHERE user_id = $1`,
          [userId],
        );
        if (existingUser.rowCount) {
          throw new ConflictException(
            'A marketplace seller application already exists for this account',
          );
        }

        if (storeSlug) {
          const existingSlug = await this.database.query(
            `SELECT id FROM marketplace_sellers WHERE store_slug = $1`,
            [storeSlug],
          );
          if (existingSlug.rowCount) {
            throw new ConflictException('That store slug is already in use');
          }
        }

        throw new ConflictException('A seller application could not be created');
      }
      throw error;
    }
  }

  async updateApplication(
    userId: string,
    dto: CreateSellerApplicationDto,
  ) {
    const storeSlug =
      dto.storeSlug?.trim().toLowerCase() ||
      (dto.storeName?.trim() ? this.buildSlug(dto.storeName) : null);

    try {
      const result = await this.database.query(
        `UPDATE marketplace_sellers
         SET seller_type = COALESCE($2, seller_type),
             business_name = COALESCE($3, business_name),
             store_name = COALESCE($4, store_name),
             store_slug = COALESCE($5, store_slug),
             business_description = COALESCE($6, business_description),
             business_registration_status = COALESCE($7, business_registration_status),
             cac_registration_number = CASE
               WHEN $7 = 'UNREGISTERED' THEN NULL
               ELSE COALESCE($8, cac_registration_number)
             END,
             business_email = COALESCE($9, business_email),
             business_phone = COALESCE($10, business_phone),
             business_address = COALESCE($11, business_address),
             products_services_description = COALESCE($12, products_services_description),
             product_categories = COALESCE($13, product_categories),
             updated_at = now()
         WHERE user_id = $1
           AND onboarding_status IN ('DRAFT', 'MORE_INFORMATION_REQUIRED')
         RETURNING *`,
        [
          userId,
          dto.sellerType ?? null,
          dto.businessName?.trim() || null,
          dto.storeName?.trim() || null,
          storeSlug,
          dto.businessDescription?.trim() || null,
          dto.businessRegistrationStatus ?? null,
          dto.cacRegistrationNumber?.trim() || null,
          dto.businessEmail?.trim() || null,
          dto.businessPhone?.trim() || null,
          dto.businessAddress?.trim() || null,
          dto.productsServicesDescription?.trim() || null,
          dto.productCategories?.map((category) => category.trim()) ?? null,
        ],
      );

      if (result.rowCount) return result.rows[0];

      const existing = await this.database.query<{ onboarding_status: string }>(
        `SELECT onboarding_status FROM marketplace_sellers WHERE user_id = $1`,
        [userId],
      );

      if (!existing.rowCount) {
        throw new NotFoundException('Seller application not found');
      }

      throw new ConflictException(
        `A seller application in ${existing.rows[0].onboarding_status} status cannot be edited`,
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505'
      ) {
        throw new ConflictException('That store slug is already in use');
      }
      throw error;
    }
  }

  async submitApplication(userId: string) {
    return this.database.withTransaction(async (client) => {
      const sellerResult = await client.query<{
        id: string;
        onboarding_status: string;
        business_registration_status: string;
      }>(
        `SELECT id, onboarding_status, business_registration_status
         FROM marketplace_sellers
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );

      const seller = sellerResult.rows[0];
      if (!seller) {
        throw new NotFoundException('Seller application not found');
      }

      if (!['DRAFT', 'MORE_INFORMATION_REQUIRED'].includes(seller.onboarding_status)) {
        throw new ConflictException(
          `Application cannot be submitted from ${seller.onboarding_status} status`,
        );
      }

      const profile = await client.query<{
        business_name: string | null;
        store_name: string | null;
        store_slug: string | null;
        business_description: string | null;
        cac_registration_number: string | null;
        business_phone: string | null;
        business_address: string | null;
        products_services_description: string | null;
        product_categories: string[] | null;
      }>(
        `SELECT business_name, store_name, store_slug, business_description,
                cac_registration_number, business_phone, business_address,
                products_services_description, product_categories
         FROM marketplace_sellers WHERE id = $1`,
        [seller.id],
      );

      const details = profile.rows[0];
      const missingProfile = [
        !details.business_name?.trim() && "Business name",
        !details.store_name?.trim() && "Store name",
        !details.store_slug?.trim() && "Store slug",
        !details.business_description?.trim() && "Business description",
        !details.business_phone?.trim() && "Business phone",
        !details.business_address?.trim() && "Business address",
        !details.products_services_description?.trim() && "Products and services description",
        !details.product_categories?.length && "Product categories",
        seller.business_registration_status === "REGISTERED" &&
          !details.cac_registration_number?.trim() && "CAC registration number",
      ].filter((field): field is string => Boolean(field));

      if (missingProfile.length) {
        throw new BadRequestException(
          `Complete these fields before submission: ${missingProfile.join(", ")}`,
        );
      }

      const documents = await client.query<{ document_type: string }>(
        `SELECT document_type
         FROM seller_application_documents
         WHERE seller_id = $1`,
        [seller.id],
      );

      const uploaded = new Set(documents.rows.map((row) => row.document_type));
      const required = ['IDENTITY_DOCUMENT', 'ADDRESS_PROOF'];

      if (seller.business_registration_status === 'REGISTERED') {
        required.push('CAC_CERTIFICATE');
      }

      const missing = required.filter((type) => !uploaded.has(type));
      if (missing.length) {
        throw new BadRequestException(
          `Upload the required documents before submission: ${missing.join(', ')}`,
        );
      }

      const result = await client.query(
        `UPDATE marketplace_sellers
         SET onboarding_status = 'SUBMITTED', updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [seller.id],
      );

      return result.rows[0];
    });
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
        business_description,
        business_registration_status,
        cac_registration_number,
        business_email,
        business_phone,
        business_address,
        products_services_description,
        product_categories,
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

    const documents = await this.database.query(
      `SELECT
        id,
        seller_id,
        document_type,
        original_filename,
        mime_type,
        size_bytes,
        verification_status,
        reviewer_note,
        reviewed_at,
        uploaded_at
       FROM seller_application_documents
       WHERE seller_id = $1
       ORDER BY uploaded_at DESC`,
      [result.rows[0].id],
    );

    return { ...result.rows[0], documents: documents.rows };
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

  async createSellerLocation(
    userId: string,
    dto: CreateSellerLocationDto,
  ) {
    const sellerId = await this.getSellerIdByUserId(userId);

    const result = await this.database.query<{
      id: string;
      seller_id: string;
      location_name: string;
      contact_name: string | null;
      contact_phone: string | null;
      address_line1: string;
      address_line2: string | null;
      city: string;
      state_province: string | null;
      postal_code: string | null;
      country_code: string;
      latitude: number | null;
      longitude: number | null;
      is_default: boolean;
      enabled: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO marketplace_seller_locations (
         seller_id,
         location_name,
         contact_name,
         contact_phone,
         address_line1,
         address_line2,
         city,
         state_province,
         postal_code,
         country_code,
         latitude,
         longitude,
         is_default
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       RETURNING
         id,
         seller_id,
         location_name,
         contact_name,
         contact_phone,
         address_line1,
         address_line2,
         city,
         state_province,
         postal_code,
         country_code,
         latitude,
         longitude,
         is_default,
         enabled,
         created_at,
         updated_at`,
      [
        sellerId,
        dto.locationName,
        dto.contactName ?? null,
        dto.contactPhone ?? null,
        dto.addressLine1,
        dto.addressLine2 ?? null,
        dto.city,
        dto.stateProvince ?? null,
        dto.postalCode ?? null,
        dto.countryCode,
        dto.latitude ?? null,
        dto.longitude ?? null,
        dto.isDefault ?? false,
      ],
    );

    return result.rows[0];
  }

  async listSellerLocations(userId: string) {
    const sellerId = await this.getSellerIdByUserId(userId);

    const result = await this.database.query(
      `SELECT
         id,
         seller_id,
         location_name,
         contact_name,
         contact_phone,
         address_line1,
         address_line2,
         city,
         state_province,
         postal_code,
         country_code,
         latitude,
         longitude,
         is_default,
         enabled,
         created_at,
         updated_at
       FROM marketplace_seller_locations
       WHERE seller_id = $1
         AND enabled = true
       ORDER BY is_default DESC, created_at DESC, id`,
      [sellerId],
    );

    return result.rows;
  }

  async listSellerOrders(userId: string) {
    const sellerId = await this.getSellerIdByUserId(userId);

    const result = await this.database.query<{
      id: string;
      order_number: string;
      status: string;
      currency: CurrencyCode;
      subtotal_minor: string | number;
      total_minor: string | number;
      item_count: string | number;
      seller_total_minor: string | number;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         o.id,
         o.order_number::text,
         o.status,
         o.currency,
         o.subtotal_minor,
         o.total_minor,
         COUNT(item.id)::int AS item_count,
         COALESCE(SUM(item.line_total_minor), 0)::bigint AS seller_total_minor,
         o.created_at,
         o.updated_at
       FROM marketplace_orders o
       JOIN marketplace_order_items item
         ON item.order_id = o.id
        AND item.seller_id = $1
       GROUP BY
         o.id,
         o.order_number,
         o.status,
         o.currency,
         o.subtotal_minor,
         o.total_minor,
         o.created_at,
         o.updated_at
       ORDER BY o.created_at DESC, o.id DESC`,
      [sellerId],
    );

    return result.rows.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotalMinor: this.toSafeMinor(order.subtotal_minor),
      totalMinor: this.toSafeMinor(order.total_minor),
      itemCount: Number(order.item_count),
      sellerTotalMinor: this.toSafeMinor(order.seller_total_minor),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    }));
  }

  async getSellerOrder(userId: string, orderId: string) {
    const sellerId = await this.getSellerIdByUserId(userId);

    const result = await this.database.query<{
      id: string;
      order_number: string;
      status: string;
      currency: CurrencyCode;
      subtotal_minor: string | number;
      total_minor: string | number;
      item_count: string | number;
      seller_total_minor: string | number;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         o.id,
         o.order_number::text,
         o.status,
         o.currency,
         o.subtotal_minor,
         o.total_minor,
         COUNT(item.id)::int AS item_count,
         COALESCE(SUM(item.line_total_minor), 0)::bigint
           AS seller_total_minor,
         o.created_at,
         o.updated_at
       FROM marketplace_orders o
       JOIN marketplace_order_items item
         ON item.order_id = o.id
        AND item.seller_id = $1
       WHERE o.id = $2
       GROUP BY
         o.id,
         o.order_number,
         o.status,
         o.currency,
         o.subtotal_minor,
         o.total_minor,
         o.created_at,
         o.updated_at`,
      [sellerId, orderId],
    );

    const order = result.rows[0];

    if (!order) {
      throw new NotFoundException('Seller order not found');
    }

    const items = await this.database.query<{
      id: string;
      product_id: string;
      variant_id: string | null;
      quantity: number;
      unit_price_minor: string | number;
      line_total_minor: string | number;
      currency: CurrencyCode;
      product_name_snapshot: string;
      product_description_snapshot: string;
      seller_name_snapshot: string;
      sku_snapshot: string | null;
      variant_description_snapshot: unknown;
    }>(
      `SELECT
         id,
         product_id,
         variant_id,
         quantity,
         unit_price_minor,
         line_total_minor,
         currency,
         product_name_snapshot,
         product_description_snapshot,
         seller_name_snapshot,
         sku_snapshot,
         variant_description_snapshot
       FROM marketplace_order_items
       WHERE order_id = $1
         AND seller_id = $2
       ORDER BY created_at, id`,
      [orderId, sellerId],
    );

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotalMinor: this.toSafeMinor(order.subtotal_minor),
      totalMinor: this.toSafeMinor(order.total_minor),
      itemCount: Number(order.item_count),
      sellerTotalMinor: this.toSafeMinor(order.seller_total_minor),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      items: items.rows.map((item) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name_snapshot,
        productDescription: item.product_description_snapshot,
        sellerName: item.seller_name_snapshot,
        sku: item.sku_snapshot,
        variantDescription: item.variant_description_snapshot,
        quantity: item.quantity,
        unitPriceMinor: this.toSafeMinor(item.unit_price_minor),
        lineTotalMinor: this.toSafeMinor(item.line_total_minor),
        currency: item.currency,
      })),
    };
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
