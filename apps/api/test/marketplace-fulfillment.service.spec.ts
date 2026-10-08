import { NotFoundException } from '@nestjs/common';
import { MarketplaceFulfillmentService } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.service';

describe('MarketplaceFulfillmentService', () => {
  const database = {
    query: jest.fn(),
  };

  const sellers = {
    getSellerIdByUserId: jest.fn(),
  };

  const logistics = {
    getProviderRegistration: jest.fn(),
  };

  let service: MarketplaceFulfillmentService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new MarketplaceFulfillmentService(
      database as never,
      sellers as never,
      logistics as never,
    );
  });

  describe('findSellerFulfillmentOffices', () => {
    it('finds nearby offices using the fulfillment snapshots and configured logistics provider', async () => {
      sellers.getSellerIdByUserId.mockResolvedValue('seller-1');

      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'fulfillment-1',
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

      logistics.getProviderRegistration.mockResolvedValue({
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

      expect(logistics.getProviderRegistration).not.toHaveBeenCalled();
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

      logistics.getProviderRegistration.mockResolvedValue({
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

      expect(logistics.getProviderRegistration).not.toHaveBeenCalled();
    });
  });
});
