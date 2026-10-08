import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { LogisticsProvider } from '../interfaces/logistics-provider.interface';
import { LogisticsProviderAdapterResolver } from '../adapters/logistics-provider-adapter.resolver';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import type {
  ProviderConfigurationRecord,
  ProviderRecord,
  ProviderRegistrationRecord,
} from '../registry/provider-registry.types';

export interface LogisticsProviderRegistration {
  provider: LogisticsProvider;
  providerId: string;
  providerConfigurationId: string;
  adapterKey: string;
  serviceId: string | null;
  priority: number;
  isPrimary: boolean;
  isBackup: boolean;
  configuration: ProviderConfigurationRecord;
  providerRecord: ProviderRecord;
}

@Injectable()
export class LogisticsProviderRouterService {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly adapters: LogisticsProviderAdapterResolver,
  ) {}

  async getProvider(): Promise<LogisticsProvider> {
    return (await this.getProviderRegistration()).provider;
  }

  async getProviderRegistration(): Promise<LogisticsProviderRegistration> {
    const registrations = await this.registry.findRegistrations();

    const candidates = registrations
      .filter(
        ({ provider, configuration }) =>
          provider.status === 'ACTIVE' &&
          provider.capabilities.logistics === true &&
          configuration.enabled &&
          configuration.isPrimary &&
          configuration.serviceId === null,
      )
      .sort(
        (left, right) =>
          left.configuration.priority - right.configuration.priority,
      );

    for (const registration of candidates) {
      try {
        const selected = this.toRegistration(registration);

        if (await selected.provider.isAvailable()) {
          return selected;
        }
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    throw new ServiceUnavailableException(
      'No configured logistics provider is currently available',
    );
  }

  async getProviderRegistrationByConfigurationId(
    providerConfigurationId: string,
  ): Promise<LogisticsProviderRegistration> {
    const registrations = await this.registry.findRegistrations();

    const registration = registrations.find(
      ({ configuration }) => configuration.id === providerConfigurationId,
    );

    if (!registration) {
      throw new ServiceUnavailableException(
        'The configured logistics provider is not available',
      );
    }

    try {
      return this.toRegistration(registration);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ServiceUnavailableException(
          'The configured logistics provider adapter is not available',
        );
      }

      throw error;
    }
  }

  private toRegistration(
    registration: ProviderRegistrationRecord,
  ): LogisticsProviderRegistration {
    const adapterKey = registration.provider.adapterKey;

    if (!adapterKey) {
      throw new NotFoundException(
        'Logistics provider adapter key is not configured',
      );
    }

    const provider = this.adapters.resolve(adapterKey);

    if (
      provider.runtimeMode !== 'production' &&
      process.env.NODE_ENV !== 'development' &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new NotFoundException(
        'Logistics provider adapter is not approved for production use',
      );
    }

    return {
      provider,
      providerId: registration.provider.id,
      providerConfigurationId: registration.configuration.id,
      adapterKey,
      serviceId: registration.configuration.serviceId,
      priority: registration.configuration.priority,
      isPrimary: registration.configuration.isPrimary,
      isBackup: registration.configuration.isBackup,
      configuration: registration.configuration,
      providerRecord: registration.provider,
    };
  }
}
