import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export type AirtimeProviderStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PROCESSING'
  | 'UNKNOWN';

export interface AirtimePurchaseRequest {
  transactionReference: string;
  network: string;
  phoneNumber: string;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface AirtimePurchaseResponse {
  providerName: string;
  providerReference: string;
  status: AirtimeProviderStatus;
  rawPayload: unknown;
}

export interface AirtimeProvider {
  readonly name: string;

  purchaseAirtime(
    request: AirtimePurchaseRequest,
  ): Promise<AirtimePurchaseResponse>;

  isAvailable(): Promise<boolean>;
}