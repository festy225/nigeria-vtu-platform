import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceFulfillmentService } from './marketplace-fulfillment.service';

@Injectable()
export class MarketplaceFulfillmentTrackingWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MarketplaceFulfillmentTrackingWorker.name,
  );

  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly fulfillment: MarketplaceFulfillmentService,
  ) {}

  onModuleInit(): void {
    const enabledValue = this.config.get<string>(
      'MARKETPLACE_FULFILLMENT_TRACKING_ENABLED',
      'true',
    );

    if (typeof enabledValue !== 'string') {
      this.disableForInvalidConfiguration();
      return;
    }

    const enabled = enabledValue.trim().toLowerCase();

    if (enabled === 'false') {
      return;
    }

    if (enabled !== 'true') {
      this.disableForInvalidConfiguration();
      return;
    }

    const intervalMs = this.readInteger(
      'MARKETPLACE_FULFILLMENT_TRACKING_INTERVAL_MS',
      60000,
    );
    const batchSize = this.readInteger(
      'MARKETPLACE_FULFILLMENT_TRACKING_BATCH_SIZE',
      25,
    );

    if (
      intervalMs === undefined ||
      intervalMs < 1000 ||
      batchSize === undefined ||
      batchSize < 1 ||
      batchSize > 100
    ) {
      this.disableForInvalidConfiguration();
      return;
    }

    // Avoid provider calls during API startup.
    this.timer = setInterval(() => {
      void this.runTracking(batchSize);
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private disableForInvalidConfiguration(): void {
    this.logger.warn(
      'Marketplace fulfillment tracking disabled: invalid configuration.',
    );
  }

  private readInteger(
    key: string,
    defaultValue: number,
  ): number | undefined {
    const raw = this.config.get<string>(key, String(defaultValue));

    if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw.trim())) {
      return undefined;
    }

    const value = Number(raw.trim());
    return Number.isSafeInteger(value) ? value : undefined;
  }

  private async runTracking(batchSize: number): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const result =
        await this.fulfillment.reconcileTrackingBatch(batchSize);

      if (result.failed > 0) {
        this.logger.warn(
          `Marketplace fulfillment tracking batch completed with ${result.failed} failed shipment(s).`,
        );
      }
    } catch {
      // Never log provider exceptions or potentially sensitive payloads.
      this.logger.warn(
        'Marketplace fulfillment tracking batch failed; eligible shipments will be retried.',
      );
    } finally {
      this.running = false;
    }
  }
}
