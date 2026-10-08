import { Injectable, NotFoundException } from '@nestjs/common';
import type { LogisticsProvider } from '../interfaces/logistics-provider.interface';
import { MockLogisticsProviderAdapter } from './mock-logistics-provider.adapter';

@Injectable()
export class LogisticsProviderAdapterResolver {
  private readonly adapters: Map<string, LogisticsProvider>;

  constructor(mockLogisticsProvider: MockLogisticsProviderAdapter) {
    this.adapters = new Map<string, LogisticsProvider>([
      [mockLogisticsProvider.name, mockLogisticsProvider],
    ]);
  }

  resolve(adapterKey: string | null): LogisticsProvider {
    if (!adapterKey) {
      throw new NotFoundException(
        'Logistics provider adapter key is not configured',
      );
    }

    const adapter = this.adapters.get(adapterKey);

    if (!adapter) {
      throw new NotFoundException(
        `No logistics provider adapter is registered for "${adapterKey}"`,
      );
    }

    return adapter;
  }
}
