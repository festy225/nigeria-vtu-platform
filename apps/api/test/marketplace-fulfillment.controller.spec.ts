import { MarketplaceFulfillmentController } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.controller';
import { MarketplaceFulfillmentService } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.service';

describe('MarketplaceFulfillmentController', () => {
  const fulfillment = {
    createSellerFulfillment: jest.fn(),
    checkSellerFulfillmentServiceability: jest.fn(),
  } as unknown as jest.Mocked<MarketplaceFulfillmentService>;

  const controller = new MarketplaceFulfillmentController(fulfillment);

  beforeEach(() => {
    jest.clearAllMocks();
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
