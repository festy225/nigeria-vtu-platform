import { ConfigService } from '@nestjs/config';
import { MarketplaceFulfillmentService } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment.service';
import { MarketplaceFulfillmentTrackingWorker } from '../src/modules/marketplace-fulfillment/marketplace-fulfillment-tracking.worker';

describe('MarketplaceFulfillmentTrackingWorker', () => {
  let worker: MarketplaceFulfillmentTrackingWorker;
  let settings: Record<string, string>;
  let config: { get: jest.Mock };
  let fulfillment: {
    reconcileTrackingBatch: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();

    settings = {};
    config = {
      get: jest.fn((key: string, fallback?: string) =>
        settings[key] ?? fallback,
      ),
    };

    fulfillment = {
      reconcileTrackingBatch: jest.fn().mockResolvedValue({
        selected: 2,
        succeeded: 2,
        failed: 0,
      }),
    };

    worker = new MarketplaceFulfillmentTrackingWorker(
      config as unknown as ConfigService,
      fulfillment as unknown as MarketplaceFulfillmentService,
    );
  });

  afterEach(() => {
    worker.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs on the default interval with the default batch size', async () => {
    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(59999);
    expect(fulfillment.reconcileTrackingBatch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(fulfillment.reconcileTrackingBatch).toHaveBeenCalledTimes(1);
    expect(fulfillment.reconcileTrackingBatch).toHaveBeenCalledWith(25);
  });

  it('does not schedule work when explicitly disabled', async () => {
    settings.MARKETPLACE_FULFILLMENT_TRACKING_ENABLED = 'false';

    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(120000);

    expect(fulfillment.reconcileTrackingBatch).not.toHaveBeenCalled();
  });

  it('uses valid configured interval and batch size', async () => {
    settings.MARKETPLACE_FULFILLMENT_TRACKING_INTERVAL_MS = '2000';
    settings.MARKETPLACE_FULFILLMENT_TRACKING_BATCH_SIZE = '10';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(1999);
    expect(fulfillment.reconcileTrackingBatch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(fulfillment.reconcileTrackingBatch).toHaveBeenCalledWith(10);
  });

  it('disables scheduling for invalid configuration', async () => {
    settings.MARKETPLACE_FULFILLMENT_TRACKING_INTERVAL_MS = '500';

    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(120000);

    expect(fulfillment.reconcileTrackingBatch).not.toHaveBeenCalled();
  });

  it('continues scheduling after a batch failure', async () => {
    fulfillment.reconcileTrackingBatch
      .mockRejectedValueOnce(new Error('provider failure'))
      .mockResolvedValueOnce({
        selected: 1,
        succeeded: 1,
        failed: 0,
      });

    settings.MARKETPLACE_FULFILLMENT_TRACKING_INTERVAL_MS = '1000';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(1000);
    expect(fulfillment.reconcileTrackingBatch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(fulfillment.reconcileTrackingBatch).toHaveBeenCalledTimes(2);
  });
});
