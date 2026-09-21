import { Module } from '@nestjs/common';
import { MockPaymentProviderAdapter } from './adapters/mock-payment-provider.adapter';
import { PaymentProviderRouterService, type PaymentProviderRegistration } from './routing/payment-provider-router.service';

export const PAYMENT_PROVIDER_REGISTRATIONS = Symbol('PAYMENT_PROVIDER_REGISTRATIONS');

@Module({
  providers: [
    MockPaymentProviderAdapter,
    {
      provide: PAYMENT_PROVIDER_REGISTRATIONS,
      inject: [MockPaymentProviderAdapter],
      useFactory: (mockProvider: MockPaymentProviderAdapter): PaymentProviderRegistration[] => [{
        provider: mockProvider,
        priority: 100,
        isPrimary: true,
        isBackup: false,
        enabled: true,
      }],
    },
    {
      provide: PaymentProviderRouterService,
      inject: [PAYMENT_PROVIDER_REGISTRATIONS],
      useFactory: (registrations: PaymentProviderRegistration[]) => new PaymentProviderRouterService(registrations),
    },
  ],
  exports: [PaymentProviderRouterService, MockPaymentProviderAdapter],
})
export class ProvidersModule {}