import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { CreateSellerApplicationDto } from './seller.dtos';


@Injectable()
export class SellerService {
  constructor(private readonly database: DatabaseService) {}

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

  async createApplication(
    userId: string,
    dto: CreateSellerApplicationDto,
  ) {
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

      private buildSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug.slice(0, 220);
  }
}
