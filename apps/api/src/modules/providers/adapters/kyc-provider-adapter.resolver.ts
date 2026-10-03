import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { KycProvider } from '../interfaces/kyc-provider.interface';

export const KYC_PROVIDER_ADAPTERS = Symbol('KYC_PROVIDER_ADAPTERS');

@Injectable()
export class KycProviderAdapterResolver {
  private readonly adapters: Map<string, KycProvider>;

  constructor(
    @Inject(KYC_PROVIDER_ADAPTERS) adapters: Array<[string, KycProvider]>,
  ) {
    this.adapters = new Map(adapters);
  }

  resolve(adapterKey: string | null): KycProvider {
    if (!adapterKey || !this.adapters.has(adapterKey)) {
      throw new ServiceUnavailableException(
        'No KYC provider adapter is registered for the configured adapter key',
      );
    }

    return this.adapters.get(adapterKey)!;
  }
}
