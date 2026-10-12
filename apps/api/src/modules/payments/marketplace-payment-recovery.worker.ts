import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';

@Injectable()
export class MarketplacePaymentRecoveryWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MarketplacePaymentRecoveryWorker.name,
  );

  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly payments: PaymentService,
  ) {}

  onModuleInit(): void {
    const enabledValue = this.config.get<string>(
      'MARKETPLACE_PAYMENT_RECOVERY_ENABLED',
      'true',
    );

    if (typeof enabledValue !== 'string') {
      this.logger.warn(
        'Marketplace payment recovery disabled: invalid configuration.',
      );
      return;
    }

    const enabled = enabledValue.trim().toLowerCase();

    if (enabled === 'false') {
      return;
    }

    if (enabled !== 'true') {
      this.logger.warn(
        'Marketplace payment recovery disabled: invalid configuration.',
      );
      return;
    }

    const intervalMs = this.readInteger(
      'MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS',
      60000,
    );
    const staleAfterSeconds = this.readInteger(
      'MARKETPLACE_PAYMENT_RECOVERY_STALE_AFTER_SECONDS',
      300,
    );
    const batchSize = this.readInteger(
      'MARKETPLACE_PAYMENT_RECOVERY_BATCH_SIZE',
      25,
    );

    if (
      intervalMs === undefined ||
      intervalMs < 1000 ||
      staleAfterSeconds === undefined ||
      staleAfterSeconds < 1 ||
      batchSize === undefined ||
      batchSize < 1 ||
      batchSize > 100
    ) {
      this.logger.warn(
        'Marketplace payment recovery disabled: invalid configuration.',
      );
      return;
    }

    // Do not perform provider lookups during API startup.
    this.timer = setInterval(() => {
      void this.runRecovery(staleAfterSeconds, batchSize);
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private readInteger(
    key: string,
    defaultValue: number,
  ): number | undefined {
    const raw = this.config.get<string>(key, String(defaultValue));

    if (
      typeof raw !== 'string' ||
      !/^[0-9]+$/.test(raw.trim())
    ) {
      return undefined;
    }

    const value = Number(raw.trim());

    return Number.isSafeInteger(value) ? value : undefined;
  }

  private async runRecovery(
    staleAfterSeconds: number,
    batchSize: number,
  ): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.payments.recoverInitializingMarketplacePayments(
        staleAfterSeconds,
        batchSize,
      );
    } catch {
      // Deliberately omit exception details to avoid leaking provider data.
      this.logger.warn(
        'Marketplace payment recovery attempt failed; unresolved payments remain pending.',
      );
    } finally {
      this.running = false;
    }
  }
}
