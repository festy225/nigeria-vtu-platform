import { NotFoundException } from '@nestjs/common';
import { MarketplaceFulfillmentService } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.service';

describe('MarketplaceFulfillmentService', () => {
  const transaction = {
    query: jest.fn(),
  };

  const database = {
    query: jest.fn(),
    withTransaction: jest.fn(),
  };

  const sellers = {
    getSellerIdByUserId: jest.fn(),
  };

  const logistics = {
    getProviderRegistration: jest.fn(),
    getProviderRegistrationByConfigurationId: jest.fn(),
  };

  let service: MarketplaceFulfillmentService;

  beforeEach(() => {
    jest.resetAllMocks();

    database.withTransaction.mockImplementation(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    );

    service = new MarketplaceFulfillmentService(
      database as never,
      sellers as never,
      logistics as never,
      { resolve: jest.fn(() => 'test-credentials') } as never,
    );
  });

  describe('getSellerFulfillment', () => {
    it('returns fulfillment details, selected office, and items for the authenticated seller', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      const fulfillmentRow = {
        id: 'fulfillment-1',
        order_id: 'order-1',
        seller_id: 'seller-1',
        status: 'READY_FOR_FULFILLMENT',
        provider_configuration_id: 'provider-config-1',
        tracking_reference: null,
        origin_snapshot: { city: 'Lagos' },
        destination_snapshot: { city: 'Abuja' },
        selected_office_id: 'office-1',
        selected_office_snapshot: {
          providerOfficeId: 'office-1',
          name: 'Lagos Pickup Office',
          address: {
            addressLine1: '1 Test Street',
            city: 'Lagos',
            countryCode: 'NG',
          },
          pickupAvailable: true,
          deliveryAvailable: true,
        },
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      };

      database.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [fulfillmentRow],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'fulfillment-item-1',
              order_item_id: 'order-item-1',
              quantity: 2,
            },
          ],
        });

      const result = await service.getSellerFulfillment(
        'order-1',
        'user-1',
      );

      expect(sellers.getSellerIdByUserId).toHaveBeenCalledWith('user-1');
      expect(database.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND seller_id = $2'),
        ['order-1', 'seller-1'],
      );
      expect(database.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          'WHERE fulfillment_id = $1',
        ),
        ['fulfillment-1'],
      );
      expect(result).toEqual({
        ...fulfillmentRow,
        items: [
          {
            id: 'fulfillment-item-1',
            order_item_id: 'order-item-1',
            quantity: 2,
          },
        ],
      });
    });

    it('throws NotFoundException when the seller has no fulfillment for the order', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        service.getSellerFulfillment('missing-order', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(database.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('findSellerFulfillmentOffices', () => {
    it('finds nearby offices using the fulfillment snapshots and configured logistics provider', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'fulfillment-1',
            provider_configuration_id: 'provider-config-1',
            origin_snapshot: {
              address_line1: 'Seller Street',
              address_line2: null,
              city: 'Lagos',
              state_province: 'Lagos',
              postal_code: '100001',
              country_code: 'NG',
              latitude: 6.5244,
              longitude: 3.3792,
            },
            destination_snapshot: {
              address_line1: 'Customer Street',
              address_line2: null,
              city: 'Lagos',
              state_province: 'Lagos',
              postal_code: '100002',
              country_code: 'NG',
              latitude: 6.6018,
              longitude: 3.3515,
            },
          },
        ],
      });

      const findOffices = jest.fn().mockResolvedValue({
        offices: [
          {
            providerOfficeId: 'office-1',
            name: 'Test Logistics Office',
            address: {
              addressLine1: 'Office Street',
              city: 'Lagos',
              countryCode: 'NG',
            },
            distanceKm: 2.5,
            pickupAvailable: true,
            deliveryAvailable: true,
          },
        ],
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          findOffices,
        },
        providerConfigurationId: 'provider-config-1',
      });

      const result = await service.findSellerFulfillmentOffices(
        'order-1',
        'user-1',
        10,
      );

      expect(findOffices).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        origin: {
          addressLine1: 'Seller Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100001',
          countryCode: 'NG',
          latitude: 6.5244,
          longitude: 3.3792,
        },
        destination: {
          addressLine1: 'Customer Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100002',
          countryCode: 'NG',
          latitude: 6.6018,
          longitude: 3.3515,
        },
        radiusKm: 10,
      });

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        offices: [
          {
            providerOfficeId: 'office-1',
            name: 'Test Logistics Office',
            address: {
              addressLine1: 'Office Street',
              city: 'Lagos',
              countryCode: 'NG',
            },
            distanceKm: 2.5,
            pickupAvailable: true,
            deliveryAvailable: true,
          },
        ],
        rawPayload: {
          provider: 'test-logistics',
        },
      });
    });

    it('fails when the seller fulfillment does not exist', async () => {
      database.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        service.findSellerFulfillmentOffices(
          'missing-order',
          'user-1',
          10,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(logistics.getProviderRegistrationByConfigurationId).not.toHaveBeenCalled();
    });
  });

  describe('checkSellerFulfillmentServiceability', () => {
    it('checks serviceability using the fulfillment snapshots and configured logistics provider', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      database.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'fulfillment-1',
              provider_configuration_id: 'provider-config-1',
              origin_snapshot: {
                address_line1: 'Seller Street',
                address_line2: null,
                city: 'Lagos',
                state_province: 'Lagos',
                postal_code: '100001',
                country_code: 'NG',
                latitude: 6.5244,
                longitude: 3.3792,
              },
              destination_snapshot: {
                address_line1: 'Customer Street',
                address_line2: null,
                city: 'Lagos',
                state_province: 'Lagos',
                postal_code: '100002',
                country_code: 'NG',
                latitude: 6.6018,
                longitude: 3.3515,
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            { quantity: 2 },
            { quantity: 1 },
          ],
        });

      const checkServiceability = jest.fn().mockResolvedValue({
        serviceable: true,
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          checkServiceability,
        },
        providerConfigurationId: 'provider-config-1',
      });

      const result =
        await service.checkSellerFulfillmentServiceability(
          'order-1',
          'user-1',
        );

      expect(checkServiceability).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        origin: {
          addressLine1: 'Seller Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100001',
          countryCode: 'NG',
          latitude: 6.5244,
          longitude: 3.3792,
        },
        destination: {
          addressLine1: 'Customer Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100002',
          countryCode: 'NG',
          latitude: 6.6018,
          longitude: 3.3515,
        },
        packages: [
          { quantity: 2 },
          { quantity: 1 },
        ],
      });

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        serviceable: true,
        rawPayload: {
          provider: 'test-logistics',
        },
      });
    });

    it('fails when the seller fulfillment does not exist', async () => {
      database.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        service.checkSellerFulfillmentServiceability(
          'missing-order',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(logistics.getProviderRegistrationByConfigurationId).not.toHaveBeenCalled();
    });
  });

  describe('selectSellerFulfillmentOffice', () => {
    const fulfillmentRow = {
      id: 'fulfillment-1',
      order_id: 'order-1',
      seller_id: 'seller-1',
      status: 'PENDING',
      provider_configuration_id: 'provider-config-1',
      origin_snapshot: {
        address_line1: 'Seller Street',
        address_line2: null,
        city: 'Lagos',
        state_province: 'Lagos',
        postal_code: '100001',
        country_code: 'NG',
        latitude: 6.5244,
        longitude: 3.3792,
      },
      destination_snapshot: {
        address_line1: 'Customer Street',
        address_line2: null,
        city: 'Lagos',
        state_province: 'Lagos',
        postal_code: '100002',
        country_code: 'NG',
        latitude: 6.6018,
        longitude: 3.3515,
      },
    };

    it('selects a valid pickup office and moves fulfillment to READY_FOR_FULFILLMENT', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fulfillmentRow],
      });

      const selectedOffice = {
        providerOfficeId: 'office-1',
        name: 'Test Logistics Office',
        address: {
          addressLine1: 'Office Street',
          city: 'Lagos',
          countryCode: 'NG',
        },
        distanceKm: 2.5,
        pickupAvailable: true,
        deliveryAvailable: true,
      };

      const findOffices = jest.fn().mockResolvedValue({
        offices: [selectedOffice],
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          findOffices,
        },
        providerConfigurationId: 'provider-config-1',
      });

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      });

      const result = await service.selectSellerFulfillmentOffice(
        'order-1',
        'user-1',
        'office-1',
      );

      expect(findOffices).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        origin: {
          addressLine1: 'Seller Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100001',
          countryCode: 'NG',
          latitude: 6.5244,
          longitude: 3.3792,
        },
        destination: {
          addressLine1: 'Customer Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100002',
          countryCode: 'NG',
          latitude: 6.6018,
          longitude: 3.3515,
        },
        radiusKm: null,
      });

      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('selected_office_id = $1'),
        [
          'office-1',
          JSON.stringify(selectedOffice),
          'fulfillment-1',
        ],
      );

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        selectedOfficeId: 'office-1',
        selectedOffice,
        status: 'READY_FOR_FULFILLMENT',
      });
    });

    it('fails when the selected office is not returned by the provider', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fulfillmentRow],
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          findOffices: jest.fn().mockResolvedValue({
            offices: [],
          }),
        },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.selectSellerFulfillmentOffice(
          'order-1',
          'user-1',
          'missing-office',
        ),
      ).rejects.toThrow('Selected logistics office was not found');

      expect(transaction.query).toHaveBeenCalledTimes(1);
    });

    it('fails when the selected office does not support pickup', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fulfillmentRow],
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          findOffices: jest.fn().mockResolvedValue({
            offices: [
              {
                providerOfficeId: 'office-1',
                name: 'Delivery Only Office',
                address: {
                  addressLine1: 'Office Street',
                  city: 'Lagos',
                  countryCode: 'NG',
                },
                pickupAvailable: false,
                deliveryAvailable: true,
              },
            ],
          }),
        },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.selectSellerFulfillmentOffice(
          'order-1',
          'user-1',
          'office-1',
        ),
      ).rejects.toThrow(
        'Selected logistics office does not support pickup',
      );

      expect(transaction.query).toHaveBeenCalledTimes(1);
    });

    it('fails when the fulfillment is no longer pending', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            ...fulfillmentRow,
            status: 'READY_FOR_FULFILLMENT',
          },
        ],
      });

      await expect(
        service.selectSellerFulfillmentOffice(
          'order-1',
          'user-1',
          'office-1',
        ),
      ).rejects.toThrow(
        'Fulfillment office can only be selected while the fulfillment is pending',
      );

      expect(
        logistics.getProviderRegistrationByConfigurationId,
      ).not.toHaveBeenCalled();
    });

    it('fails when the fulfillment provider configuration is missing', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            ...fulfillmentRow,
            provider_configuration_id: null,
          },
        ],
      });

      await expect(
        service.selectSellerFulfillmentOffice(
          'order-1',
          'user-1',
          'office-1',
        ),
      ).rejects.toThrow(
        'Fulfillment logistics provider configuration is missing',
      );

      expect(
        logistics.getProviderRegistrationByConfigurationId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('bookSellerFulfillment', () => {
    const fulfillmentRow = {
      id: 'fulfillment-1',
      order_id: 'order-1',
      seller_id: 'seller-1',
      status: 'READY_FOR_FULFILLMENT',
      provider_configuration_id: 'provider-config-1',
      tracking_reference: null,
      origin_snapshot: {
        address_line1: 'Seller Street',
        address_line2: null,
        city: 'Lagos',
        state_province: 'Lagos',
        postal_code: '100001',
        country_code: 'NG',
        latitude: 6.5244,
        longitude: 3.3792,
      },
      destination_snapshot: {
        address_line1: 'Customer Street',
        address_line2: null,
        city: 'Lagos',
        state_province: 'Lagos',
        postal_code: '100002',
        country_code: 'NG',
        latitude: 6.6018,
        longitude: 3.3515,
      },
      selected_office_id: 'office-1',
      selected_office_snapshot: {
        providerOfficeId: 'office-1',
        name: 'Test Logistics Office',
        address: {
          addressLine1: 'Office Street',
          city: 'Lagos',
          countryCode: 'NG',
        },
        distanceKm: 2.5,
        pickupAvailable: true,
        deliveryAvailable: true,
      },
    };

    it('books the shipment and moves fulfillment to BOOKED', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [fulfillmentRow],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [],
        });

      const bookShipment = jest.fn().mockResolvedValue({
        trackingReference: 'TEST-TRACK-123',
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          bookShipment,
        },
        providerConfigurationId: 'provider-config-1',
      });

      const result = await service.bookSellerFulfillment(
        'order-1',
        'user-1',
      );

      expect(bookShipment).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        idempotencyKey: 'chimzo-fulfillment-fulfillment-1',
        origin: {
          addressLine1: 'Seller Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100001',
          countryCode: 'NG',
          latitude: 6.5244,
          longitude: 3.3792,
        },
        destination: {
          addressLine1: 'Customer Street',
          addressLine2: null,
          city: 'Lagos',
          stateProvince: 'Lagos',
          postalCode: '100002',
          countryCode: 'NG',
          latitude: 6.6018,
          longitude: 3.3515,
        },
        packages: [
          { quantity: 2 },
          { quantity: 1 },
        ],
        selectedOffice: fulfillmentRow.selected_office_snapshot,
      });

      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('tracking_reference = $1'),
        [
          'TEST-TRACK-123',
          'fulfillment-1',
          'chimzo-fulfillment-fulfillment-1',
        ],
      );

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        trackingReference: 'TEST-TRACK-123',
        status: 'BOOKED',
      });
    });

    it('does not report BOOKED when finalization updates no fulfillment', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [fulfillmentRow],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [],
        })
        .mockResolvedValueOnce({
          rowCount: 0,
          rows: [],
        });

      const bookShipment = jest.fn().mockResolvedValue({
        trackingReference: 'TEST-TRACK-123',
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          bookShipment,
        },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.bookSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('could not be finalized');

      expect(bookShipment).toHaveBeenCalledTimes(1);
      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('tracking_reference = $1'),
        [
          'TEST-TRACK-123',
          'fulfillment-1',
          'chimzo-fulfillment-fulfillment-1',
        ],
      );
    });

    it('retains the booking claim when the provider outcome is uncertain', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      transaction.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [fulfillmentRow],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [],
        });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          bookShipment: jest.fn().mockRejectedValue(new Error('provider timeout')),
        },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.bookSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('booking outcome is uncertain');

      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining("status = 'BOOKING_IN_PROGRESS'"),
        [
          'chimzo-fulfillment-fulfillment-1',
          'fulfillment-1',
        ],
      );
    });

    it('recovers an existing provider booking without creating another shipment', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      const recoveryRow = {
        ...fulfillmentRow,
        status: 'BOOKING_IN_PROGRESS',
        booking_idempotency_key: 'chimzo-fulfillment-fulfillment-1',
        booking_started_at: new Date(Date.now() - 10 * 60 * 1000),
      };

      transaction.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [recoveryRow] })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const lookupBooking = jest.fn().mockResolvedValue({
        status: 'FOUND',
        trackingReference: 'RECOVERED-TRACK-123',
        rawPayload: { recovered: true },
      });
      const bookShipment = jest.fn();

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { lookupBooking, bookShipment },
        providerConfigurationId: 'provider-config-1',
      });

      const result = await service.bookSellerFulfillment('order-1', 'user-1');

      expect(lookupBooking).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        idempotencyKey: 'chimzo-fulfillment-fulfillment-1',
      });
      expect(bookShipment).not.toHaveBeenCalled();
      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('tracking_reference = $1'),
        [
          'RECOVERED-TRACK-123',
          'fulfillment-1',
          'chimzo-fulfillment-fulfillment-1',
        ],
      );
      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        trackingReference: 'RECOVERED-TRACK-123',
        status: 'BOOKED',
      });
    });

    it('retries booking with the same idempotency key only after NOT_FOUND', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      const recoveryRow = {
        ...fulfillmentRow,
        status: 'BOOKING_IN_PROGRESS',
        booking_idempotency_key: 'chimzo-fulfillment-fulfillment-1',
        booking_started_at: new Date(Date.now() - 10 * 60 * 1000),
      };

      transaction.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [recoveryRow] })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const lookupBooking = jest.fn().mockResolvedValue({
        status: 'NOT_FOUND',
      });
      const bookShipment = jest.fn().mockResolvedValue({
        trackingReference: 'RETRIED-TRACK-456',
        rawPayload: { retried: true },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { lookupBooking, bookShipment },
        providerConfigurationId: 'provider-config-1',
      });

      const result = await service.bookSellerFulfillment('order-1', 'user-1');

      expect(lookupBooking).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        idempotencyKey: 'chimzo-fulfillment-fulfillment-1',
      });
      expect(bookShipment).toHaveBeenCalledTimes(1);
      expect(bookShipment).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'chimzo-fulfillment-fulfillment-1',
          selectedOffice: fulfillmentRow.selected_office_snapshot,
        }),
      );
      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('tracking_reference = $1'),
        [
          'RETRIED-TRACK-456',
          'fulfillment-1',
          'chimzo-fulfillment-fulfillment-1',
        ],
      );
      expect(result.status).toBe('BOOKED');
      expect(result.trackingReference).toBe('RETRIED-TRACK-456');
    });

    it('does not retry booking when the provider lookup outcome is UNKNOWN', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      const recoveryRow = {
        ...fulfillmentRow,
        status: 'BOOKING_IN_PROGRESS',
        booking_idempotency_key: 'chimzo-fulfillment-fulfillment-1',
        booking_started_at: new Date(Date.now() - 10 * 60 * 1000),
      };

      transaction.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [recoveryRow] })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const lookupBooking = jest.fn().mockResolvedValue({
        status: 'UNKNOWN',
      });
      const bookShipment = jest.fn();

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { lookupBooking, bookShipment },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.bookSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('outcome remains unknown');

      expect(lookupBooking).toHaveBeenCalledTimes(1);
      expect(bookShipment).not.toHaveBeenCalled();
      expect(transaction.query).toHaveBeenCalledTimes(3);
    });

    it('does not retry booking when provider lookup throws', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      const recoveryRow = {
        ...fulfillmentRow,
        status: 'BOOKING_IN_PROGRESS',
        booking_idempotency_key: 'chimzo-fulfillment-fulfillment-1',
        booking_started_at: new Date(Date.now() - 10 * 60 * 1000),
      };

      transaction.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [recoveryRow] })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [{ quantity: 2 }, { quantity: 1 }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const lookupBooking = jest.fn().mockRejectedValue(
        new Error('provider lookup timeout'),
      );
      const bookShipment = jest.fn();

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { lookupBooking, bookShipment },
        providerConfigurationId: 'provider-config-1',
      });

      await expect(
        service.bookSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('outcome remains unknown');

      expect(lookupBooking).toHaveBeenCalledTimes(1);
      expect(bookShipment).not.toHaveBeenCalled();
      expect(transaction.query).toHaveBeenCalledTimes(3);
    });

  });


  describe('trackSellerFulfillment', () => {
    const fulfillment = {
      id: 'fulfillment-1',
      order_id: 'order-1',
      status: 'BOOKED',
      provider_configuration_id: 'provider-config-1',
      tracking_reference: 'TRACK-123',
    };

    const trackingEvent = {
      providerEventId: 'event-123',
      status: 'IN_TRANSIT',
      providerStatus: 'MOVING',
      description: 'Shipment is in transit',
      location: 'Lagos',
      occurredAt: '2026-10-10T12:00:00.000Z',
      metadata: { source: 'test' },
    };

    it('persists valid tracking events and requests tracking from the configured provider', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fulfillment],
      });

      const trackShipment = jest.fn().mockResolvedValue({
        status: 'IN_TRANSIT',
        events: [trackingEvent],
        rawPayload: { source: 'test-provider' },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { trackShipment },
        providerConfigurationId: 'provider-config-1',
      });

      transaction.query.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('SELECT status')
            ? { rowCount: 1, rows: [{ status: 'BOOKED' }] }
            : { rowCount: 1, rows: [] },
        ),
      );


      const result = await service.trackSellerFulfillment(
        'order-1',
        'user-1',
      );

      expect(trackShipment).toHaveBeenCalledWith({
          providerConfiguration: {
            id: 'provider-config-1',
            config: {},
            credentials: 'test-credentials',
          },
        trackingReference: 'TRACK-123',
      });
      expect(transaction.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'INSERT INTO marketplace_fulfillment_tracking_events',
        ),
        [
          'fulfillment-1',
          'event-123',
          'IN_TRANSIT',
          'MOVING',
          'Shipment is in transit',
          'Lagos',
          '2026-10-10T12:00:00.000Z',
          JSON.stringify({ source: 'test' }),
          JSON.stringify({ source: 'test-provider' }),
        ],
      );
      expect(database.withTransaction).toHaveBeenCalledTimes(1);
      expect(transaction.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE marketplace_fulfillments'),
        ['fulfillment-1', 'IN_TRANSIT'],
      );
      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        trackingReference: 'TRACK-123',
        providerStatus: 'IN_TRANSIT',
        events: [trackingEvent],
      });
    });

    it('does not track an order that does not belong to the seller', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        service.trackSellerFulfillment('other-order', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(logistics.getProviderRegistrationByConfigurationId)
        .not.toHaveBeenCalled();
      expect(database.withTransaction).not.toHaveBeenCalled();
    });

    it('rejects tracking when shipment booking details are missing', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...fulfillment,
          tracking_reference: null,
        }],
      });

      await expect(
        service.trackSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow(
        'Shipment must be booked before tracking is available',
      );

      expect(logistics.getProviderRegistrationByConfigurationId)
        .not.toHaveBeenCalled();
    });

    it('ignores invalid statuses and malformed event timestamps', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fulfillment],
      });

      const trackShipment = jest.fn().mockResolvedValue({
        status: 'UNKNOWN',
        events: [
          { ...trackingEvent, status: 'NOT_A_STATUS' },
          { ...trackingEvent, providerEventId: 'bad-date', occurredAt: 'invalid' },
        ],
        rawPayload: {},
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: { trackShipment },
        providerConfigurationId: 'provider-config-1',
      });

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ status: 'BOOKED' }],
      });

      const result = await service.trackSellerFulfillment(
        'order-1',
        'user-1',
      );

      expect(transaction.query).toHaveBeenCalledTimes(1);
      expect(transaction.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['fulfillment-1'],
      );
      expect(database.withTransaction).toHaveBeenCalledTimes(1);
      expect(result.providerStatus).toBe('UNKNOWN');
      expect(database.query).toHaveBeenCalledTimes(1);
    });

    it('does not persist tracking events if fulfillment becomes cancelled during tracking', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ ...fulfillment, status: 'BOOKED' }],
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
        configuration: {
          id: 'provider-config-1',
          config: {},
          secretRef: 'env:TEST_LOGISTICS_SECRET',
        },
        provider: {
          trackShipment: jest.fn().mockResolvedValue({
            status: 'IN_TRANSIT',
            events: [trackingEvent],
            rawPayload: {},
          }),
        },
        providerConfigurationId: 'provider-config-1',
      });

      transaction.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ status: 'CANCELLED' }],
      });

      await expect(
        service.trackSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('Cancelled shipments cannot be tracked');

      expect(transaction.query).toHaveBeenCalledTimes(1);
      expect(transaction.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['fulfillment-1'],
      );
      expect(transaction.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO marketplace_fulfillment_tracking_events'),
        expect.anything(),
      );
      expect(transaction.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE marketplace_fulfillments'),
        expect.anything(),
      );
    });

    it('does not update a cancelled fulfillment', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...fulfillment,
          status: 'CANCELLED',
        }],
      });

      await expect(
        service.trackSellerFulfillment('order-1', 'user-1'),
      ).rejects.toThrow('Cancelled shipments cannot be tracked');

      expect(logistics.getProviderRegistrationByConfigurationId)
        .not.toHaveBeenCalled();
      expect(database.withTransaction).not.toHaveBeenCalled();
    });
  });


  describe('getCustomerTrackingHistory', () => {
    it('returns chronological tracking history for the customer order', async () => {
      const rows = [
        {
          order_id: 'order-1',
          fulfillment_id: 'fulfillment-1',
          fulfillment_status: 'BOOKED',
          tracking_reference: 'TRACK-123',
          event_id: 'event-1',
          event_status: 'PICKED_UP',
          provider_status: 'COLLECTED',
          description: 'Package collected',
          location: 'Lagos',
          occurred_at: '2026-10-10T10:00:00.000Z',
        },
        {
          order_id: 'order-1',
          fulfillment_id: 'fulfillment-1',
          fulfillment_status: 'IN_TRANSIT',
          tracking_reference: 'TRACK-123',
          event_id: 'event-2',
          event_status: 'IN_TRANSIT',
          provider_status: 'MOVING',
          description: 'Package in transit',
          location: 'Ibadan',
          occurred_at: '2026-10-10T12:00:00.000Z',
        },
      ];

      database.query.mockResolvedValueOnce({
        rowCount: rows.length,
        rows,
      });

      const result = await service.getCustomerTrackingHistory(
        'order-1',
        'user-1',
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('o.customer_id = $2'),
        ['order-1', 'user-1'],
      );

      expect(result).toEqual({
        orderId: 'order-1',
        fulfillments: [
          {
            fulfillmentId: 'fulfillment-1',
            status: 'BOOKED',
            trackingReference: 'TRACK-123',
            events: [
              {
                status: 'PICKED_UP',
                providerStatus: 'COLLECTED',
                description: 'Package collected',
                location: 'Lagos',
                occurredAt: '2026-10-10T10:00:00.000Z',
              },
              {
                status: 'IN_TRANSIT',
                providerStatus: 'MOVING',
                description: 'Package in transit',
                location: 'Ibadan',
                occurredAt: '2026-10-10T12:00:00.000Z',
              },
            ],
          },
        ],
      });

      expect(JSON.stringify(result)).not.toContain('raw_payload');
      expect(JSON.stringify(result)).not.toContain('metadata');
    });

    it('does not disclose orders that do not belong to the customer', async () => {
      database.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        service.getCustomerTrackingHistory('another-order', 'user-1'),
      ).rejects.toThrow('Order not found');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('o.customer_id = $2'),
        ['another-order', 'user-1'],
      );
    });

    it('returns an empty fulfillment list when the order has no fulfillment yet', async () => {
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            order_id: 'order-1',
            fulfillment_id: null,
            fulfillment_status: null,
            tracking_reference: null,
            event_id: null,
            event_status: null,
            provider_status: null,
            description: null,
            location: null,
            occurred_at: null,
          },
        ],
      });

      await expect(
        service.getCustomerTrackingHistory('order-1', 'user-1'),
      ).resolves.toEqual({
        orderId: 'order-1',
        fulfillments: [],
      });
    });
  });

});
