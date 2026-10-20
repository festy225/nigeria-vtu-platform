import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  InitializePaymentRequest,
  InitializePaymentResponse,
  LookupPaymentRequest,
  LookupPaymentResponse,
  PaymentMetadata,
  PaymentProvider,
  PaymentWebhookEvent,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class PaystackPaymentProviderAdapter implements PaymentProvider {
  readonly name = 'PAYSTACK';
  readonly runtimeMode = 'test-only' as const;
  private readonly apiBase = 'https://api.paystack.co';

  async initializePayment(
    request: InitializePaymentRequest,
  ): Promise<InitializePaymentResponse> {
    const secret = this.testSecret(request.providerConfiguration?.credentials);
    if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) {
      throw new ServiceUnavailableException('Invalid payment amount');
    }

    const response = await this.apiRequest('/transaction/initialize', secret, {
      method: 'POST',
      body: JSON.stringify({
        email: request.customerEmail,
        amount: request.amountMinor,
        currency: request.currency,
        reference: request.paymentReference,
        callback_url: request.callbackUrl,
        metadata: {
          ...request.metadata,
          paymentReference: request.paymentReference,
        },
      }),
    });

    const data = this.record(response.data);
    if (
      response.status !== true ||
      typeof data.authorization_url !== 'string' ||
      typeof data.reference !== 'string' ||
      data.reference !== request.paymentReference
    ) {
      throw new ServiceUnavailableException(
        'Paystack did not return a valid checkout session',
      );
    }

    return {
      providerName: this.name,
      providerReference: data.reference,
      checkoutUrl: data.authorization_url,
      status: 'PENDING',
      rawPayload: response,
    };
  }

  async verifyPayment(
    request: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    const result = await this.lookupPayment({
      paymentReference: request.paymentReference,
      amountMinor: request.amountMinor,
      currency: request.currency,
      ...(request.providerConfiguration
        ? { providerConfiguration: request.providerConfiguration }
        : {}),
    });
    if (result.status !== 'FOUND' || !result.transaction) {
      return {
        providerName: this.name,
        providerReference: request.providerReference,
        status: 'PENDING',
        amountMinor: request.amountMinor,
        currency: request.currency,
        rawPayload: result,
      };
    }
    return {
      providerName: this.name,
      providerReference: result.transaction.providerReference,
      status: result.transaction.status,
      amountMinor: result.transaction.amountMinor,
      currency: result.transaction.currency,
      rawPayload: result.transaction.rawPayload,
    };
  }

  async lookupPayment(
    request: LookupPaymentRequest,
  ): Promise<LookupPaymentResponse> {
    let secret: string;
    try {
      secret = this.testSecret(request.providerConfiguration?.credentials);
    } catch {
      return { status: 'UNKNOWN' };
    }

    try {
      const result = await this.apiRequest(
        `/transaction/verify/${encodeURIComponent(request.paymentReference)}`,
        secret,
      );
      const data = this.record(result.data);
      if (result.status !== true || !data) return { status: 'UNKNOWN' };

      const reference = data.reference;
      const amount = data.amount;
      const currency = data.currency;
      const status = data.status;

      if (
        reference !== request.paymentReference ||
        !Number.isSafeInteger(amount) ||
        amount !== request.amountMinor ||
        currency !== request.currency ||
        typeof data.id !== 'number'
      ) {
        return { status: 'UNKNOWN' };
      }

      const paymentStatus =
        status === 'success' ? 'SUCCESS' :
        status === 'failed' || status === 'abandoned' ? 'FAILED' : 'PENDING';

      return {
        status: 'FOUND',
        transaction: {
          providerName: this.name,
          paymentReference: reference,
          providerReference: String(data.id),
          amountMinor: amount,
          currency,
          status: paymentStatus,
          rawPayload: result,
        },
      };
    } catch {
      // Network errors and unclassified API responses must never imply failure
      // or success; leave recovery to a later reconciliation attempt.
      return { status: 'UNKNOWN' };
    }
  }

  async verifyWebhook(
    request: VerifyWebhookRequest,
  ): Promise<VerifyWebhookResponse> {
    try {
      const secret = this.testSecret(request.providerConfiguration?.credentials);
      const signature = request.headers?.['x-paystack-signature'];
      if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) {
        return { valid: false, rawPayload: request.rawPayload };
      }

      // This adapter expects the caller to supply the original raw body as
      // rawBody on the webhook request. Parsed JSON is not safe for HMAC checks.
      const rawBody = (request as VerifyWebhookRequest & { rawBody?: Buffer }).rawBody;
      if (!Buffer.isBuffer(rawBody)) {
        return { valid: false, rawPayload: request.rawPayload };
      }

      const expected = createHmac('sha512', secret).update(rawBody).digest();
      const supplied = Buffer.from(signature, 'hex');
      return {
        valid: supplied.length === expected.length &&
          timingSafeEqual(supplied, expected),
        rawPayload: request.rawPayload,
      };
    } catch {
      return { valid: false, rawPayload: request.rawPayload };
    }
  }

  parseWebhook(rawPayload: unknown): PaymentWebhookEvent {
    const root = this.record(rawPayload);
    const data = this.record(root.data);
    const metadata = this.record(data.metadata);
    const rawCurrency = data.currency;
    if (rawCurrency !== 'USD' && rawCurrency !== 'NGN') {
      throw new ServiceUnavailableException('Unsupported Paystack webhook currency');
    }
    const currency = rawCurrency;
    const rawStatus = data.status;
    const amount = data.amount;
    const paymentReference =
      typeof metadata.paymentReference === 'string'
        ? metadata.paymentReference
        : typeof data.reference === 'string' ? data.reference : '';
    const providerReference =
      data.id !== undefined && data.id !== null ? String(data.id) : '';

    return {
      providerName: this.name,
      eventId: `${String(root.event ?? 'unknown')}:${providerReference}`,
      eventType: typeof root.event === 'string' ? root.event : 'unknown',
      paymentReference,
      providerReference,
      amountMinor: Number.isSafeInteger(amount) ? amount as number : 0,
      currency,
      status: rawStatus === 'success' ? 'SUCCESS' :
        rawStatus === 'failed' ? 'FAILED' : 'PENDING',
      metadata: this.safeMetadata(metadata),
      rawPayload,
    };
  }

  async isAvailable(): Promise<boolean> {
    return process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test';
  }

  private testSecret(value: string | undefined): string {
    if (!value || !/^sk_test_[A-Za-z0-9]+$/.test(value)) {
      throw new ServiceUnavailableException(
        'Paystack sandbox requires a valid test secret key',
      );
    }
    return value;
  }

  private async apiRequest(
    path: string,
    secret: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });

    const body: unknown = await response.json().catch(() => null);
    const record = this.record(body);
    if (!response.ok || typeof record.status !== 'boolean') {
      throw new ServiceUnavailableException('Paystack API request failed');
    }
    return record;
  }

  private record(value: unknown): Record<string, any> {
    return typeof value === 'object' && value !== null
      ? value as Record<string, any>
      : {};
  }

  private safeMetadata(value: Record<string, unknown>): PaymentMetadata {
    const output: PaymentMetadata = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean' ||
        item === null
      ) output[key] = item;
    }
    return output;
  }
}
