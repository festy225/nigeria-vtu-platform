import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentProviderAdapterResolver } from '../adapters/payment-provider-adapter.resolver';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import type {
  ConfigurableServiceCode,
  ProviderConfigurationRecord,
  ProviderRecord,
  ProviderRegistrationRecord,
} from '../registry/provider-registry.types';

export interface PaymentProviderRegistration {
  provider: PaymentProvider;
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
export class PaymentProviderRouterService {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly adapters: PaymentProviderAdapterResolver,
  ) {}

  async getProvider(): Promise<PaymentProvider> {
    return (await this.getProviderRegistration()).provider;
  }

  async getProviderRegistration(
    serviceCode?: ConfigurableServiceCode,
  ): Promise<PaymentProviderRegistration> {
    const serviceId = serviceCode
      ? await this.registry.findEnabledServiceId(serviceCode)
      : null;

    if (serviceCode && !serviceId) {
      throw new ServiceUnavailableException(
        `Payment provider routing is not enabled for ${serviceCode}`,
      );
    }

    const registrations = await this.registry.findRegistrations(
      serviceId ?? undefined,
    );
    const candidates = registrations
      .filter(
        ({ provider, configuration }) =>
          provider.status === 'ACTIVE' &&
          configuration.enabled &&
          configuration.isPrimary &&
          configuration.serviceId === serviceId,
      )
      .sort(
        (left, right) =>
          left.configuration.priority - right.configuration.priority,
      );

    for (const registration of candidates) {
      try {
        const selected = this.toRegistration(registration);
        if (await selected.provider.isAvailable()) return selected;
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    throw new ServiceUnavailableException(
      'No configured payment provider is currently available',
    );
  }

  async getProviderRegistrationByConfigurationId(
    providerConfigurationId: string,
  ): Promise<PaymentProviderRegistration> {
    const registrations = await this.registry.findRegistrations();
    const registration = registrations.find(
      ({ configuration }) => configuration.id === providerConfigurationId,
    );

    if (!registration) {
      throw new ServiceUnavailableException(
        'The configured payment provider is not available',
      );
    }

    try {
      return this.toRegistration(registration);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ServiceUnavailableException(
          'The configured payment provider adapter is not available',
        );
      }
      throw error;
    }
  }

  async getProviderForRetry(
    safeToRetry: boolean,
  ): Promise<PaymentProvider> {
    try {
      return await this.getProvider();
    } catch (error) {
      if (
        !safeToRetry ||
        !(error instanceof ServiceUnavailableException)
      ) {
        throw error;
      }
    }

    const registrations = await this.registry.findRegistrations();
    const backups = registrations
      .filter(
        ({ provider, configuration }) =>
          provider.status === 'ACTIVE' &&
          configuration.enabled &&
          configuration.isBackup &&
          configuration.serviceId === null,
      )
      .sort(
        (left, right) =>
          left.configuration.priority - right.configuration.priority,
      );

    for (const registration of backups) {
      try {
        const selected = this.toRegistration(registration).provider;
        if (await selected.isAvailable()) return selected;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }

    throw new ServiceUnavailableException(
      'No configured backup payment provider is currently available',
    );
  }

  private toRegistration(
    registration: ProviderRegistrationRecord,
  ): PaymentProviderRegistration {
    const adapterKey = registration.provider.adapterKey;
    if (!adapterKey) {
      throw new NotFoundException(
        'Provider adapter key is not configured',
      );
    }
    const provider = this.adapters.resolve(adapterKey);
    if (
      provider.runtimeMode !== 'production' &&
      process.env.NODE_ENV !== 'development' &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new NotFoundException(
        'Payment provider adapter is not approved for production use',
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
