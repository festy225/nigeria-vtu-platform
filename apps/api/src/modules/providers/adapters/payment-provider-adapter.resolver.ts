import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentProvider } from '../interfaces/payment-provider.interface';
import { MockPaymentProviderAdapter } from './mock-payment-provider.adapter';

@Injectable()
export class PaymentProviderAdapterResolver {
  private readonly adapters: Map<string, PaymentProvider>;

  constructor(mockPaymentProvider: MockPaymentProviderAdapter) {
    this.adapters = new Map<string, PaymentProvider>([
      [mockPaymentProvider.name, mockPaymentProvider],
    ]);
  }

  resolve(adapterKey: string | null): PaymentProvider {
    if (!adapterKey) {
      throw new NotFoundException(
        'Provider adapter key is not configured',
      );
    }

    const adapter = this.adapters.get(adapterKey);
    if (!adapter) {
      throw new NotFoundException(
        `No payment provider adapter is registered for "${adapterKey}"`,
      );
    }
    return adapter;
  }
}
