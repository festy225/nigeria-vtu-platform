import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import type { ReplaceProductAttributesDto } from './dto/replace-product-attributes.dto';

interface OwnedProductRow {
  id: string;
  category_id: string;
  seller_id: string;
}

interface SelectedAttributeRow {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
}

interface SelectedValueRow {
  id: string;
  attribute_id: string;
  code: string;
  value: string;
  enabled: boolean;
}

export interface ProductAttributeAssignment {
  attributeId: string;
  code: string;
  name: string;
  values: Array<{
    id: string;
    code: string;
    value: string;
  }>;
}

@Injectable()
export class MarketplaceProductAttributeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getAssignments(
    userId: string,
    productId: string,
  ): Promise<ProductAttributeAssignment[]> {
    await this.requireOwnedProduct(
      (query, values) => this.database.query<OwnedProductRow>(query, values),
      userId,
      productId,
    );
    const result = await this.database.query<{
      attribute_id: string;
      attribute_code: string;
      attribute_name: string;
      value_id: string;
      value_code: string;
      value: string;
    }>(
      `SELECT assignment.attribute_id,
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected_value.attribute_value_id AS value_id,
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_attribute_assignments assignment
       JOIN marketplace_product_attributes attribute
         ON attribute.id = assignment.attribute_id
       JOIN marketplace_product_attribute_assignment_values selected_value
         ON selected_value.product_id = assignment.product_id
        AND selected_value.attribute_id = assignment.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected_value.attribute_value_id
        AND attribute_value.attribute_id = assignment.attribute_id
       WHERE assignment.product_id = $1
       ORDER BY attribute.sort_order, attribute.name, attribute.id,
                attribute_value.sort_order, attribute_value.value,
                attribute_value.id`,
      [productId],
    );

    const assignments = new Map<string, ProductAttributeAssignment>();
    for (const row of result.rows) {
      let assignment = assignments.get(row.attribute_id);
      if (!assignment) {
        assignment = {
          attributeId: row.attribute_id,
          code: row.attribute_code,
          name: row.attribute_name,
          values: [],
        };
        assignments.set(row.attribute_id, assignment);
      }
      assignment.values.push({
        id: row.value_id,
        code: row.value_code,
        value: row.value,
      });
    }
    return Array.from(assignments.values());
  }

  async replaceAssignments(
    userId: string,
    productId: string,
    dto: ReplaceProductAttributesDto,
  ): Promise<ProductAttributeAssignment[]> {
    this.validateSelections(dto);

    return this.database.withTransaction(async (client) => {
      const product = await this.requireOwnedProduct(
        (query, values) => client.query<OwnedProductRow>(query, values),
        userId,
        productId,
        true,
      );
      await this.requireEnabledCategory(client, product.category_id);

      const attributeIds = dto.attributes.map((selection) => selection.attributeId);
      const valueIds = dto.attributes.flatMap((selection) => selection.valueIds);
      const attributes = await this.lockAndValidateAttributes(
        client,
        product.category_id,
        attributeIds,
      );
      const values = await this.lockAndValidateValues(
        client,
        attributes,
        dto.attributes,
        valueIds,
      );
      const before = await this.readAssignmentIds(client, productId);

      await client.query(
        `DELETE FROM marketplace_product_attribute_assignments
         WHERE product_id = $1`,
        [productId],
      );
      for (const attribute of attributes) {
        await client.query(
          `INSERT INTO marketplace_product_attribute_assignments (
             product_id, category_id, attribute_id
           )
           VALUES ($1, $2, $3)`,
          [productId, product.category_id, attribute.id],
        );
      }
      for (const value of values) {
        await client.query(
          `INSERT INTO marketplace_product_attribute_assignment_values (
             product_id, attribute_id, attribute_value_id
           )
           VALUES ($1, $2, $3)`,
          [productId, value.attribute_id, value.id],
        );
      }

      const after = this.assignmentIds(dto);
      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_PRODUCT_ATTRIBUTES_REPLACED',
          resourceType: 'MARKETPLACE_PRODUCT',
          resourceId: productId,
          beforeData: before,
          afterData: after,
        },
        client,
      );
      return this.getAssignmentsInTransaction(client, productId);
    });
  }

  async removeAssignment(
    userId: string,
    productId: string,
    attributeId: string,
  ): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(
        (query, values) => client.query<OwnedProductRow>(query, values),
        userId,
        productId,
        true,
      );
      const current = await client.query<{ attribute_id: string }>(
        `SELECT attribute_id
         FROM marketplace_product_attribute_assignments
         WHERE product_id = $1 AND attribute_id = $2
         FOR UPDATE`,
        [productId, attributeId],
      );
      if (!current.rows[0]) {
        throw new NotFoundException('Product attribute assignment not found');
      }
      await client.query(
        `DELETE FROM marketplace_product_attribute_assignments
         WHERE product_id = $1 AND attribute_id = $2`,
        [productId, attributeId],
      );
      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_REMOVED',
          resourceType: 'MARKETPLACE_PRODUCT',
          resourceId: productId,
          beforeData: { attributeId },
          afterData: null,
        },
        client,
      );
    });
  }

  private async requireOwnedProduct(
    query: (
      statement: string,
      values?: unknown[],
    ) => Promise<{ rows: OwnedProductRow[] }>,
    userId: string,
    productId: string,
    lock = false,
  ): Promise<OwnedProductRow> {
    const result = await query(
      `SELECT product.id, product.category_id, product.seller_id
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

  private async requireEnabledCategory(
    client: PoolClient,
    categoryId: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_categories
       WHERE id = $1 AND enabled = true
       FOR SHARE`,
      [categoryId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('Product category is disabled');
    }
  }

  private async lockAndValidateAttributes(
    client: PoolClient,
    categoryId: string,
    attributeIds: string[],
  ): Promise<SelectedAttributeRow[]> {
    if (!attributeIds.length) {
      return [];
    }
    const result = await client.query<SelectedAttributeRow>(
      `SELECT attribute.id, attribute.code, attribute.name, attribute.enabled
       FROM marketplace_product_attributes attribute
       WHERE attribute.id = ANY($1::uuid[])
         AND attribute.category_id = $2
         AND attribute.enabled = true
       ORDER BY attribute.id
       FOR SHARE`,
      [attributeIds, categoryId],
    );
    if (result.rows.length !== attributeIds.length) {
      throw new BadRequestException(
        'Every selected attribute must be enabled and belong to the product category',
      );
    }
    return result.rows;
  }

  private async lockAndValidateValues(
    client: PoolClient,
    attributes: SelectedAttributeRow[],
    selections: ReplaceProductAttributesDto['attributes'],
    valueIds: string[],
  ): Promise<SelectedValueRow[]> {
    if (!valueIds.length) {
      return [];
    }
    const result = await client.query<SelectedValueRow>(
      `SELECT id, attribute_id, code, value, enabled
       FROM marketplace_product_attribute_values
       WHERE id = ANY($1::uuid[]) AND enabled = true
       ORDER BY id
       FOR SHARE`,
      [valueIds],
    );
    const valueById = new Map(result.rows.map((value) => [value.id, value]));
    for (const selection of selections) {
      for (const valueId of selection.valueIds) {
        const value = valueById.get(valueId);
        if (!value?.enabled || value.attribute_id !== selection.attributeId) {
          throw new BadRequestException(
            'Every selected value must be enabled and belong to its selected attribute',
          );
        }
      }
    }
    return result.rows;
  }

  private async readAssignmentIds(
    client: PoolClient,
    productId: string,
  ): Promise<Array<{ attributeId: string; valueIds: string[] }>> {
    const result = await client.query<{
      attribute_id: string;
      attribute_value_id: string;
    }>(
      `SELECT assignment.attribute_id,
              selected_value.attribute_value_id
       FROM marketplace_product_attribute_assignments assignment
       LEFT JOIN marketplace_product_attribute_assignment_values selected_value
         ON selected_value.product_id = assignment.product_id
        AND selected_value.attribute_id = assignment.attribute_id
       WHERE assignment.product_id = $1
       ORDER BY assignment.attribute_id, selected_value.attribute_value_id`,
      [productId],
    );
    const assignments = new Map<string, string[]>();
    for (const row of result.rows) {
      const values = assignments.get(row.attribute_id) ?? [];
      if (row.attribute_value_id) {
        values.push(row.attribute_value_id);
      }
      assignments.set(row.attribute_id, values);
    }
    return Array.from(assignments, ([attributeId, valueIds]) => ({
      attributeId,
      valueIds,
    }));
  }

  private async getAssignmentsInTransaction(
    client: PoolClient,
    productId: string,
  ): Promise<ProductAttributeAssignment[]> {
    const result = await client.query<{
      attribute_id: string;
      attribute_code: string;
      attribute_name: string;
      value_id: string;
      value_code: string;
      value: string;
    }>(
      `SELECT assignment.attribute_id,
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected_value.attribute_value_id AS value_id,
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_attribute_assignments assignment
       JOIN marketplace_product_attributes attribute
         ON attribute.id = assignment.attribute_id
       JOIN marketplace_product_attribute_assignment_values selected_value
         ON selected_value.product_id = assignment.product_id
        AND selected_value.attribute_id = assignment.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected_value.attribute_value_id
        AND attribute_value.attribute_id = assignment.attribute_id
       WHERE assignment.product_id = $1
       ORDER BY attribute.sort_order, attribute.name, attribute.id,
                attribute_value.sort_order, attribute_value.value,
                attribute_value.id`,
      [productId],
    );
    const assignments = new Map<string, ProductAttributeAssignment>();
    for (const row of result.rows) {
      const assignment = assignments.get(row.attribute_id) ?? {
        attributeId: row.attribute_id,
        code: row.attribute_code,
        name: row.attribute_name,
        values: [],
      };
      assignment.values.push({
        id: row.value_id,
        code: row.value_code,
        value: row.value,
      });
      assignments.set(row.attribute_id, assignment);
    }
    return Array.from(assignments.values());
  }

  private validateSelections(dto: ReplaceProductAttributesDto): void {
    const seenAttributes = new Set<string>();
    for (const selection of dto.attributes) {
      if (seenAttributes.has(selection.attributeId)) {
        throw new BadRequestException('An attribute can only be selected once');
      }
      seenAttributes.add(selection.attributeId);
      if (!selection.valueIds.length) {
        throw new BadRequestException(
          'Each selected attribute must have at least one selected value',
        );
      }
      if (new Set(selection.valueIds).size !== selection.valueIds.length) {
        throw new BadRequestException(
          'An attribute value can only be selected once per attribute',
        );
      }
    }
  }

  private assignmentIds(dto: ReplaceProductAttributesDto) {
    return dto.attributes.map((selection) => ({
      attributeId: selection.attributeId,
      valueIds: [...selection.valueIds].sort(),
    }));
  }
}
