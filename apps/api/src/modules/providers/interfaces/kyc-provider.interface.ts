export type KycProviderDecision =
  | 'PENDING'
  | 'REVIEW_REQUIRED'
  | 'CONFIRMED'
  | 'NOT_CONFIRMED'
  | 'INFORMATION_REQUIRED';

export interface SubmitKycVerificationRequest {
  verificationReference: string;
  subjectReference: string;
  verificationType: string;
  attributes: Record<string, string>;
}

export interface SubmitKycVerificationResponse {
  communicationSucceeded: boolean;
  providerReference?: string;
}

export interface KycVerificationStatusRequest {
  providerReference: string;
}

export interface KycVerificationStatusResponse {
  communicationSucceeded: boolean;
  providerReference: string;
  decision?: KycProviderDecision;
}

export interface KycProvider {
  readonly name: string;

  submitVerification(
    request: SubmitKycVerificationRequest,
  ): Promise<SubmitKycVerificationResponse>;

  getVerificationStatus(
    request: KycVerificationStatusRequest,
  ): Promise<KycVerificationStatusResponse>;

  isAvailable(): Promise<boolean>;
}
