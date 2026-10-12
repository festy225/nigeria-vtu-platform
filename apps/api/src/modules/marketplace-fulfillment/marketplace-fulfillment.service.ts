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

      const provider = await this.logistics.getProviderRegistration();

      const fulfillment = await client.query<{ id: string }>(
        `
          INSERT INTO marketplace_fulfillments (
            order_id,
            seller_id,
            provider_configuration_id,
            origin_snapshot,
            destination_snapshot
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
          RETURNING id
        `,
        [
          orderId,
          sellerId,
          provider.providerConfigurationId,
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
      provider_configuration_id: string | null;
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
          provider_configuration_id,
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

    if (!fulfillmentRow.provider_configuration_id) {
      throw new BadRequestException(
        'Fulfillment logistics provider configuration is missing',
      );
    }

    const provider =
      await this.logistics.getProviderRegistrationByConfigurationId(
        fulfillmentRow.provider_configuration_id,
      );

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
      provider_configuration_id: string | null;
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
          provider_configuration_id,
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

    if (!fulfillmentRow.provider_configuration_id) {
      throw new BadRequestException(
        'Fulfillment logistics provider configuration is missing',
      );
    }

    const provider =
      await this.logistics.getProviderRegistrationByConfigurationId(
        fulfillmentRow.provider_configuration_id,
      );

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

  async selectSellerFulfillmentOffice(
    orderId: string,
    userId: string,
    providerOfficeId: string,
  ) {
    return this.database.withTransaction(async (client) => {
      const sellerId = await this.sellers.getSellerIdByUserId(userId);

      const fulfillment = await client.query<{
        id: string;
        order_id: string;
        seller_id: string;
        status: string;
        provider_configuration_id: string | null;
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
            order_id,
            seller_id,
            status,
            provider_configuration_id,
            origin_snapshot,
            destination_snapshot
          FROM marketplace_fulfillments
          WHERE order_id = $1
            AND seller_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [orderId, sellerId],
      );

      if (fulfillment.rowCount === 0) {
        throw new NotFoundException(
          'Fulfillment not found for this seller and order',
        );
      }

      const fulfillmentRow = fulfillment.rows[0];

      if (fulfillmentRow.status !== 'PENDING') {
        throw new ConflictException(
          'Fulfillment office can only be selected while the fulfillment is pending',
        );
      }

      if (!fulfillmentRow.provider_configuration_id) {
        throw new BadRequestException(
          'Fulfillment logistics provider configuration is missing',
        );
      }

      const provider =
        await this.logistics.getProviderRegistrationByConfigurationId(
          fulfillmentRow.provider_configuration_id,
        );

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
        radiusKm: null,
      });

      const selectedOffice = result.offices.find(
        (office) => office.providerOfficeId === providerOfficeId,
      );

      if (!selectedOffice) {
        throw new NotFoundException(
          'Selected logistics office was not found',
        );
      }

      if (!selectedOffice.pickupAvailable) {
        throw new BadRequestException(
          'Selected logistics office does not support pickup',
        );
      }

      await client.query(
        `
          UPDATE marketplace_fulfillments
          SET
            selected_office_id = $1,
            selected_office_snapshot = $2::jsonb,
            status = 'READY_FOR_FULFILLMENT',
            updated_at = now()
          WHERE id = $3
        `,
        [
          selectedOffice.providerOfficeId,
          JSON.stringify(selectedOffice),
          fulfillmentRow.id,
        ],
      );

      return {
        fulfillmentId: fulfillmentRow.id,
        orderId: fulfillmentRow.order_id,
        sellerId: fulfillmentRow.seller_id,
        providerConfigurationId:
          provider.providerConfigurationId,
        selectedOfficeId: selectedOffice.providerOfficeId,
        selectedOffice,
        status: 'READY_FOR_FULFILLMENT',
      };
    });
  }

  async bookSellerFulfillment(
    orderId: string,
    userId: string,
  ) {
    // Claim the booking in a short transaction. Never hold a database
    // transaction open while waiting for an external logistics provider.
    const booking = await this.database.withTransaction(async (client) => {
      const sellerId = await this.sellers.getSellerIdByUserId(userId);

      const fulfillment = await client.query<{
        id: string;
        order_id: string;
        seller_id: string;
        status: string;
        provider_configuration_id: string | null;
        tracking_reference: string | null;
        booking_idempotency_key: string | null;
        booking_started_at: Date | string | null;
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
        selected_office_id: string | null;
        selected_office_snapshot: {
          providerOfficeId: string;
          name: string;
          address: {
            addressLine1: string;
            addressLine2?: string | null;
            city: string;
            stateProvince?: string | null;
            postalCode?: string | null;
            countryCode: string;
            latitude?: number | null;
            longitude?: number | null;
          };
          distanceKm?: number | null;
          phone?: string | null;
          pickupAvailable: boolean;
          deliveryAvailable: boolean;
          metadata?: Record<string, unknown>;
        } | null;
      }>(
        `
          SELECT
            id,
            order_id,
            seller_id,
            status,
            provider_configuration_id,
            tracking_reference,
            booking_idempotency_key,
            booking_started_at,
            origin_snapshot,
            destination_snapshot,
            selected_office_id,
            selected_office_snapshot
          FROM marketplace_fulfillments
          WHERE order_id = $1
            AND seller_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [orderId, sellerId],
      );

      if (fulfillment.rowCount === 0) {
        throw new NotFoundException(
          'Fulfillment not found for this seller and order',
        );
      }

      const row = fulfillment.rows[0];

      if (row.status === 'BOOKED') {
        throw new ConflictException(
          'Fulfillment shipment is already booked',
        );
      }

      if (
        row.status !== 'READY_FOR_FULFILLMENT' &&
        row.status !== 'BOOKING_IN_PROGRESS'
      ) {
        throw new ConflictException(
          'Fulfillment shipment can only be booked when it is ready for fulfillment',
        );
      }

      if (!row.provider_configuration_id) {
        throw new BadRequestException(
          'Fulfillment logistics provider configuration is missing',
        );
      }

      if (!row.selected_office_id || !row.selected_office_snapshot) {
        throw new BadRequestException(
          'A logistics pickup office must be selected before booking',
        );
      }

      let idempotencyKey =
        row.booking_idempotency_key ??
        `chimzo-fulfillment-${row.id}`;

      if (row.status === 'BOOKING_IN_PROGRESS') {
        const startedAt = row.booking_started_at
          ? new Date(row.booking_started_at).getTime()
          : 0;

        const recoveryWindowMs = 5 * 60 * 1000;
        const isStale =
          !Number.isFinite(startedAt) ||
          startedAt <= 0 ||
          Date.now() - startedAt >= recoveryWindowMs;

        if (!isStale) {
          throw new ConflictException(
            'Shipment booking is already in progress. Retry after the recovery window if the result remains uncertain.',
          );
        }

        // Reuse the exact same key on recovery. Do not create a new
        // provider-side shipment identity for the same fulfillment.
      }

      const items = await client.query<{ quantity: number }>(
        `
          SELECT quantity
          FROM marketplace_fulfillment_items
          WHERE fulfillment_id = $1
          ORDER BY id
        `,
        [row.id],
      );

      if (items.rowCount === 0) {
        throw new BadRequestException(
          'Fulfillment does not contain any items',
        );
      }

      await client.query(
        `
          UPDATE marketplace_fulfillments
          SET
            status = 'BOOKING_IN_PROGRESS',
            booking_idempotency_key = $1,
            booking_started_at = now(),
            updated_at = now()
          WHERE id = $2
        `,
        [idempotencyKey, row.id],
      );

      return {
        fulfillment: row,
        sellerId,
        idempotencyKey,
        items: items.rows,
      };
    });

    const row = booking.fulfillment;
    const provider =
      await this.logistics.getProviderRegistrationByConfigurationId(
        row.provider_configuration_id!,
      );

    let result: Awaited<
      ReturnType<typeof provider.provider.bookShipment>
    >;

    try {
      result = await provider.provider.bookShipment({
        idempotencyKey: booking.idempotencyKey,
        origin: {
          addressLine1: row.origin_snapshot.address_line1,
          addressLine2: row.origin_snapshot.address_line2,
          city: row.origin_snapshot.city,
          stateProvince: row.origin_snapshot.state_province,
          postalCode: row.origin_snapshot.postal_code,
          countryCode: row.origin_snapshot.country_code,
          latitude: row.origin_snapshot.latitude,
          longitude: row.origin_snapshot.longitude,
        },
        destination: {
          addressLine1: row.destination_snapshot.address_line1,
          addressLine2: row.destination_snapshot.address_line2,
          city: row.destination_snapshot.city,
          stateProvince: row.destination_snapshot.state_province,
          postalCode: row.destination_snapshot.postal_code,
          countryCode: row.destination_snapshot.country_code,
          latitude: row.destination_snapshot.latitude,
          longitude: row.destination_snapshot.longitude,
        },
        packages: booking.items.map((item) => ({
          quantity: item.quantity,
        })),
        selectedOffice: row.selected_office_snapshot!,
      });
    } catch {
      // The provider may have created the shipment before the connection
      // failed. Keep BOOKING_IN_PROGRESS so a retry cannot immediately
      // issue a fresh booking. Recovery reuses the same idempotency key.
      throw new ConflictException(
        'Shipment booking outcome is uncertain. The booking key has been retained for safe recovery.',
      );
    }

    // Persist the provider result in a separate, short transaction.
    // If persistence fails, the retained key allows safe recovery with a
    // provider that honors idempotency keys.
    await this.database.withTransaction(async (client) => {
      const update = await client.query(
        `
          UPDATE marketplace_fulfillments
          SET
            tracking_reference = $1,
            status = 'BOOKED',
            booking_started_at = NULL,
            updated_at = now()
          WHERE id = $2
            AND status = 'BOOKING_IN_PROGRESS'
            AND booking_idempotency_key = $3
        `,
        [
          result.trackingReference ?? null,
          row.id,
          booking.idempotencyKey,
        ],
      );

      if (update.rowCount !== 1) {
        throw new ConflictException(
          'The shipment provider returned a booking result, but the fulfillment could not be finalized. The booking key has been retained for recovery.',
        );
      }
    });

    return {
      fulfillmentId: row.id,
      orderId: row.order_id,
      sellerId: row.seller_id,
      providerConfigurationId: provider.providerConfigurationId,
      trackingReference: result.trackingReference ?? null,
      status: 'BOOKED',
    };
  }

  async trackSellerFulfillment(orderId: string, userId: string) {
    const sellerId = await this.sellers.getSellerIdByUserId(userId);

    const result = await this.database.query(
      `SELECT id, order_id, status, provider_configuration_id,
              tracking_reference
       FROM marketplace_fulfillments
       WHERE order_id = $1 AND seller_id = $2
       LIMIT 1`,
      [orderId, sellerId],
    );

    const fulfillment = result.rows[0];
    if (!fulfillment) {
      throw new NotFoundException('Fulfillment not found for this seller');
    }

    if (fulfillment.status === 'CANCELLED') {
      throw new ConflictException('Cancelled shipments cannot be tracked');
    }

    if (
      fulfillment.status === 'DELIVERED' ||
      fulfillment.status === 'FAILED'
    ) {
      throw new ConflictException(
        'Tracking is unavailable for a terminal fulfillment',
      );
    }

    if (
      !fulfillment.provider_configuration_id ||
      !fulfillment.tracking_reference
    ) {
      throw new ConflictException(
        'Shipment must be booked before tracking is available',
      );
    }

    const registration =
      await this.logistics.getProviderRegistrationByConfigurationId(
        fulfillment.provider_configuration_id,
      );

    const tracking = await registration.provider.trackShipment({
      trackingReference: fulfillment.tracking_reference,
    });

    const allowedStatuses = new Set([
      'BOOKED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'RETURNED',
      'UNKNOWN',
    ]);

    const validEvents = tracking.events
      .filter(
        (event) =>
          allowedStatuses.has(event.status) &&
          Number.isFinite(Date.parse(event.occurredAt)),
      )
      .sort(
        (a, b) =>
          Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
      );

    const statusFromEvent: Record<string, string | null> = {
      BOOKED: 'BOOKED',
      PICKED_UP: 'PICKED_UP',
      IN_TRANSIT: 'IN_TRANSIT',
      OUT_FOR_DELIVERY: 'IN_TRANSIT',
      DELIVERED: 'DELIVERED',
      FAILED: 'FAILED',
      RETURNED: null,
      UNKNOWN: null,
    };

    // Only the newest valid event may determine a status transition.
    // Do not fall back to an older event when the newest maps to null.
    const newestEvent = validEvents[validEvents.length - 1];
    const nextStatus = newestEvent
      ? statusFromEvent[newestEvent.status]
      : null;

    let skippedStatus: string | null | undefined = undefined;

    await this.database.withTransaction(async (client) => {
      // Lock and re-read the current status after the provider request.
      // Cancellation or another terminal transition may have happened
      // while the external tracking request was in flight.
      const locked = await client.query<{ status: string }>(
        `SELECT status
         FROM marketplace_fulfillments
         WHERE id = $1
         FOR UPDATE`,
        [fulfillment.id],
      );

      const currentStatus = locked.rows[0]?.status;

      if (
        !currentStatus ||
        ['CANCELLED', 'DELIVERED', 'FAILED'].includes(currentStatus)
      ) {
        skippedStatus = currentStatus ?? null;
        return;
      }

      for (const event of validEvents) {
        await client.query(
          `INSERT INTO marketplace_fulfillment_tracking_events
             (fulfillment_id, provider_event_id, status, provider_status,
              description, location, occurred_at, metadata, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
           ON CONFLICT (fulfillment_id, provider_event_id)
             WHERE provider_event_id IS NOT NULL DO NOTHING`,
          [
            fulfillment.id,
            event.providerEventId ?? null,
            event.status,
            event.providerStatus ?? null,
            event.description ?? null,
            event.location ?? null,
            event.occurredAt,
            JSON.stringify(event.metadata ?? {}),
            JSON.stringify(tracking.rawPayload ?? null),
          ],
        );
      }

      if (!nextStatus) {
        return;
      }

      await client.query(
        `UPDATE marketplace_fulfillments
         SET status = $2::marketplace_fulfillment_status,
             updated_at = now()
         WHERE id = $1
           AND status NOT IN (
             'CANCELLED', 'DELIVERED', 'FAILED'
           )
           AND CASE status
             WHEN 'PENDING' THEN 0
             WHEN 'READY_FOR_FULFILLMENT' THEN 1
             WHEN 'BOOKED' THEN 2
             WHEN 'PICKED_UP' THEN 3
             WHEN 'IN_TRANSIT' THEN 4
             ELSE 0
           END
           < CASE $2::marketplace_fulfillment_status
             WHEN 'PENDING' THEN 0
             WHEN 'READY_FOR_FULFILLMENT' THEN 1
             WHEN 'BOOKED' THEN 2
             WHEN 'PICKED_UP' THEN 3
             WHEN 'IN_TRANSIT' THEN 4
             WHEN 'DELIVERED' THEN 5
             WHEN 'FAILED' THEN 5
             ELSE 0
           END`,
        [fulfillment.id, nextStatus],
      );
    });

    if (skippedStatus !== undefined) {
      if (skippedStatus === null) {
        throw new NotFoundException('Fulfillment not found for this seller');
      }

      if (skippedStatus === 'CANCELLED') {
        throw new ConflictException('Cancelled shipments cannot be tracked');
      }

      throw new ConflictException(
        'Tracking is unavailable for a terminal fulfillment',
      );
    }

    return {
      fulfillmentId: fulfillment.id,
      orderId,
      trackingReference: fulfillment.tracking_reference,
      providerStatus: tracking.status,
      events: tracking.events,
    };
  }

  async getCustomerTrackingHistory(orderId: string, userId: string) {
    const result = await this.database.query<{
      order_id: string;
      fulfillment_id: string | null;
      fulfillment_status: string | null;
      tracking_reference: string | null;
      event_id: string | null;
      event_status: string | null;
      provider_status: string | null;
      description: string | null;
      location: string | null;
      occurred_at: Date | string | null;
    }>(
      `SELECT
         o.id AS order_id,
         f.id AS fulfillment_id,
         f.status AS fulfillment_status,
         f.tracking_reference,
         e.id AS event_id,
         e.status AS event_status,
         e.provider_status,
         e.description,
         e.location,
         e.occurred_at
       FROM marketplace_orders o
       LEFT JOIN marketplace_fulfillments f
         ON f.order_id = o.id
       LEFT JOIN marketplace_fulfillment_tracking_events e
         ON e.fulfillment_id = f.id
       WHERE o.id = $1
         AND o.customer_id = $2
       ORDER BY
         f.created_at ASC NULLS LAST,
         e.occurred_at ASC NULLS LAST,
         e.id ASC`,
      [orderId, userId],
    );

    // Return the same not-found response for nonexistent orders and orders
    // owned by another customer, preventing order-existence disclosure.
    if (result.rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    const fulfillments = new Map<
      string,
      {
        fulfillmentId: string;
        status: string;
        trackingReference: string | null;
        events: Array<{
          status: string;
          providerStatus: string | null;
          description: string | null;
          location: string | null;
          occurredAt: Date | string;
        }>;
      }
    >();

    for (const row of result.rows) {
      if (!row.fulfillment_id || !row.fulfillment_status) {
        continue;
      }

      let fulfillment = fulfillments.get(row.fulfillment_id);

      if (!fulfillment) {
        fulfillment = {
          fulfillmentId: row.fulfillment_id,
          status: row.fulfillment_status,
          trackingReference: row.tracking_reference,
          events: [],
        };
        fulfillments.set(row.fulfillment_id, fulfillment);
      }

      if (row.event_id && row.event_status && row.occurred_at) {
        fulfillment.events.push({
          status: row.event_status,
          providerStatus: row.provider_status,
          description: row.description,
          location: row.location,
          occurredAt: row.occurred_at,
        });
      }
    }

    return {
      orderId: result.rows[0].order_id,
      fulfillments: Array.from(fulfillments.values()),
    };
  }

  async getSellerFulfillment(
    orderId: string,
    userId: string,
  ) {
    const sellerId = await this.sellers.getSellerIdByUserId(userId);

    const fulfillment = await this.database.query<{
      id: string;
      order_id: string;
      seller_id: string;
      status: string;
      provider_configuration_id: string | null;
      tracking_reference: string | null;
      origin_snapshot: unknown;
      destination_snapshot: unknown;
      selected_office_id: string | null;
      selected_office_snapshot: {
        providerOfficeId: string;
        name: string;
        address: {
          addressLine1: string;
          addressLine2?: string | null;
          city: string;
          stateProvince?: string | null;
          postalCode?: string | null;
          countryCode: string;
          latitude?: number | null;
          longitude?: number | null;
        };
        distanceKm?: number | null;
        phone?: string | null;
        pickupAvailable: boolean;
        deliveryAvailable: boolean;
        metadata?: Record<string, unknown>;
      } | null;
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
          selected_office_id,
          selected_office_snapshot,
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