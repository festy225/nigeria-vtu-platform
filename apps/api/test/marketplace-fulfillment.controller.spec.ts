import { MarketplaceFulfillmentController } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.controller';
import { MarketplaceFulfillmentService } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.service';

describe('MarketplaceFulfillmentController', () => {
  const fulfillment = {
    createSellerFulfillment: jest.fn(),
    checkSellerFulfillmentServiceability: jest.fn(),
    findSellerFulfillmentOffices: jest.fn(),
    selectSellerFulfillmentOffice: jest.fn(),
    bookSellerFulfillment: jest.fn(),
  } as unknown as jest.Mocked<MarketplaceFulfillmentService>;

  const controller = new MarketplaceFulfillmentController(fulfillment);

  beforeEach(() => {
    jest.clearAllMocks();
  });


  describe('findSellerFulfillmentOffices', () => {
    it('uses the authenticated user id, order id, and radius when finding offices', async () => {
      fulfillment.findSellerFulfillmentOffices.mockResolvedValue({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        rawPayload: {
          provider: 'mock-logistics',
        },
        offices: [
          {
            providerOfficeId: 'office-1',
            name: 'Lagos Office',
            address: {
              addressLine1: '1 Test Street',
              city: 'Lagos',
              countryCode: 'NG',
            },
            pickupAvailable: true,
            deliveryAvailable: true,
          },
        ],
      });

      const user = {
        id: 'user-1',
      } as any;

      const dto = {
        radiusKm: 15,
      };

      const result = await controller.findSellerFulfillmentOffices(
        user,
        'order-1',
        dto,
      );

      expect(
        fulfillment.findSellerFulfillmentOffices,
      ).toHaveBeenCalledWith('order-1', 'user-1', 15);

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        rawPayload: {
          provider: 'mock-logistics',
        },
        offices: [
          {
            providerOfficeId: 'office-1',
            name: 'Lagos Office',
            address: {
              addressLine1: '1 Test Street',
              city: 'Lagos',
              countryCode: 'NG',
            },
            pickupAvailable: true,
            deliveryAvailable: true,
          },
        ],
      });
    });
  });

  describe('selectSellerFulfillmentOffice', () => {
    it('uses the authenticated user id, order id, and provider office id', async () => {
      fulfillment.selectSellerFulfillmentOffice.mockResolvedValue({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        selectedOfficeId: 'office-1',
        selectedOffice: {
          providerOfficeId: 'office-1',
          name: 'Lagos Office',
          address: {
            addressLine1: '1 Test Street',
            city: 'Lagos',
            countryCode: 'NG',
          },
          pickupAvailable: true,
          deliveryAvailable: true,
        },
        status: 'READY_FOR_FULFILLMENT',
      });

      const user = {
        id: 'user-1',
      } as any;

      const dto = {
        providerOfficeId: 'office-1',
      };

      const result = await controller.selectSellerFulfillmentOffice(
        user,
        'order-1',
        dto,
      );

      expect(
        fulfillment.selectSellerFulfillmentOffice,
      ).toHaveBeenCalledWith('order-1', 'user-1', 'office-1');

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        selectedOfficeId: 'office-1',
        selectedOffice: {
          providerOfficeId: 'office-1',
          name: 'Lagos Office',
          address: {
            addressLine1: '1 Test Street',
            city: 'Lagos',
            countryCode: 'NG',
          },
          pickupAvailable: true,
          deliveryAvailable: true,
        },
        status: 'READY_FOR_FULFILLMENT',
      });
    });
  });

  describe('bookSellerFulfillment', () => {
    it('uses the authenticated user id and order id when booking fulfillment', async () => {
      fulfillment.bookSellerFulfillment.mockResolvedValue({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        providerConfigurationId: 'provider-config-1',
        trackingReference: 'TEST-TRACK-123',
        status: 'BOOKED',
      });

      const user = {
        id: 'user-1',
      } as any;

      const result = await controller.bookSellerFulfillment(
        user,
        'order-1',
      );

      expect(
        fulfillment.bookSellerFulfillment,
      ).toHaveBeenCalledWith('order-1', 'user-1');

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

  describe('checkSellerFulfillmentServiceability', () => {
    it('uses the authenticated user id when checking seller fulfillment serviceability', async () => {
      fulfillment.checkSellerFulfillmentServiceability.mockResolvedValue({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        serviceable: true,
        rawPayload: {
          provider: 'mock-logistics',
        },
      });

      const user = {
        id: 'user-1',
      } as any;

      const dto = {
        orderId: 'order-1',
      };

      const result =
        await controller.checkSellerFulfillmentServiceability(user, dto);

      expect(
        fulfillment.checkSellerFulfillmentServiceability,
      ).toHaveBeenCalledWith('order-1', 'user-1');

      expect(result).toEqual({
        fulfillmentId: 'fulfillment-1',
        providerConfigurationId: 'provider-config-1',
        serviceable: true,
        rawPayload: {
          provider: 'mock-logistics',
        },
      });
    });
  });
});
