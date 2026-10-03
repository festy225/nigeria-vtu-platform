import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import type { CreateMarketplaceAttributeDto } from './dto/create-marketplace-attribute.dto';
import type { UpdateMarketplaceAttributeDto } from './dto/update-marketplace-attribute.dto';
import type { CreateMarketplaceAttributeValueDto } from './dto/create-marketplace-attribute-value.dto';
import type { UpdateMarketplaceAttributeValueDto } from './dto/update-marketplace-attribute-value.dto';

export interface MarketplaceAttributeRow {
  id: string;
  category_id: string;
  code: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface MarketplaceAttributeValueRow {
  id: string;
  attribute_id: string;
  code: string;
  value: string;
  enabled: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MarketplaceAttributeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listEnabledCategoryAttributes(
    categoryId: string,
  ): Promise<MarketplaceAttributeRow[]> {
    await this.requireEnabledCategory(categoryId);
    const result = await this.database.query<MarketplaceAttributeRow>(
      `SELECT id, category_id, code, name, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_attributes
       WHERE category_id = $1 AND enabled = true
       ORDER BY sort_order, name, id`,
      [categoryId],
    );
    return result.rows;
  }

  async listCategoryAttributes(
    categoryId: string,
  ): Promise<MarketplaceAttributeRow[]> {
    const result = await this.database.query<MarketplaceAttributeRow>(
      `SELECT attribute.id, attribute.category_id, attribute.code,
              attribute.name, attribute.enabled, attribute.sort_order,
              attribute.created_at, attribute.updated_at
       FROM marketplace_product_attributes attribute
       JOIN marketplace_product_categories category
         ON category.id = attribute.category_id
       WHERE category.id = $1
       ORDER BY attribute.sort_order, attribute.name, attribute.id`,
      [categoryId],
    );
    if (!result.rows.length) {
      const category = await this.database.query<{ id: string }>(
        `SELECT id FROM marketplace_product_categories WHERE id = $1`,
        [categoryId],
      );
      if (!category.rows[0]) {
        throw new NotFoundException('Marketplace category not found');
      }
    }
    return result.rows;
  }

  async createAttribute(
    actorId: string,
    categoryId: string,
    dto: CreateMarketplaceAttributeDto,
  ): Promise<MarketplaceAttributeRow> {
    const code = this.requiredValue(dto.code, 'Attribute code').toLowerCase();
    const name = this.requiredValue(dto.name, 'Attribute name');
    return this.withUniqueConflict('An attribute with this code or name already exists', () =>
      this.database.withTransaction(async (client) => {
        await this.lockAttributeConfiguration(client);
        await this.requireEnabledCategory(categoryId, client);
        await this.ensureAttributeAvailable(client, categoryId, code, name);

        const result = await client.query<MarketplaceAttributeRow>(
          `INSERT INTO marketplace_product_attributes (
             category_id, code, name, sort_order
           )
           VALUES ($1, $2, $3, $4)
           RETURNING id, category_id, code, name, enabled, sort_order,
                     created_at, updated_at`,
          [categoryId, code, name, dto.sortOrder ?? 0],
        );
        const attribute = result.rows[0];
        await this.audit.record(
          {
            actorId,
            action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_CREATED',
            resourceType: 'MARKETPLACE_PRODUCT_ATTRIBUTE',
            resourceId: attribute.id,
            afterData: this.attributeAuditData(attribute),
          },
          client,
        );
        return attribute;
      }),
    );
  }

  async updateAttribute(
    actorId: string,
    attributeId: string,
    dto: UpdateMarketplaceAttributeDto,
  ): Promise<MarketplaceAttributeRow> {
    const code =
      dto.code === undefined
        ? undefined
        : this.requiredValue(dto.code, 'Attribute code').toLowerCase();
    const name =
      dto.name === undefined
        ? undefined
        : this.requiredValue(dto.name, 'Attribute name');
    return this.withUniqueConflict('An attribute with this code or name already exists', () =>
      this.database.withTransaction(async (client) => {
        await this.lockAttributeConfiguration(client);
        const current = await this.getAttributeForUpdate(client, attributeId);
        await this.requireEnabledCategory(current.category_id, client);
        await this.ensureAttributeAvailable(
          client,
          current.category_id,
          code ?? current.code,
          name ?? current.name,
          attributeId,
        );

        const result = await client.query<MarketplaceAttributeRow>(
          `UPDATE marketplace_product_attributes
           SET code = $1, name = $2, enabled = $3, sort_order = $4,
               updated_at = now()
           WHERE id = $5
           RETURNING id, category_id, code, name, enabled, sort_order,
                     created_at, updated_at`,
          [
            code ?? current.code,
            name ?? current.name,
            dto.enabled ?? current.enabled,
            dto.sortOrder ?? current.sort_order,
            attributeId,
          ],
        );
        const attribute = result.rows[0];
        await this.audit.record(
          {
            actorId,
            action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_UPDATED',
            resourceType: 'MARKETPLACE_PRODUCT_ATTRIBUTE',
            resourceId: attribute.id,
            beforeData: this.attributeAuditData(current),
            afterData: this.attributeAuditData(attribute),
          },
          client,
        );
        return attribute;
      }),
    );
  }

  async listEnabledAttributeValues(
    attributeId: string,
  ): Promise<MarketplaceAttributeValueRow[]> {
    await this.getEnabledAttribute(attributeId);
    const result = await this.database.query<MarketplaceAttributeValueRow>(
      `SELECT value.id, value.attribute_id, value.code, value.value,
              value.enabled, value.sort_order, value.created_at,
              value.updated_at
       FROM marketplace_product_attribute_values value
       WHERE value.attribute_id = $1 AND value.enabled = true
       ORDER BY value.sort_order, value.value, value.id`,
      [attributeId],
    );
    return result.rows;
  }

  async listAttributeValues(
    attributeId: string,
  ): Promise<MarketplaceAttributeValueRow[]> {
    await this.getAttributeForRead(attributeId);
    const result = await this.database.query<MarketplaceAttributeValueRow>(
      `SELECT id, attribute_id, code, value, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_attribute_values
       WHERE attribute_id = $1
       ORDER BY sort_order, value, id`,
      [attributeId],
    );
    return result.rows;
  }

  async createAttributeValue(
    actorId: string,
    attributeId: string,
    dto: CreateMarketplaceAttributeValueDto,
  ): Promise<MarketplaceAttributeValueRow> {
    const code = this.requiredValue(dto.code, 'Attribute value code').toLowerCase();
    const value = this.requiredValue(dto.value, 'Attribute value');
    return this.withUniqueConflict('An attribute value with this code or value already exists', () =>
      this.database.withTransaction(async (client) => {
        await this.lockAttributeConfiguration(client);
        await this.getEnabledAttribute(attributeId, client);
        await this.ensureValueAvailable(client, attributeId, code, value);

        const result = await client.query<MarketplaceAttributeValueRow>(
          `INSERT INTO marketplace_product_attribute_values (
             attribute_id, code, value, sort_order
           )
           VALUES ($1, $2, $3, $4)
           RETURNING id, attribute_id, code, value, enabled, sort_order,
                     created_at, updated_at`,
          [attributeId, code, value, dto.sortOrder ?? 0],
        );
        const attributeValue = result.rows[0];
        await this.audit.record(
          {
            actorId,
            action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_VALUE_CREATED',
            resourceType: 'MARKETPLACE_PRODUCT_ATTRIBUTE_VALUE',
            resourceId: attributeValue.id,
            afterData: this.valueAuditData(attributeValue),
          },
          client,
        );
        return attributeValue;
      }),
    );
  }

  async updateAttributeValue(
    actorId: string,
    valueId: string,
    dto: UpdateMarketplaceAttributeValueDto,
  ): Promise<MarketplaceAttributeValueRow> {
    const code =
      dto.code === undefined
        ? undefined
        : this.requiredValue(dto.code, 'Attribute value code').toLowerCase();
    const value =
      dto.value === undefined
        ? undefined
        : this.requiredValue(dto.value, 'Attribute value');
    return this.withUniqueConflict('An attribute value with this code or value already exists', () =>
      this.database.withTransaction(async (client) => {
        await this.lockAttributeConfiguration(client);
        const current = await this.getValueForUpdate(client, valueId);
        await this.getEnabledAttribute(current.attribute_id, client);
        await this.ensureValueAvailable(
          client,
          current.attribute_id,
          code ?? current.code,
          value ?? current.value,
          valueId,
        );

        const result = await client.query<MarketplaceAttributeValueRow>(
          `UPDATE marketplace_product_attribute_values
           SET code = $1, value = $2, enabled = $3, sort_order = $4,
               updated_at = now()
           WHERE id = $5
           RETURNING id, attribute_id, code, value, enabled, sort_order,
                     created_at, updated_at`,
          [
            code ?? current.code,
            value ?? current.value,
            dto.enabled ?? current.enabled,
            dto.sortOrder ?? current.sort_order,
            valueId,
          ],
        );
        const attributeValue = result.rows[0];
        await this.audit.record(
          {
            actorId,
            action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_VALUE_UPDATED',
            resourceType: 'MARKETPLACE_PRODUCT_ATTRIBUTE_VALUE',
            resourceId: attributeValue.id,
            beforeData: this.valueAuditData(current),
            afterData: this.valueAuditData(attributeValue),
          },
          client,
        );
        return attributeValue;
      }),
    );
  }

  private async requireEnabledCategory(
    categoryId: string,
    client?: PoolClient,
  ): Promise<void> {
    const query = client ? client.query.bind(client) : this.database.query.bind(this.database);
    const result = await query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_categories
       WHERE id = $1 AND enabled = true
       ${client ? 'FOR UPDATE' : ''}`,
      [categoryId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Enabled marketplace category not found');
    }
  }

  private async getAttributeForUpdate(
    client: PoolClient,
    attributeId: string,
  ): Promise<MarketplaceAttributeRow> {
    const result = await client.query<MarketplaceAttributeRow>(
      `SELECT attribute.id, attribute.category_id, attribute.code,
              attribute.name, attribute.enabled, attribute.sort_order,
              attribute.created_at, attribute.updated_at
       FROM marketplace_product_attributes attribute
       WHERE attribute.id = $1
       FOR UPDATE`,
      [attributeId],
    );
    const attribute = result.rows[0];
    if (!attribute) {
      throw new NotFoundException('Marketplace product attribute not found');
    }
    return attribute;
  }

  private async getAttributeForRead(
    attributeId: string,
  ): Promise<MarketplaceAttributeRow> {
    const result = await this.database.query<MarketplaceAttributeRow>(
      `SELECT attribute.id, attribute.category_id, attribute.code,
              attribute.name, attribute.enabled, attribute.sort_order,
              attribute.created_at, attribute.updated_at
       FROM marketplace_product_attributes attribute
       JOIN marketplace_product_categories category
         ON category.id = attribute.category_id
       WHERE attribute.id = $1`,
      [attributeId],
    );
    const attribute = result.rows[0];
    if (!attribute) {
      throw new NotFoundException('Marketplace product attribute not found');
    }
    return attribute;
  }

  private async getEnabledAttribute(
    attributeId: string,
    client?: PoolClient,
  ): Promise<MarketplaceAttributeRow> {
    const query = client ? client.query.bind(client) : this.database.query.bind(this.database);
    const result = await query<MarketplaceAttributeRow>(
      `SELECT attribute.id, attribute.category_id, attribute.code,
              attribute.name, attribute.enabled, attribute.sort_order,
              attribute.created_at, attribute.updated_at
       FROM marketplace_product_attributes attribute
       JOIN marketplace_product_categories category
         ON category.id = attribute.category_id
       WHERE attribute.id = $1
         AND attribute.enabled = true
         AND category.enabled = true
       ${client ? 'FOR UPDATE OF attribute, category' : ''}`,
      [attributeId],
    );
    const attribute = result.rows[0];
    if (!attribute) {
      throw new NotFoundException('Enabled marketplace product attribute not found');
    }
    return attribute;
  }

  private async getValueForUpdate(
    client: PoolClient,
    valueId: string,
  ): Promise<MarketplaceAttributeValueRow> {
    const result = await client.query<MarketplaceAttributeValueRow>(
      `SELECT id, attribute_id, code, value, enabled, sort_order,
              created_at, updated_at
       FROM marketplace_product_attribute_values
       WHERE id = $1
       FOR UPDATE`,
      [valueId],
    );
    const attributeValue = result.rows[0];
    if (!attributeValue) {
      throw new NotFoundException('Marketplace product attribute value not found');
    }
    return attributeValue;
  }

  private async ensureAttributeAvailable(
    client: PoolClient,
    categoryId: string,
    code: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_attributes
       WHERE category_id = $1
         AND ($4::uuid IS NULL OR id <> $4)
         AND (lower(code) = lower($2) OR lower(name) = lower($3))`,
      [categoryId, code, name, excludedId ?? null],
    );
    if (result.rows[0]) {
      throw new ConflictException(
        'An attribute with this code or name already exists in the category',
      );
    }
  }

  private async ensureValueAvailable(
    client: PoolClient,
    attributeId: string,
    code: string,
    value: string,
    excludedId?: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_attribute_values
       WHERE attribute_id = $1
         AND ($4::uuid IS NULL OR id <> $4)
         AND (lower(code) = lower($2) OR lower(value) = lower($3))`,
      [attributeId, code, value, excludedId ?? null],
    );
    if (result.rows[0]) {
      throw new ConflictException(
        'An attribute value with this code or value already exists',
      );
    }
  }

  private async lockAttributeConfiguration(client: PoolClient): Promise<void> {
    await client.query(
      'LOCK TABLE marketplace_product_attributes, marketplace_product_attribute_values IN SHARE ROW EXCLUSIVE MODE',
    );
  }

  private requiredValue(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required`);
    }
    return trimmed;
  }

  private async withUniqueConflict<T>(
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  private attributeAuditData(attribute: MarketplaceAttributeRow) {
    return {
      categoryId: attribute.category_id,
      code: attribute.code,
      name: attribute.name,
      enabled: attribute.enabled,
      sortOrder: attribute.sort_order,
    };
  }

  private valueAuditData(value: MarketplaceAttributeValueRow) {
    return {
      attributeId: value.attribute_id,
      code: value.code,
      value: value.value,
      enabled: value.enabled,
      sortOrder: value.sort_order,
    };
  }
}
