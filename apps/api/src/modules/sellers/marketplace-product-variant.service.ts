import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import type { CreateMarketplaceProductVariantDto } from './dto/create-marketplace-product-variant.dto';
import type { UpdateMarketplaceProductVariantDto } from './dto/update-marketplace-product-variant.dto';
import type { VariantAttributeSelectionDto } from './dto/variant-attribute-selection.dto';

interface OwnedProduct {
  id: string;
  seller_id: string;
  price_minor?: string | number | null;
  currency?: CurrencyCode | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  combination_key: string;
  enabled: boolean;
  price_minor: string | number;
  currency: CurrencyCode;
  created_at: Date;
  updated_at: Date;
}

interface VariantSelectionRow extends VariantAttributeSelectionDto {
  id: string;
  product_id: string;
  attribute_code: string;
  attribute_name: string;
  value_code: string;
  value: string;
}

export interface MarketplaceProductVariant {
  id: string;
  productId: string;
  sku: string;
  priceMinor: number;
  currency: CurrencyCode;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  attributeValues: Array<{
    attributeId: string;
    attributeCode: string;
    attributeName: string;
    valueId: string;
    valueCode: string;
    value: string;
  }>;
}

@Injectable()
export class MarketplaceProductVariantService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async createVariant(
    userId: string,
    productId: string,
    dto: CreateMarketplaceProductVariantDto,
  ): Promise<MarketplaceProductVariant> {
    const sku = this.requiredSku(dto.sku);
    this.validatePrice(dto.priceMinor);
    const attributeValues = this.normalizeSelections(dto.attributeValues);
    this.validateSelections(attributeValues);
    return this.withUniqueConflict(() =>
      this.database.withTransaction(async (client) => {
        const product = await this.requireOwnedProduct(
          (query, values) => client.query<OwnedProduct>(query, values),
          userId,
          productId,
          true,
        );
        const selections = await this.validateAssignedSelections(
          client,
          productId,
          attributeValues,
        );
        await this.requireCurrency(client, dto.currency);
        if (
          product.price_minor !== undefined &&
          product.price_minor !== null
        ) {
          await client.query(
            `UPDATE marketplace_products
             SET price_minor = NULL, currency = NULL, updated_at = now()
             WHERE id = $1 AND seller_id = $2`,
            [productId, product.seller_id],
          );
          await this.audit.record(
            {
              actorId: userId,
              action: 'MARKETPLACE_PRODUCT_PRICE_CLEARED_FOR_VARIANTS',
              resourceType: 'MARKETPLACE_PRODUCT',
              resourceId: productId,
              beforeData: {
                priceMinor: this.toSafeMinor(product.price_minor),
                currency: product.currency,
              },
              afterData: { priceMinor: null, currency: null },
            },
            client,
          );
        }
        const combinationKey = this.combinationKey(attributeValues);
        const result = await client.query<VariantRow>(
          `INSERT INTO marketplace_product_variants (
             product_id, sku, combination_key, price_minor, currency
           )
           VALUES ($1, $2, $3, $4, $5::currency_code)
           RETURNING id, product_id, sku, combination_key, price_minor,
                     currency, enabled,
                     created_at, updated_at`,
          [productId, sku, combinationKey, dto.priceMinor, dto.currency],
        );
        const variant = result.rows[0];
        for (const selection of selections) {
          await client.query(
            `INSERT INTO marketplace_product_variant_attribute_values (
               variant_id, product_id, attribute_id, attribute_value_id
             )
             VALUES ($1, $2, $3, $4)`,
            [
              variant.id,
              productId,
              selection.attributeId,
              selection.valueId,
            ],
          );
        }
        await this.audit.record(
          {
            actorId: userId,
            action: 'MARKETPLACE_PRODUCT_VARIANT_CREATED',
            resourceType: 'MARKETPLACE_PRODUCT_VARIANT',
            resourceId: variant.id,
            afterData: {
              productId,
              sku: variant.sku,
              priceMinor: this.toSafeMinor(variant.price_minor),
              currency: variant.currency,
              enabled: variant.enabled,
              attributeValues: this.assignmentAuditData(attributeValues),
            },
          },
          client,
        );
        return this.getVariantInTransaction(client, productId, variant.id);
      }),
    );
  }

  async listVariants(
    userId: string,
    productId: string,
  ): Promise<MarketplaceProductVariant[]> {
    await this.requireOwnedProduct(
      (query, values) => this.database.query<OwnedProduct>(query, values),
      userId,
      productId,
    );
    const variants = await this.database.query<VariantRow>(
      `SELECT id, product_id, sku, combination_key, enabled,
              price_minor, currency,
              created_at, updated_at
       FROM marketplace_product_variants
       WHERE product_id = $1
       ORDER BY created_at, id`,
      [productId],
    );
    if (!variants.rows.length) {
      return [];
    }
    const selections = await this.database.query<VariantSelectionRow>(
      `SELECT selected.variant_id AS id,
              selected.product_id,
              selected.attribute_id AS "attributeId",
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected.attribute_value_id AS "valueId",
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_variant_attribute_values selected
       JOIN marketplace_product_attributes attribute
         ON attribute.id = selected.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected.attribute_value_id
        AND attribute_value.attribute_id = selected.attribute_id
       WHERE selected.product_id = $1
       ORDER BY selected.variant_id, attribute.sort_order, attribute.id`,
      [productId],
    );
    return this.mapVariants(variants.rows, selections.rows);
  }

  async getVariant(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<MarketplaceProductVariant> {
    await this.requireOwnedProduct(
      (query, values) => this.database.query<OwnedProduct>(query, values),
      userId,
      productId,
    );
    const variant = await this.database.query<VariantRow>(
      `SELECT id, product_id, sku, combination_key, enabled,
              price_minor, currency,
              created_at, updated_at
       FROM marketplace_product_variants
       WHERE product_id = $1 AND id = $2`,
      [productId, variantId],
    );
    if (!variant.rows[0]) {
      throw new NotFoundException('Marketplace product variant not found');
    }
    const selectionRows = await this.database.query<VariantSelectionRow>(
      `SELECT selected.variant_id AS id,
              selected.product_id,
              selected.attribute_id AS "attributeId",
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected.attribute_value_id AS "valueId",
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_variant_attribute_values selected
       JOIN marketplace_product_attributes attribute
         ON attribute.id = selected.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected.attribute_value_id
        AND attribute_value.attribute_id = selected.attribute_id
       WHERE selected.product_id = $1 AND selected.variant_id = $2
       ORDER BY attribute.sort_order, attribute.id`,
      [productId, variantId],
    );
    return this.mapVariants(variant.rows, selectionRows.rows)[0];
  }

  async updateVariant(
    userId: string,
    productId: string,
    variantId: string,
    dto: UpdateMarketplaceProductVariantDto,
  ): Promise<MarketplaceProductVariant> {
    const sku = dto.sku === undefined ? undefined : this.requiredSku(dto.sku);
    if (dto.priceMinor !== undefined) {
      this.validatePrice(dto.priceMinor);
    }
    if (dto.currency !== undefined && dto.priceMinor === undefined) {
      throw new BadRequestException(
        'A price amount is required when changing variant currency',
      );
    }
    const requestedSelections =
      dto.attributeValues === undefined
        ? undefined
        : this.normalizeSelections(dto.attributeValues);
    if (requestedSelections !== undefined) {
      this.validateSelections(requestedSelections);
    }
    return this.withUniqueConflict(() =>
      this.database.withTransaction(async (client) => {
        await this.requireOwnedProduct(
          (query, values) => client.query<OwnedProduct>(query, values),
          userId,
          productId,
          true,
        );
        const currentResult = await client.query<VariantRow>(
          `SELECT id, product_id, sku, combination_key, enabled,
                  price_minor, currency,
                  created_at, updated_at
           FROM marketplace_product_variants
           WHERE product_id = $1 AND id = $2
           FOR UPDATE`,
          [productId, variantId],
        );
        const current = currentResult.rows[0];
        if (!current) {
          throw new NotFoundException('Marketplace product variant not found');
        }
        if (dto.currency !== undefined) {
          await this.requireCurrency(client, dto.currency);
        }

        let selections: VariantAttributeSelectionDto[];
        let combinationKey = current.combination_key;
        if (requestedSelections !== undefined) {
          selections = await this.validateAssignedSelections(
            client,
            productId,
            requestedSelections,
          );
          combinationKey = this.combinationKey(requestedSelections);
        } else {
          selections = await this.readSelectionIds(client, productId, variantId);
        }

        const result = await client.query<VariantRow>(
          `UPDATE marketplace_product_variants
           SET sku = $1, combination_key = $2, enabled = $3,
               price_minor = $4, currency = $5::currency_code,
               updated_at = now()
           WHERE product_id = $6 AND id = $7
           RETURNING id, product_id, sku, combination_key, enabled,
                     price_minor, currency,
                     created_at, updated_at`,
          [
            sku ?? current.sku,
            combinationKey,
            dto.enabled ?? current.enabled,
            dto.priceMinor ?? this.toSafeMinor(current.price_minor),
            dto.currency ?? current.currency,
            productId,
            variantId,
          ],
        );
        if (requestedSelections !== undefined) {
          await client.query(
            `DELETE FROM marketplace_product_variant_attribute_values
             WHERE product_id = $1 AND variant_id = $2`,
            [productId, variantId],
          );
          for (const selection of selections) {
            await client.query(
              `INSERT INTO marketplace_product_variant_attribute_values (
                 variant_id, product_id, attribute_id, attribute_value_id
               )
               VALUES ($1, $2, $3, $4)`,
              [
                variantId,
                productId,
                selection.attributeId,
                selection.valueId,
              ],
            );
          }
        }
        await this.audit.record(
          {
            actorId: userId,
            action: 'MARKETPLACE_PRODUCT_VARIANT_UPDATED',
            resourceType: 'MARKETPLACE_PRODUCT_VARIANT',
            resourceId: variantId,
            beforeData: {
              productId,
              sku: current.sku,
              priceMinor: this.toSafeMinor(current.price_minor),
              currency: current.currency,
              enabled: current.enabled,
              combinationKey: current.combination_key,
            },
            afterData: {
              productId,
              sku: result.rows[0].sku,
              priceMinor: this.toSafeMinor(result.rows[0].price_minor),
              currency: result.rows[0].currency,
              enabled: result.rows[0].enabled,
              combinationKey: result.rows[0].combination_key,
            },
          },
          client,
        );
        return this.getVariantInTransaction(client, productId, variantId);
      }),
    );
  }

  async deleteVariant(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(
        (query, values) => client.query<OwnedProduct>(query, values),
        userId,
        productId,
        true,
      );
      const result = await client.query<VariantRow>(
        `SELECT id, product_id, sku, combination_key, enabled,
                price_minor, currency,
                created_at, updated_at
         FROM marketplace_product_variants
         WHERE product_id = $1 AND id = $2
         FOR UPDATE`,
        [productId, variantId],
      );
      const variant = result.rows[0];
      if (!variant) {
        throw new NotFoundException('Marketplace product variant not found');
      }
      const selections = await this.readSelectionIds(
        client,
        productId,
        variantId,
      );
      await client.query(
        `DELETE FROM marketplace_product_variants
         WHERE product_id = $1 AND id = $2`,
        [productId, variantId],
      );
      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_PRODUCT_VARIANT_DELETED',
          resourceType: 'MARKETPLACE_PRODUCT_VARIANT',
          resourceId: variantId,
          beforeData: {
            productId,
            sku: variant.sku,
            priceMinor: this.toSafeMinor(variant.price_minor),
            currency: variant.currency,
            enabled: variant.enabled,
            attributeValues: this.assignmentAuditData(selections),
          },
          afterData: null,
        },
        client,
      );
    });
  }

  private async validateAssignedSelections(
    client: PoolClient,
    productId: string,
    requested: VariantAttributeSelectionDto[],
  ): Promise<VariantAttributeSelectionDto[]> {
    if (!requested.length) {
      throw new BadRequestException(
        'A variant requires a value for every product attribute',
      );
    }
    const result = await client.query<{
      attribute_id: string;
      attribute_enabled: boolean;
      category_enabled: boolean;
      attribute_value_id: string;
      value_enabled: boolean;
    }>(
      `SELECT assignment.attribute_id,
              attribute.enabled AS attribute_enabled,
              category.enabled AS category_enabled,
              assignment_value.attribute_value_id,
              attribute_value.enabled AS value_enabled
       FROM marketplace_product_attribute_assignments assignment
       JOIN marketplace_products product
         ON product.id = assignment.product_id
       JOIN marketplace_product_categories category
         ON category.id = product.category_id
       JOIN marketplace_product_attributes attribute
         ON attribute.id = assignment.attribute_id
        AND attribute.category_id = product.category_id
       JOIN marketplace_product_attribute_assignment_values assignment_value
         ON assignment_value.product_id = assignment.product_id
        AND assignment_value.attribute_id = assignment.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = assignment_value.attribute_value_id
        AND attribute_value.attribute_id = assignment.attribute_id
       WHERE assignment.product_id = $1
       ORDER BY assignment.attribute_id, assignment_value.attribute_value_id
       FOR SHARE OF assignment, product, category, attribute,
                    assignment_value, attribute_value`,
      [productId],
    );
    const choicesByAttribute = new Map<string, Set<string>>();
    for (const row of result.rows) {
      if (!row.category_enabled) {
        throw new BadRequestException('Product category is disabled');
      }
      if (!row.attribute_enabled) {
        throw new BadRequestException(
          'A product attribute is disabled and cannot be used for a new variant',
        );
      }
      const choices = choicesByAttribute.get(row.attribute_id) ?? new Set();
      if (row.value_enabled) {
        choices.add(row.attribute_value_id);
      }
      choicesByAttribute.set(row.attribute_id, choices);
    }
    if (!choicesByAttribute.size) {
      throw new BadRequestException(
        'Assign configured product attributes and values before creating variants',
      );
    }
    if (requested.length !== choicesByAttribute.size) {
      throw new BadRequestException(
        'A variant must select exactly one value for every attribute assigned to the product',
      );
    }
    for (const selection of requested) {
      const validValues = choicesByAttribute.get(selection.attributeId);
      if (!validValues?.has(selection.valueId)) {
        throw new BadRequestException(
          'Each variant selection must use a value assigned to its product attribute',
        );
      }
    }
    return requested;
  }

  private async requireOwnedProduct(
    query: (
      statement: string,
      values?: unknown[],
    ) => Promise<{ rows: OwnedProduct[] }>,
    userId: string,
    productId: string,
    lock = false,
  ): Promise<OwnedProduct> {
    const result = await query(
      `SELECT product.id, product.seller_id,
              product.price_minor, product.currency
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1 AND product.id = $2
       ${lock ? 'FOR UPDATE OF product' : ''}`,
      [userId, productId],
    );
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }
    return product;
  }

  private async readSelectionIds(
    client: PoolClient,
    productId: string,
    variantId: string,
  ): Promise<VariantAttributeSelectionDto[]> {
    const result = await client.query<VariantAttributeSelectionDto>(
      `SELECT attribute_id AS "attributeId",
              attribute_value_id AS "valueId"
       FROM marketplace_product_variant_attribute_values
       WHERE product_id = $1 AND variant_id = $2
       ORDER BY attribute_id`,
      [productId, variantId],
    );
    return result.rows;
  }

  private async getVariantInTransaction(
    client: PoolClient,
    productId: string,
    variantId: string,
  ): Promise<MarketplaceProductVariant> {
    const result = await client.query<VariantRow>(
      `SELECT id, product_id, sku, combination_key, enabled,
              price_minor, currency,
              created_at, updated_at
       FROM marketplace_product_variants
       WHERE product_id = $1 AND id = $2`,
      [productId, variantId],
    );
    const variant = result.rows[0];
    if (!variant) {
      throw new NotFoundException('Marketplace product variant not found');
    }
    const selections = await client.query<VariantSelectionRow>(
      `SELECT selected.variant_id AS id,
              selected.product_id,
              selected.attribute_id AS "attributeId",
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected.attribute_value_id AS "valueId",
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_variant_attribute_values selected
       JOIN marketplace_product_attributes attribute
         ON attribute.id = selected.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected.attribute_value_id
        AND attribute_value.attribute_id = selected.attribute_id
       WHERE selected.product_id = $1 AND selected.variant_id = $2
       ORDER BY attribute.sort_order, attribute.id`,
      [productId, variantId],
    );
    return this.mapVariants([variant], selections.rows)[0];
  }

  private mapVariants(
    variants: VariantRow[],
    selections: VariantSelectionRow[],
  ): MarketplaceProductVariant[] {
    const selectionsByVariant = new Map<string, MarketplaceProductVariant['attributeValues']>();
    for (const selection of selections) {
      const values = selectionsByVariant.get(selection.id) ?? [];
      values.push({
        attributeId: selection.attributeId,
        attributeCode: selection.attribute_code,
        attributeName: selection.attribute_name,
        valueId: selection.valueId,
        valueCode: selection.value_code,
        value: selection.value,
      });
      selectionsByVariant.set(selection.id, values);
    }
    return variants.map((variant) => ({
      id: variant.id,
      productId: variant.product_id,
      sku: variant.sku,
      priceMinor: this.toSafeMinor(variant.price_minor),
      currency: variant.currency,
      enabled: variant.enabled,
      createdAt: variant.created_at,
      updatedAt: variant.updated_at,
      attributeValues: selectionsByVariant.get(variant.id) ?? [],
    }));
  }

  private validateSelections(
    selections: VariantAttributeSelectionDto[],
  ): void {
    const attributes = new Set<string>();
    for (const selection of selections) {
      if (attributes.has(selection.attributeId)) {
        throw new BadRequestException(
          'A variant cannot select an attribute more than once',
        );
      }
      attributes.add(selection.attributeId);
    }
  }

  private normalizeSelections(
    selections: VariantAttributeSelectionDto[],
  ): VariantAttributeSelectionDto[] {
    return selections.map(({ attributeId, valueId }) => ({
      attributeId: attributeId.toLowerCase(),
      valueId: valueId.toLowerCase(),
    }));
  }

  private combinationKey(selections: VariantAttributeSelectionDto[]): string {
    return [...selections]
      .sort((left, right) =>
        left.attributeId.toLowerCase().localeCompare(right.attributeId.toLowerCase()),
      )
      .map(({ attributeId, valueId }) =>
        `${attributeId.toLowerCase()}:${valueId.toLowerCase()}`,
      )
      .join('|');
  }

  private requiredSku(value: string): string {
    const sku = value.trim();
    if (!sku) {
      throw new BadRequestException('Variant SKU is required');
    }
    return sku;
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
        'Stored variant price is outside the supported integer range',
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

  private async withUniqueConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Variant SKU or attribute combination already exists for this product',
        );
      }
      throw error;
    }
  }

  private assignmentAuditData(
    selections: VariantAttributeSelectionDto[],
  ) {
    return [...selections]
      .map(({ attributeId, valueId }) => ({ attributeId, valueId }))
      .sort((left, right) => left.attributeId.localeCompare(right.attributeId));
  }
}
