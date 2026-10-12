import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export type PaymentProviderStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
export type PaymentMetadataValue = string | number | boolean | null;
export type PaymentMetadata = Record<string, PaymentMetadataValue>;

export interface ProviderExecutionConfiguration {
  id: string;
  config: Record<string, unknown>;
  credentials: string;
}

export interface InitializePaymentRequest {
  paymentReference: string;
  amountMinor: number;
  currency: CurrencyCode;
  customerEmail: string;
  callbackUrl: string;
  metadata: PaymentMetadata;
  providerConfiguration?: ProviderExecutionConfiguration;
}

export interface InitializePaymentResponse {
  providerName: string;
  providerReference: string;
  checkoutUrl: string;
  status: PaymentProviderStatus;
  rawPayload: unknown;
}

export type PaymentLookupStatus = 'FOUND' | 'NOT_FOUND' | 'UNKNOWN';

export interface LookupPaymentRequest {
  paymentReference: string;
  amountMinor: number;
  currency: CurrencyCode;
  providerConfiguration?: ProviderExecutionConfiguration;
}

export interface LookupPaymentResponse {
  status: PaymentLookupStatus;
  transaction?: {
    providerName: string;
    paymentReference: string;
    providerReference: string;
    amountMinor: number;
    currency: CurrencyCode;
    status: PaymentProviderStatus;
    rawPayload: unknown;
  };
}

export interface VerifyPaymentRequest {
  paymentReference: string;
  providerReference: string;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface VerifyPaymentResponse {
  providerName: string;
  providerReference: string;
  status: PaymentProviderStatus;
  amountMinor: number;
  currency: CurrencyCode;
  rawPayload: unknown;
}

export interface VerifyWebhookRequest {
  rawPayload: unknown;
  headers?: Record<string, string | string[] | undefined>;
  providerConfiguration?: {
    id: string;
    config: Record<string, unknown>;
    credentials: string;
  };
}

export interface VerifyWebhookResponse {
  valid: boolean;
  rawPayload: unknown;
}

export interface PaymentWebhookEvent {
  providerName: string;
  eventId: string;
  eventType: string;
  paymentReference: string;
  providerReference: string;
  amountMinor: number;
  currency: CurrencyCode;
  status: PaymentProviderStatus;
  metadata: PaymentMetadata;
  rawPayload: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  readonly runtimeMode: 'production' | 'test-only';
  initializePayment(request: InitializePaymentRequest): Promise<InitializePaymentResponse>;
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;
  lookupPayment(request: LookupPaymentRequest): Promise<LookupPaymentResponse>;
  verifyWebhook(request: VerifyWebhookRequest): Promise<VerifyWebhookResponse>;
  parseWebhook(rawPayload: unknown): PaymentWebhookEvent;
  isAvailable(): Promise<boolean>;
}