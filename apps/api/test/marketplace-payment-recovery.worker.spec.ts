import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from '../src/modules/payments/payment.service';
import { MarketplacePaymentRecoveryWorker } from '../src/modules/payments/marketplace-payment-recovery.worker';

describe('MarketplacePaymentRecoveryWorker', () => {
  let worker: MarketplacePaymentRecoveryWorker;
  let values: Record<string, string>;
  let config: ConfigService;
  let payments: {
    recoverInitializingMarketplacePayments: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();

    values = {};

    config = {
      get: jest.fn(
        (key: string, defaultValue?: string) =>
          values[key] ?? defaultValue,
      ),
    } as unknown as ConfigService;

    payments = {
      recoverInitializingMarketplacePayments: jest
        .fn()
        .mockResolvedValue({
          settled: 0,
          unresolved: 0,
        }),
    };

    worker = new MarketplacePaymentRecoveryWorker(
      config,
      payments as unknown as PaymentService,
    );
  });

  afterEach(() => {
    worker.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not schedule recovery when explicitly disabled', async () => {
    values.MARKETPLACE_PAYMENT_RECOVERY_ENABLED = 'false';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(120000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('uses configured defaults and runs recovery on the interval', async () => {
    worker.onModuleInit();

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(59999);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledTimes(1);
    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledWith(300, 25);
  });

  it('passes configured stale age and batch size to recovery', async () => {
    values.MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS = '2000';
    values.MARKETPLACE_PAYMENT_RECOVERY_STALE_AFTER_SECONDS = '600';
    values.MARKETPLACE_PAYMENT_RECOVERY_BATCH_SIZE = '40';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(2000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledWith(600, 40);
  });

  it.each([
    ['invalid enabled flag', 'MARKETPLACE_PAYMENT_RECOVERY_ENABLED', 'yes'],
    ['invalid interval', 'MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS', 'bad'],
    ['too-short interval', 'MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS', '999'],
    ['invalid stale age', 'MARKETPLACE_PAYMENT_RECOVERY_STALE_AFTER_SECONDS', '0'],
    ['invalid batch size', 'MARKETPLACE_PAYMENT_RECOVERY_BATCH_SIZE', '101'],
  ])('does not schedule recovery for %s', async (_label, key, value) => {
    values[key] = value;

    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(120000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('prevents overlapping recovery calls within one process', async () => {
    let releaseRecovery: (() => void) | undefined;

    payments.recoverInitializingMarketplacePayments.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRecovery = () => resolve({
            settled: 0,
            unresolved: 1,
          });
        }),
    );

    values.MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS = '1000';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(1000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledTimes(1);

    if (!releaseRecovery) {
      throw new Error('Recovery promise was not started.');
    }

    releaseRecovery();
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledTimes(2);
  });

  it('clears the scheduled timer on module shutdown', async () => {
    worker.onModuleInit();

    expect(jest.getTimerCount()).toBe(1);

    worker.onModuleDestroy();

    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(120000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).not.toHaveBeenCalled();
  });

  it('does not expose recovery exceptions or stop future scheduled attempts', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    payments.recoverInitializingMarketplacePayments
      .mockRejectedValueOnce(
        new Error('sensitive provider response'),
      )
      .mockResolvedValue({
        settled: 0,
        unresolved: 0,
      });

    values.MARKETPLACE_PAYMENT_RECOVERY_INTERVAL_MS = '1000';

    worker.onModuleInit();

    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      'Marketplace payment recovery attempt failed; unresolved payments remain pending.',
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('sensitive provider response'),
    );

    await jest.advanceTimersByTimeAsync(1000);

    expect(
      payments.recoverInitializingMarketplacePayments,
    ).toHaveBeenCalledTimes(2);
  });
});
