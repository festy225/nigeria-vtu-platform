export type ProviderStatus =
  | 'ACTIVE'
  | 'DEGRADED'
  | 'MAINTENANCE'
  | 'DISABLED'
  | 'UNHEALTHY';

export type ConfigurableServiceCode =
  | 'AIRTIME'
  | 'DATA'
  | 'ELECTRICITY'
  | 'TV_SUBSCRIPTION'
  | 'BETTING'
  | 'AIRTIME_TO_MONEY'
  | 'VOUCHER'
  | 'DATA_PRINTING'
  | 'ECOMMERCE'
  | 'KYC';

export interface ProviderRecord {
  id: string;
  name: string;
  adapterKey: string | null;
  status: ProviderStatus;
  baseUrl: string | null;
  capabilities: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderConfigurationRecord {
  id: string;
  providerId: string;
  serviceId: string | null;
  priority: number;
  isPrimary: boolean;
  isBackup: boolean;
  enabled: boolean;
  secretRef: string;
  config: Record<string, unknown>;
  updatedAt: Date;
}

export interface ProviderRegistrationRecord {
  provider: ProviderRecord;
  configuration: ProviderConfigurationRecord;
}
