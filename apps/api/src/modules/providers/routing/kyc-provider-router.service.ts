import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { KycProviderAdapterResolver } from '../adapters/kyc-provider-adapter.resolver';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import type { ProviderRegistrationRecord } from '../registry/provider-registry.types';
import type { KycProvider } from '../interfaces/kyc-provider.interface';

export interface KycProviderRegistration {
  provider: KycProvider;
  providerId: string;
  providerConfigurationId: string;
  priority: number;
  isBackup: boolean;
}

@Injectable()
export class KycProviderRouterService {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly adapters: KycProviderAdapterResolver,
  ) {}

  async getProvider(): Promise<KycProviderRegistration> {
    const serviceId = await this.registry.findEnabledServiceId('KYC');

    if (!serviceId) {
      throw new ServiceUnavailableException(
        'KYC provider routing is not enabled',
      );
    }

    const registrations = await this.registry.findRegistrations(serviceId);
    const candidates = registrations
      .filter(
        (registration) =>
          registration.configuration.enabled &&
          (registration.configuration.isPrimary ||
            registration.configuration.isBackup) &&
          registration.provider.status === 'ACTIVE' &&
          registration.provider.capabilities.kyc === true,
      )
      .sort((left, right) => {
        if (left.configuration.isPrimary !== right.configuration.isPrimary) {
          return left.configuration.isPrimary ? -1 : 1;
        }
        return left.configuration.priority - right.configuration.priority;
      });

    for (const registration of candidates) {
      const provider = this.adapters.resolve(registration.provider.adapterKey);
      if (await provider.isAvailable()) {
        return this.toRegistration(registration, provider);
      }
    }

    throw new ServiceUnavailableException(
      'No configured KYC provider is currently available',
    );
  }

  private toRegistration(
    registration: ProviderRegistrationRecord,
    provider: KycProvider,
  ): KycProviderRegistration {
    return {
      provider,
      providerId: registration.provider.id,
      providerConfigurationId: registration.configuration.id,
      priority: registration.configuration.priority,
      isBackup: registration.configuration.isBackup,
    };
  }
}
