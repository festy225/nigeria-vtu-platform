import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  InitializePaymentRequest,
  InitializePaymentResponse,
  PaymentProvider,
  PaymentWebhookEvent,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProviderAdapter implements PaymentProvider {
  readonly name = 'MOCK';

  async initializePayment(request: InitializePaymentRequest): Promise<InitializePaymentResponse> {
    const providerReference = `MOCK-${randomUUID()}`;
    return {
      providerName: this.name,
      providerReference,
      checkoutUrl: `http://localhost/mock-payment?reference=${encodeURIComponent(providerReference)}`,
      status: 'PENDING',
      rawPayload: {
        provider: this.name,
        paymentReference: request.paymentReference,
        providerReference,
        amountMinor: request.amountMinor,
        currency: request.currency,
        status: 'PENDING',
      },
    };
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    return {
      providerName: this.name,
      providerReference: request.providerReference,
      status: 'PENDING',
      amountMinor: request.amountMinor,
      currency: request.currency,
      rawPayload: {
        provider: this.name,
        paymentReference: request.paymentReference,
        providerReference: request.providerReference,
        status: 'PENDING',
      },
    };
  }

  async verifyWebhook(request: VerifyWebhookRequest): Promise<VerifyWebhookResponse> {
    return { valid: true, rawPayload: request.rawPayload };
  }

  parseWebhook(rawPayload: unknown): PaymentWebhookEvent {
    const payload = this.asRecord(rawPayload);
    return {
      providerName: this.name,
      eventId: this.readString(payload.eventId) ?? `MOCK-EVENT-${randomUUID()}`,
      eventType: this.readString(payload.eventType) ?? 'payment.pending',
      paymentReference: this.readString(payload.paymentReference) ?? '',
      providerReference: this.readString(payload.providerReference) ?? '',
      amountMinor: this.readNumber(payload.amountMinor),
      currency: this.readCurrency(payload.currency),
      status: this.readStatus(payload.status),
      metadata: {},
      rawPayload,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0;
  }

  private readCurrency(value: unknown): 'NGN' | 'USD' {
    return value === 'USD' ? 'USD' : 'NGN';
  }

  private readStatus(value: unknown): 'PENDING' | 'SUCCESS' | 'FAILED' {
    return value === 'SUCCESS' || value === 'FAILED' ? value : 'PENDING';
  }
}