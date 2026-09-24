import { Module } from '@nestjs/common';
import { MockAirtimeProviderAdapter } from './adapters/mock-airtime-provider.adapter';
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
  providers: [
    MockPaymentProviderAdapter,
    MockAirtimeProviderAdapter,

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
      inject: [MockAirtimeProviderAdapter],
      useFactory: (
        mockProvider: MockAirtimeProviderAdapter,
      ): AirtimeProviderRegistration[] => [
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
      provide: AirtimeProviderRouterService,
      inject: [AIRTIME_PROVIDER_REGISTRATIONS],
      useFactory: (
        registrations: AirtimeProviderRegistration[],
      ) => new AirtimeProviderRouterService(registrations),
    },
  ],

  exports: [
    PaymentProviderRouterService,
    AirtimeProviderRouterService,
    MockPaymentProviderAdapter,
    MockAirtimeProviderAdapter,
  ],
})
export class ProvidersModule {}