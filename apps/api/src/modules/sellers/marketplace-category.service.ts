import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import type { CreateMarketplaceCategoryDto } from './dto/create-marketplace-category.dto';
import type { UpdateMarketplaceCategoryDto } from './dto/update-marketplace-category.dto';

export interface MarketplaceCategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MarketplaceCategoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listEnabledCategories(): Promise<MarketplaceCategoryRow[]> {
    const result = await this.database.query<MarketplaceCategoryRow>(
      `SELECT id, parent_id, slug, name, description, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_categories
       WHERE enabled = true
       ORDER BY parent_id NULLS FIRST, sort_order, name, id`,
    );
    return result.rows;
  }

  async getEnabledCategory(
    categoryId: string,
  ): Promise<MarketplaceCategoryRow> {
    const result = await this.database.query<MarketplaceCategoryRow>(
      `SELECT id, parent_id, slug, name, description, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_categories
       WHERE id = $1 AND enabled = true`,
      [categoryId],
    );
    const category = result.rows[0];
    if (!category) {
      throw new NotFoundException('Marketplace category not found');
    }
    return category;
  }

  async listAllCategories(): Promise<MarketplaceCategoryRow[]> {
    const result = await this.database.query<MarketplaceCategoryRow>(
      `SELECT id, parent_id, slug, name, description, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_categories
       ORDER BY parent_id NULLS FIRST, sort_order, name, id`,
    );
    return result.rows;
  }

  async createCategory(
    actorId: string,
    dto: CreateMarketplaceCategoryDto,
  ): Promise<MarketplaceCategoryRow> {
    const slug = this.requiredValue(dto.slug, 'Category slug');
    const name = this.requiredValue(dto.name, 'Category name');

    return this.database.withTransaction(async (client) => {
      await this.lockCategoryWrites(client);
      await this.ensureParentExists(client, dto.parentId ?? null);
      await this.ensureSlugAvailable(client, slug);

      const result = await client.query<MarketplaceCategoryRow>(
        `INSERT INTO marketplace_product_categories (
           parent_id, slug, name, description, sort_order
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, parent_id, slug, name, description, enabled,
                   sort_order, created_at, updated_at`,
        [
          dto.parentId ?? null,
          slug,
          name,
          dto.description?.trim() || null,
          dto.sortOrder ?? 0,
        ],
      );
      const category = result.rows[0];

      await this.audit.record(
        {
          actorId,
          action: 'MARKETPLACE_CATEGORY_CREATED',
          resourceType: 'MARKETPLACE_PRODUCT_CATEGORY',
          resourceId: category.id,
          afterData: this.auditData(category),
        },
        client,
      );

      return category;
    });
  }

  async updateCategory(
    actorId: string,
    categoryId: string,
    dto: UpdateMarketplaceCategoryDto,
  ): Promise<MarketplaceCategoryRow> {
    const slug =
      dto.slug === undefined
        ? undefined
        : this.requiredValue(dto.slug, 'Category slug');
    const name =
      dto.name === undefined
        ? undefined
        : this.requiredValue(dto.name, 'Category name');

    return this.database.withTransaction(async (client) => {
      await this.lockCategoryWrites(client);
      const currentResult = await client.query<MarketplaceCategoryRow>(
        `SELECT id, parent_id, slug, name, description, enabled, sort_order,
                created_at, updated_at
         FROM marketplace_product_categories
         WHERE id = $1
         FOR UPDATE`,
        [categoryId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new NotFoundException('Marketplace category not found');
      }

      const parentId =
        dto.parentId === undefined ? current.parent_id : dto.parentId;
      await this.ensureParentExists(client, parentId);
      if (parentId !== null) {
        await this.ensureNoParentCycle(client, parentId, categoryId);
      }
      if (slug !== undefined) {
        await this.ensureSlugAvailable(client, slug, categoryId);
      }

      const result = await client.query<MarketplaceCategoryRow>(
        `UPDATE marketplace_product_categories
         SET parent_id = $1,
             slug = $2,
             name = $3,
             description = $4,
             sort_order = $5,
             enabled = $6,
             updated_at = now()
         WHERE id = $7
         RETURNING id, parent_id, slug, name, description, enabled,
                   sort_order, created_at, updated_at`,
        [
          parentId,
          slug ?? current.slug,
          name ?? current.name,
          dto.description === undefined
            ? current.description
            : dto.description?.trim() || null,
          dto.sortOrder ?? current.sort_order,
          dto.enabled ?? current.enabled,
          categoryId,
        ],
      );
      const category = result.rows[0];

      await this.audit.record(
        {
          actorId,
          action: 'MARKETPLACE_CATEGORY_UPDATED',
          resourceType: 'MARKETPLACE_PRODUCT_CATEGORY',
          resourceId: category.id,
          beforeData: this.auditData(current),
          afterData: this.auditData(category),
        },
        client,
      );

      return category;
    });
  }

  private async lockCategoryWrites(client: PoolClient): Promise<void> {
    await client.query(
      'LOCK TABLE marketplace_product_categories IN SHARE ROW EXCLUSIVE MODE',
    );
  }

  private async ensureParentExists(
    client: PoolClient,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) {
      return;
    }
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_categories
       WHERE id = $1`,
      [parentId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('Parent category does not exist');
    }
  }

  private async ensureNoParentCycle(
    client: PoolClient,
    parentId: string,
    categoryId: string,
  ): Promise<void> {
    const result = await client.query<{ creates_cycle: boolean }>(
      `WITH RECURSIVE ancestor_ids(id) AS (
         SELECT $1::uuid
         UNION
         SELECT category.parent_id
         FROM marketplace_product_categories category
         JOIN ancestor_ids ancestor ON category.id = ancestor.id
         WHERE category.parent_id IS NOT NULL
       )
       SELECT EXISTS (
         SELECT 1 FROM ancestor_ids WHERE id = $2
       ) AS creates_cycle`,
      [parentId, categoryId],
    );
    if (result.rows[0]?.creates_cycle) {
      throw new BadRequestException(
        'A category cannot be its own parent or a descendant of itself',
      );
    }
  }

  private async ensureSlugAvailable(
    client: PoolClient,
    slug: string,
    excludedCategoryId?: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_categories
       WHERE slug = $1
         AND ($2::uuid IS NULL OR id <> $2)`,
      [slug, excludedCategoryId ?? null],
    );
    if (result.rows[0]) {
      throw new ConflictException('Category slug is already in use');
    }
  }

  private requiredValue(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required`);
    }
    return trimmed;
  }

  private auditData(category: MarketplaceCategoryRow) {
    return {
      parentId: category.parent_id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      enabled: category.enabled,
      sortOrder: category.sort_order,
    };
  }
}
