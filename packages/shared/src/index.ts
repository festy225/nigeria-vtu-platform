export type CurrencyCode = 'NGN' | 'USD';
export type UserRole = 'CUSTOMER' | 'AGENT' | 'VENDOR' | 'ADMIN' | 'SUPER_ADMIN';

export type ServiceType =
  | 'AIRTIME'
  | 'DATA'
  | 'ELECTRICITY'
  | 'TV_SUBSCRIPTION'
  | 'BETTING'
  | 'AIRTIME_TO_MONEY'
  | 'VOUCHER'
  | 'ECOMMERCE';

export type TransactionState =
  | 'CREATED'
  | 'VALIDATING'
  | 'FUNDS_HELD'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'UNKNOWN'
  | 'REQUIRES_VERIFICATION'
  | 'REFUNDED'
  | 'CANCELLED';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface WalletAccount {
  id: string;
  userId: string;
  currency: CurrencyCode;
  availableBalance: number;
  heldBalance: number;
}

export interface PlatformConfig {
  appName: string;
  environment: 'development' | 'staging' | 'production';
  apiBaseUrl: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
}

export interface ProviderHealthStatus {
  providerId: string;
  status: 'ACTIVE' | 'DEGRADED' | 'MAINTENANCE' | 'DISABLED';
  successRate: number;
  lastCheckedAt: string;
}
