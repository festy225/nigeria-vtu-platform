import { Injectable, NotFoundException } from '@nestjs/common';
import type { AirtimeProvider } from '../interfaces/airtime-provider.interface';
import { MockAirtimeProviderAdapter } from './mock-airtime-provider.adapter';

@Injectable()
export class AirtimeProviderAdapterResolver {
  private readonly adapters: Map<string, AirtimeProvider>;

  constructor(
    mockAirtimeProvider: MockAirtimeProviderAdapter,
  ) {
    this.adapters = new Map<string, AirtimeProvider>([
      [mockAirtimeProvider.name, mockAirtimeProvider],
    ]);
  }

  resolve(adapterKey: string | null): AirtimeProvider {
    if (!adapterKey) {
      throw new NotFoundException(
        'Provider adapter key is not configured',
      );
    }

    const adapter = this.adapters.get(adapterKey);

    if (!adapter) {
      throw new NotFoundException(
        `No airtime provider adapter is registered for "${adapterKey}"`,
      );
    }

    return adapter;
  }
}
