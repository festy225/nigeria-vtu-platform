import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AirtimeProvider,
  AirtimePurchaseRequest,
  AirtimePurchaseResponse,
} from '../interfaces/airtime-provider.interface';

@Injectable()
export class MockAirtimeProviderAdapter implements AirtimeProvider {
  readonly name = 'MOCK_AIRTIME';

  async purchaseAirtime(
    request: AirtimePurchaseRequest,
  ): Promise<AirtimePurchaseResponse> {
    const providerReference = `MOCK-AIRTIME-${randomUUID()}`;

    return {
      providerName: this.name,
      providerReference,
      status: 'SUCCESS',
      rawPayload: {
        provider: this.name,
        transactionReference: request.transactionReference,
        network: request.network,
        phoneNumber: request.phoneNumber,
        amountMinor: request.amountMinor,
        currency: request.currency,
        status: 'SUCCESS',
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}