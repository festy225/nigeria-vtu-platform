import type { KycProviderDecision } from '../providers/interfaces/kyc-provider.interface';

export type KycVerificationStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'MORE_INFORMATION_REQUIRED';

export interface KycVerificationRecord {
  id: string;
  sellerId: string;
  userId: string;
  status: KycVerificationStatus;
  providerReference: string | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NormalizedKycResult {
  status: KycVerificationStatus;
  providerReference?: string;
  reasonCode?: string;
  source: 'PROVIDER';
}

export function normalizeKycProviderDecision(
  decision: KycProviderDecision,
): KycVerificationStatus {
  switch (decision) {
    case 'PENDING':
      return 'PENDING';
    case 'REVIEW_REQUIRED':
      return 'IN_REVIEW';
    case 'CONFIRMED':
      return 'VERIFIED';
    case 'NOT_CONFIRMED':
      return 'REJECTED';
    case 'INFORMATION_REQUIRED':
      return 'MORE_INFORMATION_REQUIRED';
  }
}
