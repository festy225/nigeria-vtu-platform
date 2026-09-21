import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PaymentProvider } from '../interfaces/payment-provider.interface';

export interface PaymentProviderRegistration {
  provider: PaymentProvider;
  priority: number;
  isPrimary: boolean;
  isBackup: boolean;
  enabled: boolean;
}

@Injectable()
export class PaymentProviderRouterService {
  private readonly registrations: PaymentProviderRegistration[];

  constructor(registrations: PaymentProviderRegistration[]) {
    this.registrations = registrations;
  }

  async getProvider(): Promise<PaymentProvider> {
    return this.selectProvider(false);
  }

  async getProviderForRetry(safeToRetry: boolean): Promise<PaymentProvider> {
    return this.selectProvider(safeToRetry);
  }

  private async selectProvider(allowBackup: boolean): Promise<PaymentProvider> {
    const primary = await this.sortedAvailable(this.registrations.filter((registration) => registration.isPrimary));
    const selectedPrimary = primary[0];
    if (selectedPrimary) return selectedPrimary.provider;

    if (allowBackup) {
      const backup = await this.sortedAvailable(this.registrations.filter((registration) => registration.isBackup));
      if (backup[0]) return backup[0].provider;
    }

    throw new ServiceUnavailableException('No payment provider is currently available');
  }

  private async sortedAvailable(registrations: PaymentProviderRegistration[]) {
    const available = [] as PaymentProviderRegistration[];
    for (const registration of registrations) {
      if (registration.enabled && await registration.provider.isAvailable()) available.push(registration);
    }
    return available.sort((left, right) => left.priority - right.priority);
  }
}