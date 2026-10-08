import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../auth/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { ProviderManagementController } from './management/provider-management.controller';
import { ProviderRegistryService } from './registry/provider-registry.service';
import { MockAirtimeProviderAdapter } from './adapters/mock-airtime-provider.adapter';
import { AirtimeProviderAdapterResolver } from './adapters/airtime-provider-adapter.resolver';
import { MockPaymentProviderAdapter } from './adapters/mock-payment-provider.adapter';
import { PaymentProviderAdapterResolver } from './adapters/payment-provider-adapter.resolver';
import { MockLogisticsProviderAdapter } from './adapters/mock-logistics-provider.adapter';
import { LogisticsProviderAdapterResolver } from './adapters/logistics-provider-adapter.resolver';
import { LogisticsProviderRouterService } from './routing/logistics-provider-router.service';
import {
  KYC_PROVIDER_ADAPTERS,
  KycProviderAdapterResolver,
} from './adapters/kyc-provider-adapter.resolver';
import {
  AirtimeProviderRouterService,
  type AirtimeProviderRegistration,
} from './routing/airtime-provider-router.service';
import {
  PaymentProviderRouterService,
} from './routing/payment-provider-router.service';

export const AIRTIME_PROVIDER_REGISTRATIONS = Symbol(
  'AIRTIME_PROVIDER_REGISTRATIONS',
);

@Module({
  imports: [AuthorizationModule, AuditModule],
  controllers: [ProviderManagementController],
  providers: [
    ProviderRegistryService,
    MockPaymentProviderAdapter,
    {
      provide: KYC_PROVIDER_ADAPTERS,
      useValue: [],
    },
    KycProviderAdapterResolver,
    MockAirtimeProviderAdapter,
    AirtimeProviderAdapterResolver,
    PaymentProviderAdapterResolver,
    MockLogisticsProviderAdapter,
    LogisticsProviderAdapterResolver,
    LogisticsProviderRouterService,
    PaymentProviderRouterService,

    {
      provide: AIRTIME_PROVIDER_REGISTRATIONS,
      inject: [
        ProviderRegistryService,
        KycProviderAdapterResolver,
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
    MockLogisticsProviderAdapter,
    LogisticsProviderAdapterResolver,
    LogisticsProviderRouterService,
  ],
})
export class ProvidersModule {}
