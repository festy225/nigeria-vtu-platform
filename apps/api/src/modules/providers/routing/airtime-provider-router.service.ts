import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AirtimeProvider } from '../interfaces/airtime-provider.interface';

export interface AirtimeProviderRegistration {
  provider: AirtimeProvider;
  priority: number;
  isPrimary: boolean;
  isBackup: boolean;
  enabled: boolean;
}

@Injectable()
export class AirtimeProviderRouterService {
  private readonly registrations: AirtimeProviderRegistration[];

  constructor(registrations: AirtimeProviderRegistration[]) {
    this.registrations = registrations;
  }

  async getProvider(): Promise<AirtimeProvider> {
    return this.selectProvider(false);
  }

  async getProviderForRetry(
    safeToRetry: boolean,
  ): Promise<AirtimeProvider> {
    return this.selectProvider(safeToRetry);
  }

  private async selectProvider(
    allowBackup: boolean,
  ): Promise<AirtimeProvider> {
    const primary = await this.sortedAvailable(
      this.registrations.filter(
        (registration) => registration.isPrimary,
      ),
    );

    const selectedPrimary = primary[0];

    if (selectedPrimary) {
      return selectedPrimary.provider;
    }

    if (allowBackup) {
      const backup = await this.sortedAvailable(
        this.registrations.filter(
          (registration) => registration.isBackup,
        ),
      );

      if (backup[0]) {
        return backup[0].provider;
      }
    }

    throw new ServiceUnavailableException(
      'No airtime provider is currently available',
    );
  }

  private async sortedAvailable(
    registrations: AirtimeProviderRegistration[],
  ): Promise<AirtimeProviderRegistration[]> {
    const available: AirtimeProviderRegistration[] = [];

    for (const registration of registrations) {
      if (
        registration.enabled &&
        (await registration.provider.isAvailable())
      ) {
        available.push(registration);
      }
    }

    return available.sort(
      (left, right) => left.priority - right.priority,
    );
  }
}