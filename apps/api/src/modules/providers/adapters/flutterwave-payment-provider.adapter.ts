import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import type {
  InitializePaymentRequest,
  InitializePaymentResponse,
  LookupPaymentRequest,
  LookupPaymentResponse,
  PaymentMetadata,
  PaymentProvider,
  PaymentProviderStatus,
  PaymentWebhookEvent,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class FlutterwavePaymentProviderAdapter implements PaymentProvider {
  readonly name = 'FLUTTERWAVE';
  readonly runtimeMode = 'production' as const;
  private readonly apiBase = 'https://api.flutterwave.com/v3';

  async initializePayment(
    request: InitializePaymentRequest,
  ): Promise<InitializePaymentResponse> {
    const secret = this.apiSecret(request.providerConfiguration?.credentials);
    if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) {
      throw new ServiceUnavailableException('Invalid payment amount');
    }

    const response = await this.apiRequest('/payments', secret, {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: request.paymentReference,
        amount: request.amountMinor / 100,
        currency: request.currency,
        redirect_url: request.callbackUrl,
        customer: { email: request.customerEmail },
        meta: {
          ...request.metadata,
          paymentReference: request.paymentReference,
        },
        customizations: {
          title: 'CHIMZO',
          description: 'CHIMZO seller membership payment',
        },
      }),
    });

    const data = this.record(response.data);
    if (response.status !== 'success' || typeof data.link !== 'string') {
      throw new ServiceUnavailableException(
        'Flutterwave did not return a valid checkout session',
      );
    }

    return {
      providerName: this.name,
      providerReference: request.paymentReference,
      checkoutUrl: data.link,
      status: 'PENDING',
      rawPayload: response,
    };
  }

  async verifyPayment(
    request: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    let transactionId = request.providerReference;

    if (!/^\d+$/.test(transactionId)) {
      const lookup = await this.lookupPayment({
        paymentReference: request.paymentReference,
        amountMinor: request.amountMinor,
        currency: request.currency,
        ...(request.providerConfiguration
          ? { providerConfiguration: request.providerConfiguration }
          : {}),
      });

      if (lookup.status !== 'FOUND' || !lookup.transaction) {
        return {
          providerName: this.name,
          providerReference: request.providerReference,
          status: 'PENDING',
          amountMinor: request.amountMinor,
          currency: request.currency,
          rawPayload: lookup,
        };
      }
      transactionId = lookup.transaction.providerReference;
    }

    const secret = this.apiSecret(request.providerConfiguration?.credentials);
    const response = await this.apiRequest(
      `/transactions/${encodeURIComponent(transactionId)}/verify`,
      secret,
    );
    const data = this.record(response.data);
    const amountMinor = this.toMinorUnits(data.amount);

    if (
      response.status !== 'success' ||
      data.tx_ref !== request.paymentReference ||
      data.currency !== request.currency ||
      amountMinor !== request.amountMinor
    ) {
      throw new ServiceUnavailableException(
        'Flutterwave transaction verification did not match this payment',
      );
    }

    return {
      providerName: this.name,
      providerReference: String(data.id ?? transactionId),
      status: this.paymentStatus(data.status),
      amountMinor,
      currency: request.currency,
      rawPayload: response,
    };
  }

  async lookupPayment(
    request: LookupPaymentRequest,
  ): Promise<LookupPaymentResponse> {
    let secret: string;
    try {
      secret = this.apiSecret(request.providerConfiguration?.credentials);
    } catch {
      return { status: 'UNKNOWN' };
    }

    try {
      const response = await this.apiRequest(
        `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(request.paymentReference)}`,
        secret,
      );
      if (response.status !== 'success' || !response.data || typeof response.data !== 'object') {
        return { status: 'UNKNOWN' };
      }

      const match = this.record(response.data);

      if (match.tx_ref !== request.paymentReference) {
        return { status: 'UNKNOWN' };
      }

      if (!/^\d+$/.test(String(match.id ?? ''))) {
        return { status: 'NOT_FOUND' };
      }

      const amountMinor = this.toMinorUnits(match.amount);
      if (
        amountMinor !== request.amountMinor ||
        match.currency !== request.currency
      ) {
        return { status: 'UNKNOWN' };
      }

      return {
        status: 'FOUND',
        transaction: {
          providerName: this.name,
          paymentReference: request.paymentReference,
          providerReference: String(match.id),
          amountMinor,
          currency: request.currency,
          status: this.paymentStatus(match.status),
          rawPayload: response,
        },
      };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  async verifyWebhook(
    request: VerifyWebhookRequest,
  ): Promise<VerifyWebhookResponse> {
    const configuredHash =
      request.providerConfiguration?.config.resolvedWebhookSecret;

    const suppliedHeader = Object.entries(request.headers ?? {})
      .find(([name]) => name.toLowerCase() === 'verif-hash')?.[1];
    const supplied = Array.isArray(suppliedHeader)
      ? suppliedHeader.length === 1 ? suppliedHeader[0] : undefined
      : suppliedHeader;

    if (
      typeof configuredHash !== 'string' ||
      !configuredHash.trim() ||
      typeof supplied !== 'string' ||
      !supplied.trim()
    ) {
      return { valid: false, rawPayload: request.rawPayload };
    }

    const expectedBuffer = Buffer.from(configuredHash.trim(), 'utf8');
    const suppliedBuffer = Buffer.from(supplied.trim(), 'utf8');

    return {
      valid:
        expectedBuffer.length === suppliedBuffer.length &&
        timingSafeEqual(expectedBuffer, suppliedBuffer),
      rawPayload: request.rawPayload,
    };
  }

  parseWebhook(rawPayload: unknown): PaymentWebhookEvent {
    const root = this.record(rawPayload);
    const data = this.record(root.data);
    const metadata = this.record(data.meta ?? data.metadata);
    const rawCurrency = data.currency;

    if (rawCurrency !== 'NGN' && rawCurrency !== 'USD') {
      throw new ServiceUnavailableException(
        'Unsupported Flutterwave webhook currency',
      );
    }

    const providerReference = String(data.id ?? '');
    const paymentReference =
      typeof data.tx_ref === 'string' ? data.tx_ref :
      typeof metadata.paymentReference === 'string'
        ? metadata.paymentReference
        : '';

    return {
      providerName: this.name,
      eventId: `${String(root.event ?? 'unknown')}:${providerReference}`,
      eventType: typeof root.event === 'string' ? root.event : 'unknown',
      paymentReference,
      providerReference,
      amountMinor: this.toMinorUnits(data.amount),
      currency: rawCurrency as CurrencyCode,
      status: this.paymentStatus(data.status),
      metadata: this.safeMetadata(metadata),
      rawPayload,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private apiSecret(value: string | undefined): string {
    if (!value || !value.trim()) {
      throw new ServiceUnavailableException(
        'Flutterwave API credentials are not configured',
      );
    }
    return value.trim();
  }

  private toMinorUnits(value: unknown): number {
    const amount = typeof value === 'number' ? value :
      typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const minor = Math.round(amount * 100);
    return Number.isSafeInteger(minor) ? minor : 0;
  }

  private paymentStatus(value: unknown): PaymentProviderStatus {
    if (value === 'successful') return 'SUCCESS';
    if (value === 'failed' || value === 'cancelled') return 'FAILED';
    return 'PENDING';
  }

  private async apiRequest(
    path: string,
    secret: string,
    init: RequestInit = {},
  ): Promise<Record<string, any>> {
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
    const result = this.record(body);

    if (!response.ok || typeof result.status !== 'string') {
      throw new ServiceUnavailableException('Flutterwave API request failed');
    }
    return result;
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
      ) {
        output[key] = item;
      }
    }
    return output;
  }
}


