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
    jest.clearAllMocks();

    database.withTransaction.mockImplementation(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    );

    service = new MarketplaceFulfillmentService(
      database as never,
      sellers as never,
      logistics as never,
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
        });

      const bookShipment = jest.fn().mockResolvedValue({
        trackingReference: 'TEST-TRACK-123',
        rawPayload: {
          provider: 'test-logistics',
        },
      });

      logistics.getProviderRegistrationByConfigurationId.mockResolvedValue({
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
        ['TEST-TRACK-123', 'fulfillment-1'],
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
  });

});
