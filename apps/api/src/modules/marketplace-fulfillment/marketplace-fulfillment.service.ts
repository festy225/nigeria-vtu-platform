import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { SellerService } from '../sellers/seller.service';
import { LogisticsProviderRouterService } from '../providers/routing/logistics-provider-router.service';

@Injectable()
export class MarketplaceFulfillmentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sellers: SellerService,
    private readonly logistics: LogisticsProviderRouterService,
  ) {}

  async createSellerFulfillment(
    orderId: string,
    userId: string,
    customerAddressId: string,
    sellerLocationId: string,
  ) {
    return this.database.withTransaction(async (client) => {
      const sellerId = await this.sellers.getSellerIdByUserId(userId);

      const order = await client.query<{
        id: string;
        status: string;
        customer_id: string;
      }>(
        `
          SELECT id, status, customer_id
          FROM marketplace_orders
          WHERE id = $1
          FOR UPDATE
        `,
        [orderId],
      );

      if (order.rowCount === 0) {
        throw new NotFoundException('Marketplace order not found');
      }

      const orderRow = order.rows[0];

      if (!['PLACED', 'PROCESSING', 'FULFILLED'].includes(orderRow.status)) {
        throw new ConflictException(
          'Order is not eligible for fulfillment',
        );
      }

      const existing = await client.query(
        `
          SELECT id
          FROM marketplace_fulfillments
          WHERE order_id = $1
            AND seller_id = $2
          LIMIT 1
        `,
        [orderId, sellerId],
      );

      if ((existing.rowCount ?? 0) > 0) {
        throw new ConflictException(
          'Fulfillment already exists for this seller and order',
        );
      }

      const items = await client.query<{
        id: string;
        quantity: number;
      }>(
        `
          SELECT id, quantity
          FROM marketplace_order_items
          WHERE order_id = $1
            AND seller_id = $2
          ORDER BY id
        `,
        [orderId, sellerId],
      );

      if (items.rowCount === 0) {
        throw new BadRequestException(
          'Order does not contain items for this seller',
        );
      }

      const sellerLocation = await client.query(
        `
          SELECT
            id,
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
            longitude
          FROM marketplace_seller_locations
          WHERE id = $1
            AND seller_id = $2
            AND enabled = true
        `,
        [sellerLocationId, sellerId],
      );

      if (sellerLocation.rowCount === 0) {
        throw new NotFoundException(
          'Seller pickup location not found or disabled',
        );
      }

      const customerAddress = await client.query(
        `
          SELECT
            id,
            recipient_name,
            recipient_phone,
            address_line1,
            address_line2,
            city,
            state_province,
            postal_code,
            country_code,
            latitude,
            longitude
          FROM marketplace_customer_addresses
          WHERE id = $1
            AND customer_id = $2
            AND enabled = true
        `,
        [customerAddressId, orderRow.customer_id],
      );

      if (customerAddress.rowCount === 0) {
        throw new NotFoundException(
          'Customer delivery address not found or disabled',
        );
      }

      const fulfillment = await client.query<{ id: string }>(
        `
          INSERT INTO marketplace_fulfillments (
            order_id,
            seller_id,
            origin_snapshot,
            destination_snapshot
          )
          VALUES ($1, $2, $3::jsonb, $4::jsonb)
          RETURNING id
        `,
        [
          orderId,
          sellerId,
          JSON.stringify(sellerLocation.rows[0]),
          JSON.stringify(customerAddress.rows[0]),
        ],
      );

      const fulfillmentId = fulfillment.rows[0].id;

      for (const item of items.rows) {
        await client.query(
          `
            INSERT INTO marketplace_fulfillment_items (
              fulfillment_id,
              order_id,
              order_item_id,
              quantity
            )
            VALUES ($1, $2, $3, $4)
          `,
          [fulfillmentId, orderId, item.id, item.quantity],
        );
      }

      return {
        id: fulfillmentId,
        orderId,
        sellerId,
        status: 'PENDING',
      };
    });
  }

  async findSellerFulfillmentOffices(
    orderId: string,
    userId: string,
    radiusKm?: number | null,
  ) {
    const sellerId = await this.sellers.getSellerIdByUserId(userId);

    const fulfillment = await this.database.query<{
      id: string;
      origin_snapshot: {
        address_line1: string;
        address_line2?: string | null;
        city: string;
        state_province?: string | null;
        postal_code?: string | null;
        country_code: string;
        latitude?: number | null;
        longitude?: number | null;
      };
      destination_snapshot: {
        address_line1: string;
        address_line2?: string | null;
        city: string;
        state_province?: string | null;
        postal_code?: string | null;
        country_code: string;
        latitude?: number | null;
        longitude?: number | null;
      };
    }>(
      `
        SELECT
          id,
          origin_snapshot,
          destination_snapshot
        FROM marketplace_fulfillments
        WHERE order_id = $1
          AND seller_id = $2
        LIMIT 1
      `,
      [orderId, sellerId],
    );

    if (fulfillment.rowCount === 0) {
      throw new NotFoundException(
        'Fulfillment not found for this seller and order',
      );
    }

    const fulfillmentRow = fulfillment.rows[0];

    const provider = await this.logistics.getProviderRegistration();

    const result = await provider.provider.findOffices({
      origin: {
        addressLine1: fulfillmentRow.origin_snapshot.address_line1,
        addressLine2: fulfillmentRow.origin_snapshot.address_line2,
        city: fulfillmentRow.origin_snapshot.city,
        stateProvince: fulfillmentRow.origin_snapshot.state_province,
        postalCode: fulfillmentRow.origin_snapshot.postal_code,
        countryCode: fulfillmentRow.origin_snapshot.country_code,
        latitude: fulfillmentRow.origin_snapshot.latitude,
        longitude: fulfillmentRow.origin_snapshot.longitude,
      },
      destination: {
        addressLine1: fulfillmentRow.destination_snapshot.address_line1,
        addressLine2: fulfillmentRow.destination_snapshot.address_line2,
        city: fulfillmentRow.destination_snapshot.city,
        stateProvince: fulfillmentRow.destination_snapshot.state_province,
        postalCode: fulfillmentRow.destination_snapshot.postal_code,
        countryCode: fulfillmentRow.destination_snapshot.country_code,
        latitude: fulfillmentRow.destination_snapshot.latitude,
        longitude: fulfillmentRow.destination_snapshot.longitude,
      },
      radiusKm: radiusKm ?? null,
    });

    return {
      fulfillmentId: fulfillmentRow.id,
      providerConfigurationId: provider.providerConfigurationId,
      offices: result.offices,
      rawPayload: result.rawPayload,
    };
  }

  async checkSellerFulfillmentServiceability(
    orderId: string,
    userId: string,
  ) {
    const sellerId = await this.sellers.getSellerIdByUserId(userId);

    const fulfillment = await this.database.query<{
      id: string;
      origin_snapshot: {
        address_line1: string;
        address_line2?: string | null;
        city: string;
        state_province?: string | null;
        postal_code?: string | null;
        country_code: string;
        latitude?: number | null;
        longitude?: number | null;
      };
      destination_snapshot: {
        address_line1: string;
        address_line2?: string | null;
        city: string;
        state_province?: string | null;
        postal_code?: string | null;
        country_code: string;
        latitude?: number | null;
        longitude?: number | null;
      };
    }>(
      `
        SELECT
          id,
          origin_snapshot,
          destination_snapshot
        FROM marketplace_fulfillments
        WHERE order_id = $1
          AND seller_id = $2
        LIMIT 1
      `,
      [orderId, sellerId],
    );

    if (fulfillment.rowCount === 0) {
      throw new NotFoundException(
        'Fulfillment not found for this seller and order',
      );
    }

    const fulfillmentRow = fulfillment.rows[0];

    const items = await this.database.query<{
      quantity: number;
    }>(
      `
        SELECT quantity
        FROM marketplace_fulfillment_items
        WHERE fulfillment_id = $1
        ORDER BY id
      `,
      [fulfillmentRow.id],
    );

    const provider = await this.logistics.getProviderRegistration();

    const result = await provider.provider.checkServiceability({
      origin: {
        addressLine1: fulfillmentRow.origin_snapshot.address_line1,
        addressLine2: fulfillmentRow.origin_snapshot.address_line2,
        city: fulfillmentRow.origin_snapshot.city,
        stateProvince: fulfillmentRow.origin_snapshot.state_province,
        postalCode: fulfillmentRow.origin_snapshot.postal_code,
        countryCode: fulfillmentRow.origin_snapshot.country_code,
        latitude: fulfillmentRow.origin_snapshot.latitude,
        longitude: fulfillmentRow.origin_snapshot.longitude,
      },
      destination: {
        addressLine1: fulfillmentRow.destination_snapshot.address_line1,
        addressLine2: fulfillmentRow.destination_snapshot.address_line2,
        city: fulfillmentRow.destination_snapshot.city,
        stateProvince: fulfillmentRow.destination_snapshot.state_province,
        postalCode: fulfillmentRow.destination_snapshot.postal_code,
        countryCode: fulfillmentRow.destination_snapshot.country_code,
        latitude: fulfillmentRow.destination_snapshot.latitude,
        longitude: fulfillmentRow.destination_snapshot.longitude,
      },
      packages: items.rows.map((item) => ({
        quantity: item.quantity,
      })),
    });

    return {
      fulfillmentId: fulfillmentRow.id,
      providerConfigurationId: provider.providerConfigurationId,
      serviceable: result.serviceable,
      rawPayload: result.rawPayload,
    };
  }

  async getSellerFulfillment(
    orderId: string,
    sellerId: string,
  ) {
    const fulfillment = await this.database.query<{
      id: string;
      order_id: string;
      seller_id: string;
      status: string;
      provider_configuration_id: string | null;
      tracking_reference: string | null;
      origin_snapshot: unknown;
      destination_snapshot: unknown;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        SELECT
          id,
          order_id,
          seller_id,
          status,
          provider_configuration_id,
          tracking_reference,
          origin_snapshot,
          destination_snapshot,
          created_at,
          updated_at
        FROM marketplace_fulfillments
        WHERE order_id = $1
          AND seller_id = $2
        LIMIT 1
      `,
      [orderId, sellerId],
    );

    if (fulfillment.rowCount === 0) {
      throw new NotFoundException(
        'Fulfillment not found for this seller and order',
      );
    }

    const fulfillmentRow = fulfillment.rows[0];

    const items = await this.database.query<{
      id: string;
      order_item_id: string;
      quantity: number;
    }>(
      `
        SELECT
          id,
          order_item_id,
          quantity
        FROM marketplace_fulfillment_items
        WHERE fulfillment_id = $1
        ORDER BY id
      `,
      [fulfillmentRow.id],
    );

    return {
      ...fulfillmentRow,
      items: items.rows,
    };
  }

}