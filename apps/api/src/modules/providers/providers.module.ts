import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../auth/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { ProviderManagementController } from './management/provider-management.controller';
import { ProviderRegistryService } from './registry/provider-registry.service';
import { MockAirtimeProviderAdapter } from './adapters/mock-airtime-provider.adapter';
import { AirtimeProviderAdapterResolver } from './adapters/airtime-provider-adapter.resolver';
import { MockPaymentProviderAdapter } from './adapters/mock-payment-provider.adapter';
import {
  AirtimeProviderRouterService,
  type AirtimeProviderRegistration,
} from './routing/airtime-provider-router.service';
import {
  PaymentProviderRouterService,
  type PaymentProviderRegistration,
} from './routing/payment-provider-router.service';

export const PAYMENT_PROVIDER_REGISTRATIONS = Symbol(
  'PAYMENT_PROVIDER_REGISTRATIONS',
);

export const AIRTIME_PROVIDER_REGISTRATIONS = Symbol(
  'AIRTIME_PROVIDER_REGISTRATIONS',
);

@Module({
  imports: [AuthorizationModule, AuditModule],
  controllers: [ProviderManagementController],
  providers: [
    ProviderRegistryService,
    MockPaymentProviderAdapter,
    MockAirtimeProviderAdapter,
    AirtimeProviderAdapterResolver,

    {
      provide: PAYMENT_PROVIDER_REGISTRATIONS,
      inject: [MockPaymentProviderAdapter],
      useFactory: (
        mockProvider: MockPaymentProviderAdapter,
      ): PaymentProviderRegistration[] => [
        {
          provider: mockProvider,
          priority: 100,
          isPrimary: true,
          isBackup: false,
          enabled: true,
        },
      ],
    },

    {
      provide: PaymentProviderRouterService,
      inject: [PAYMENT_PROVIDER_REGISTRATIONS],
      useFactory: (
        registrations: PaymentProviderRegistration[],
      ) => new PaymentProviderRouterService(registrations),
    },

    {
      provide: AIRTIME_PROVIDER_REGISTRATIONS,
      inject: [
        ProviderRegistryService,
        AirtimeProviderAdapterResolver,
      ],
      useFactory: async (
        providerRegistry: ProviderRegistryService,
        adapterResolver: AirtimeProviderAdapterResolver,
      ): Promise<AirtimeProviderRegistration[]> => {
        const registrations =
          await providerRegistry.findRegistrations();

        return registrations
          .filter(
            (registration) =>
              registration.provider.capabilities.airtime === true,
          )
          .map((registration) => ({
  provider: adapterResolver.resolve(
    registration.provider.adapterKey,
  ),
  providerId: registration.provider.id,
  priority: registration.configuration.priority,
  isPrimary: registration.configuration.isPrimary,
  isBackup: registration.configuration.isBackup,
  enabled: registration.configuration.enabled,
}));
      },
    },

    {
      provide: AirtimeProviderRouterService,
      inject: [AIRTIME_PROVIDER_REGISTRATIONS],
      useFactory: (
        registrations: AirtimeProviderRegistration[],
      ) => new AirtimeProviderRouterService(registrations),
    },
  ],

  exports: [
    ProviderRegistryService,
    PaymentProviderRouterService,
    AirtimeProviderRouterService,
    MockPaymentProviderAdapter,
    MockAirtimeProviderAdapter,
  ],
})
export class ProvidersModule {}
