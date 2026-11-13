import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '').endsWith('/api/v1')
  ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '')
  : `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: string[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  roles: string[];
}

export interface VerificationResponse {
  purpose: 'EMAIL_VERIFICATION' | 'PHONE_VERIFICATION';
  token?: string;
}

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  verification?: VerificationResponse[];
}

export type AuthStorage = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export interface WalletApiRecord {
  id: string;
  currency: 'NGN' | 'USD';
  status: string;
  available_minor: number | string;
  held_minor: number | string;
}

export interface WalletStatementRecord {
  reference: string;
  operation: string;
  currency: 'NGN' | 'USD';
  entry_type: 'DEBIT' | 'CREDIT';
  amount_minor: number | string;
  description: string | null;
  created_at: string;
}

export type SellerType =
  | 'RETAILER'
  | 'WHOLESALER'
  | 'DISTRIBUTOR';

export type SellerApplicationType = 'RETAILER';
export type SellerBusinessRegistrationStatus = 'REGISTERED' | 'UNREGISTERED' | 'IN_PROGRESS';
export type SellerApplicationDocumentType =
  | 'IDENTITY_DOCUMENT'
  | 'CAC_CERTIFICATE'
  | 'BUSINESS_PROOF'
  | 'ADDRESS_PROOF';

export interface SellerApplicationPayload {
  sellerType?: SellerApplicationType;
  businessName?: string;
  storeName?: string;
  storeSlug?: string;
  businessDescription?: string;
  businessRegistrationStatus?: SellerBusinessRegistrationStatus;
  cacRegistrationNumber?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  productsServicesDescription?: string;
  productCategories?: string[];
}

export interface SellerApplicationDocument {
  id: string;
  seller_id: string;
  document_type: SellerApplicationDocumentType;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  verification_status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewer_note: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
}

export interface SellerApplication {
  id: string;
  user_id: string;
  seller_type: SellerType;
  business_name: string;
  store_name: string;
  store_slug: string;
  onboarding_status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'MORE_INFORMATION_REQUIRED'
    | 'APPROVED'
    | 'SUSPENDED'
    | 'REJECTED';
  kyc_status:
    | 'PENDING'
    | 'IN_REVIEW'
    | 'VERIFIED'
    | 'REJECTED';
  risk_status:
    | 'NORMAL'
    | 'WATCH'
    | 'HIGH'
    | 'RESTRICTED';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  business_description?: string | null;
  business_registration_status?: SellerBusinessRegistrationStatus | null;
  cac_registration_number?: string | null;
  business_email?: string | null;
  business_phone?: string | null;
  business_address?: string | null;
  products_services_description?: string | null;
  product_categories?: string[];
  documents?: SellerApplicationDocument[];
}
export type SellerApplicationReviewDecision =
  | 'START_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'MORE_INFORMATION_REQUIRED';

export interface SellerApplicationReviewResult {
  id: string;
  user_id: string;
  onboarding_status: SellerApplication['onboarding_status'];
  reviewed_by: string;
  reviewed_at: string;
}

export interface SellerMembershipProgram {
  id: string;
  programCode?: string;
  program_code?: string;
  displayName?: string;
  display_name?: string;
  description?: string | null;
  monthlyPriceMinor?: number | string;
  monthly_price_minor?: number | string;
  annualPriceMinor?: number | string;
  annual_price_minor?: number | string;
  currency: string;
  termsVersion?: string;
  terms_version?: string;
  termsAndConditions?: string | null;
  terms_and_conditions?: string | null;
}

export interface TestSimulatorStatus {
  enabled: boolean;
  production: boolean;
}

export interface AdminPendingSellerMembershipPayment {
  id: string;
  reference: string;
  user_id: string;
  amount_minor: number | string;
  currency: string;
  state: string;
  provider_status: string | null;
  created_at: string;
  program_code: string;
}

export interface AdminKycVerification {
  id: string;
  seller_id: string;
  user_id: string;
  status: string;
  provider_reference: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  business_name: string;
  onboarding_status: string;
  kyc_status: string;
}

export interface SellerMembershipPaymentIntent {
  payment: {
    id: string;
    reference: string;
    state: string;
    purpose?: string;
    amountMinor: number;
    currency: string;
    membershipProgramId?: string;
    billingPeriod?: string;
  };
  provider?: { name?: string; reference?: string; status?: string };
  checkout?: { url?: string };
}

export interface SellerMembershipPaymentStatus {
  payment: {
    id: string;
    reference: string;
    state: string;
    purpose?: string;
    amountMinor: number;
    currency: string;
    membershipProgramId?: string | null;
    billingPeriod?: string | null;
    createdAt?: string;
  };
  provider?: { name?: string; reference?: string; status?: string };
}
export interface SellerFulfillment {
  id: string;
  order_id: string;
  seller_id: string;
  status: string;
  provider_configuration_id?: string | null;
  tracking_reference?: string | null;
  origin_snapshot?: Record<string, unknown> | null;
  destination_snapshot?: Record<string, unknown> | null;
  selected_office_id?: string | null;
  selected_office_snapshot?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface MarketplaceCustomerAddress {
  id: string;
  label?: string | null;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isDefault?: boolean;
}

export interface MarketplaceSellerLocation {
  id: string;
  location_name: string;
  address_line1: string;
  city: string;
  country_code: string;
  enabled?: boolean;
  is_default?: boolean;
}

export interface LogisticsOffice {
  providerOfficeId: string;
  name: string;
  address: string;
  distanceKm?: number;
  phone?: string;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
}

export interface LogisticsTrackingEvent {
  providerEventId?: string;
  status: string;
  providerStatus?: string;
  description?: string;
  location?: string;
  occurredAt: string;
}

export interface SellerOrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productDescription: string;
  sellerName: string;
  sku: string | null;
  variantDescription: unknown;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: CurrencyCode;
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  status: string;
  currency: CurrencyCode;
  subtotalMinor: number;
  totalMinor: number;
  itemCount: number;
  sellerTotalMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface SellerOrderDetail extends SellerOrder {
  items: SellerOrderItem[];
}

export interface MarketplaceCatalogVariant {
  id: string;
  sku: string;
  priceMinor: number;
  currency: CurrencyCode;
  attributeValues: Array<{
    attributeId: string;
    attributeCode: string;
    attributeName: string;
    valueId: string;
    valueCode: string;
    value: string;
  }>;
}

export interface MarketplaceProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  sellerName: string;
  name: string;
  description: string;
  imageUrl: string | null;
  hasVariants: boolean;
  priceMinor: number | null;
  currency: CurrencyCode | null;
}

export interface SellerProduct {
  id: string;
  seller_id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string | null;
  price_minor: string | number | null;
  currency: CurrencyCode | null;
  status: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
export interface SellerProductMedia {
  id: string;
  productId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  fileSize: number | string;
  displayOrder: number;
  altText: string | null;
  createdAt: string;
  url: string;
}
export interface MarketplaceProductDetail extends MarketplaceProduct {
  variants: MarketplaceCatalogVariant[];
}

export interface MarketplaceCart {
  id: string | null;
  items: MarketplaceCartItem[];
}

export interface MarketplaceCheckoutOrder {
  id: string;
  orderNumber: string;
  status: string;
  currency: CurrencyCode;
  subtotalMinor: number;
  totalMinor: number;
  payment: {
    status: 'NOT_INITIATED';
  };
}

export interface MarketplaceCustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  currency: CurrencyCode;
  subtotalMinor: number;
  totalMinor: number;
  createdAt: string;
  payment: {
    id: string;
    reference: string | null;
    state: string | null;
    providerStatus: string | null;
    providerName: string | null;
    providerReference: string | null;
  } | null;
}

export interface MarketplaceOrderPaymentStatus {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    currency: CurrencyCode;
    totalMinor: number;
    createdAt: string;
  };
  payment: MarketplaceCustomerOrder['payment'];
}

export interface MarketplacePaymentIntent {
  payment: {
    id: string;
    reference: string;
    userId: string;
    purpose: string;
    amountMinor: number;
    currency: CurrencyCode;
    state: string;
  };
  provider?: {
    name: string;
    reference: string;
    status: string;
  };
  checkout?: {
    url: string;
  };
}

export interface MarketplaceCartItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  sku: string | null;
  variantAttributes: MarketplaceCatalogVariant['attributeValues'];
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: CurrencyCode;
}
export interface AdminUserRecord {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  roles: string[];
  created_at: string;
  updated_at: string;
}

export interface AdminUserList {
  items: AdminUserRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface AdminProviderSecretStatus {
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
}

export interface UpdateAdminProviderSecretsPayload {
  apiSecret?: string;
  webhookSecret?: string;
}

export interface AdminProviderRecord {
  id: string;
  adapterKey: string | null;
  name: string;
  status: string;
  baseUrl: string | null;
  capabilities: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProviderConfiguration {
  id: string;
  providerId: string;
  serviceId: string | null;
  priority: number;
  isPrimary: boolean;
  isBackup: boolean;
  enabled: boolean;
  secretRef: string;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface AdminProviderHealth {
  id: string;
  providerId: string;
  serviceId?: string | null;
  status: string;
  successRate?: number | string | null;
  timeoutRate?: number | string | null;
  averageLatencyMs?: number | null;
  checkedAt?: string | null;
}
type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
};

export function readAuthStorage(): AuthStorage | null {
  if (typeof window === 'undefined') return null;
  const accessToken = window.sessionStorage.getItem('vtu_access_token');
  const refreshToken = window.sessionStorage.getItem('vtu_refresh_token');
  const rawUser = window.sessionStorage.getItem('vtu_user');
  if (!accessToken || !refreshToken || !rawUser) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(rawUser) as AuthUser };
  } catch {
    clearAuthStorage();
    return null;
  }
}

export function writeAuthStorage(session: AuthSessionResponse): void {
  window.sessionStorage.setItem('vtu_access_token', session.accessToken);
  window.sessionStorage.setItem('vtu_refresh_token', session.refreshToken);
  window.sessionStorage.setItem('vtu_user', JSON.stringify(session.user));
}

export function clearAuthStorage(): void {
  window.sessionStorage.removeItem('vtu_access_token');
  window.sessionStorage.removeItem('vtu_refresh_token');
  window.sessionStorage.removeItem('vtu_user');
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = typeof window !== 'undefined' ? window.sessionStorage.getItem('vtu_access_token') : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) throw new ApiError(response.status, body.message ?? 'Request failed', body.errors);
  return (body.data === undefined ? body : body.data) as T;
}

export async function authenticatedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await fetchJson<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const session = readAuthStorage();
      if (session?.refreshToken) {
        try {
          const refreshed = await api.refresh(session.refreshToken);
          writeAuthStorage(refreshed);
          return await fetchJson<T>(path, init);
        } catch {
          clearAuthStorage();
        }
      }
    }
    throw error;
  }
}

async function fetchBlob(path: string): Promise<Blob> {
  const accessToken = typeof window !== 'undefined'
    ? window.sessionStorage.getItem('vtu_access_token')
    : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      Accept: '*/*',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiEnvelope<unknown>;
    throw new ApiError(response.status, body.message ?? 'Document download failed', body.errors);
  }
  return response.blob();
}

async function authenticatedBlobFetch(path: string): Promise<Blob> {
  try {
    return await fetchBlob(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const session = readAuthStorage();
      if (session?.refreshToken) {
        try {
          const refreshed = await api.refresh(session.refreshToken);
          writeAuthStorage(refreshed);
          return await fetchBlob(path);
        } catch {
          clearAuthStorage();
        }
      }
    }
    throw error;
  }
}

export const api = {
  login: (payload: { identifier: string; password: string }) =>
    fetchJson<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
passwordResetRequest: (identifier: string) =>
  fetchJson<{
    accepted: boolean;
    token?: string;
  }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  }),

passwordResetConfirm: (token: string, password: string) =>
  fetchJson<{ reset: boolean }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }),
  register: (payload: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}) =>
    fetchJson<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyEmail: (token: string) =>
    fetchJson<{ verified: boolean; type: 'email' }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  verifyPhone: (token: string) =>
    fetchJson<{ verified: boolean; type: 'phone' }>('/auth/verify-phone', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  resendVerification: (identifier: string) =>
    fetchJson<{
      accepted: boolean;
      verification?: VerificationResponse;
    }>('/auth/verification/resend', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  me: async (): Promise<AuthUser> =>
    (await authenticatedFetch<{ user: AuthUser }>('/auth/me')).user,

  refresh: (refreshToken: string) =>
    fetchJson<AuthSessionResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken?: string) =>
    fetchJson<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  wallets: () =>
    authenticatedFetch<WalletApiRecord[]>('/wallets'),

  walletStatement: (currency?: 'NGN' | 'USD') =>
    authenticatedFetch<WalletStatementRecord[]>(
      `/wallets/statement${
        currency ? `?currency=${encodeURIComponent(currency)}` : ''
      }`,
    ),

  getAdminUsers: (params: { page: number; limit: number; search?: string }) => {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.search?.trim()) query.set("search", params.search.trim());
    return authenticatedFetch<AdminUserList>("/users?" + query.toString());
  },
  getAdminProviderSecretStatus: (providerId: string) =>
    authenticatedFetch<AdminProviderSecretStatus>(
      "/admin/providers/" + encodeURIComponent(providerId) + "/secrets/status",
      { cache: "no-store" },
    ),

  updateAdminProviderSecrets: (
    providerId: string,
    payload: UpdateAdminProviderSecretsPayload,
  ) =>
    authenticatedFetch<AdminProviderSecretStatus>(
      "/admin/providers/" + encodeURIComponent(providerId) + "/secrets",
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),

  getAdminProviders: () =>
    authenticatedFetch<AdminProviderRecord[]>("/admin/providers"),

  createAdminProvider: (payload: {
    name: string;
    adapterKey: string;
    baseUrl?: string;
    capabilities?: Record<string, unknown>;
  }) => authenticatedFetch<AdminProviderRecord>("/admin/providers", {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  getAdminProviderConfigurations: (providerId: string) =>
    authenticatedFetch<AdminProviderConfiguration[]>(
      "/admin/providers/" + encodeURIComponent(providerId) + "/configurations"
    ),

  getAdminProviderHealth: (providerId: string) =>
    authenticatedFetch<AdminProviderHealth[]>(
      "/admin/providers/" + encodeURIComponent(providerId) + "/health"
    ),

  createAdminProviderConfiguration: (payload: {
    providerId: string;
    serviceId?: string;
    priority: number;
    isPrimary: boolean;
    isBackup: boolean;
    enabled: boolean;
    secretRef: string;
    config?: Record<string, unknown>;
  }) => authenticatedFetch<AdminProviderConfiguration>("/admin/providers/configurations", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  updateAdminProviderConfiguration: (
    id: string,
    payload: {
      priority: number;
      isPrimary: boolean;
      isBackup: boolean;
      enabled: boolean;
      secretRef: string;
      config?: Record<string, unknown>;
    },
  ) =>
    authenticatedFetch<AdminProviderConfiguration>(
      "/admin/providers/configurations/" + encodeURIComponent(id),
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  createSellerApplication: (payload: SellerApplicationPayload) =>
    authenticatedFetch<SellerApplication>('/sellers/application', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSellerApplication: (payload: SellerApplicationPayload) =>
    authenticatedFetch<SellerApplication>('/sellers/application', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  submitSellerApplication: () =>
    authenticatedFetch<SellerApplication>('/sellers/application/submit', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getSellerApplication: () =>
    authenticatedFetch<SellerApplication>('/sellers/application'),

  getSellerApplicationDocuments: () =>
    authenticatedFetch<SellerApplicationDocument[]>(
      '/sellers/application/documents',
    ),

  uploadSellerApplicationDocument: (
    documentType: SellerApplicationDocumentType,
    file: File,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return authenticatedFetch<SellerApplicationDocument>(
      '/sellers/application/documents',
      { method: 'POST', body: form },
    );
  },

  getAdminSellerApplication: (applicationId: string) =>
    authenticatedFetch<SellerApplication>(
      `/sellers/applications/${encodeURIComponent(applicationId)}`,
    ),

  downloadSellerApplicationDocument: (applicationId: string, documentId: string) =>
    authenticatedBlobFetch(
      `/sellers/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/download`,
    ),

  reviewSellerApplicationDocument: (
    applicationId: string,
    documentId: string,
    payload: { decision: 'ACCEPTED' | 'REJECTED'; note?: string },
  ) =>
    authenticatedFetch<SellerApplicationDocument>(
      `/sellers/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/review`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    ),

  getSellerApplications: () =>
    authenticatedFetch<SellerApplication[]>('/sellers/applications'),

  reviewSellerApplication: (
    applicationId: string,
    payload: {
      decision: SellerApplicationReviewDecision;
      reviewNote?: string;
    },
  ) =>
    authenticatedFetch<SellerApplicationReviewResult>(
      `/sellers/applications/${encodeURIComponent(applicationId)}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),

  getSellerOrders: () =>
    authenticatedFetch<SellerOrder[]>('/sellers/orders'),
  getSellerProducts: () =>
    authenticatedFetch<SellerProduct[]>('/sellers/products'),

  getSellerProductMedia: (productId: string) =>
    authenticatedFetch<SellerProductMedia[]>(
      `/sellers/products/${encodeURIComponent(productId)}/media`,
    ),

  uploadSellerProductMedia: (productId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return authenticatedFetch<SellerProductMedia[]>(
      `/sellers/products/${encodeURIComponent(productId)}/media`,
      { method: 'POST', body: form },
    );
  },

  deleteSellerProductMedia: (productId: string, mediaId: string) =>
    authenticatedFetch<{ deleted: boolean; id: string }>(
      `/sellers/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`,
      { method: 'DELETE' },
    ),

  getSellerOrder: (orderId: string) =>
    authenticatedFetch<SellerOrderDetail>(
      `/sellers/orders/${encodeURIComponent(orderId)}`,
    ),
  getSellerFulfillment: (orderId: string) =>
    authenticatedFetch<SellerFulfillment>(
      `/marketplace/fulfillment/${encodeURIComponent(orderId)}`,
    ),
  getMarketplaceCustomerAddresses: () =>
    authenticatedFetch<MarketplaceCustomerAddress[]>(
      '/marketplace/customer-addresses',
    ),
  getMarketplaceSellerLocations: () =>
    authenticatedFetch<MarketplaceSellerLocation[]>('/sellers/locations'),
  checkFulfillmentServiceability: (orderId: string) =>
    authenticatedFetch<Record<string, unknown>>(
      '/marketplace/fulfillment/serviceability',
      { method: 'POST', body: JSON.stringify({ orderId }) },
    ),
  createSellerFulfillment: (input: {
    orderId: string;
    customerAddressId: string;
    sellerLocationId: string;
  }) =>
    authenticatedFetch<SellerFulfillment>('/marketplace/fulfillment', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getFulfillmentOffices: (orderId: string, radiusKm = 25) =>
    authenticatedFetch<LogisticsOffice[]>(
      `/marketplace/fulfillment/${encodeURIComponent(orderId)}/offices?radiusKm=${encodeURIComponent(String(radiusKm))}`,
    ),
  selectFulfillmentOffice: (orderId: string, providerOfficeId: string) =>
    authenticatedFetch<SellerFulfillment>(
      `/marketplace/fulfillment/${encodeURIComponent(orderId)}/office`,
      { method: 'POST', body: JSON.stringify({ providerOfficeId }) },
    ),
  bookSellerFulfillment: (orderId: string) =>
    authenticatedFetch<SellerFulfillment>(
      `/marketplace/fulfillment/${encodeURIComponent(orderId)}/book`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  getFulfillmentTracking: (orderId: string) =>
    authenticatedFetch<LogisticsTrackingEvent[]>(
      `/marketplace/fulfillment/${encodeURIComponent(orderId)}/tracking`,
    ),
  marketplaceProducts: () =>
    fetchJson<MarketplaceProduct[]>('/marketplace/products'),

  marketplaceProduct: (productId: string) =>
    fetchJson<MarketplaceProductDetail>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
    ),

  getSellerMembershipPrograms: () =>
    authenticatedFetch<SellerMembershipProgram[]>('/membership/programs'),

  getSellerApplicationEligibility: () =>
    authenticatedFetch<{ eligible: boolean }>(
      '/sellers/application/eligibility',
    ),

  acceptSellerMembershipTerms: (membershipProgramId: string) =>
    authenticatedFetch<unknown>('/membership/terms-acceptances', {
      method: 'POST',
      body: JSON.stringify({ membershipProgramId }),
    }),

  createSellerMembershipPayment: (payload: {
    membershipProgramId: string;
    billingPeriod: 'MONTHLY' | 'ANNUAL';
    idempotencyKey: string;
  }) =>
    authenticatedFetch<SellerMembershipPaymentIntent>('/payments/membership', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSellerMembershipPaymentStatus: (paymentId: string) =>
    authenticatedFetch<SellerMembershipPaymentStatus>(
      `/payments/membership/${encodeURIComponent(paymentId)}/status`,
    ),
  activateWholesalerUpgrade: () =>
    authenticatedFetch<{ active: boolean; sellerType: 'WHOLESALER' | 'DISTRIBUTOR' }>(
      '/sellers/upgrade/wholesaler/activate',
      { method: 'POST', body: JSON.stringify({}) },
    ),
  activateDistributorUpgrade: () =>
    authenticatedFetch<{ active: boolean; sellerType: 'DISTRIBUTOR' }>(
      '/sellers/upgrade/distributor/activate',
      { method: 'POST', body: JSON.stringify({}) },
    ),
  activateSellerMembership: () =>
    authenticatedFetch<{ active: boolean; sellerType: 'SELLER' }>(
      '/sellers/membership/seller/activate',
      { method: 'POST', body: JSON.stringify({}) },
    ),
  marketplaceCart: () =>
    authenticatedFetch<MarketplaceCart>('/marketplace/cart'),

  checkoutMarketplaceCart: (input: { customerAddressId: string }) =>
    authenticatedFetch<MarketplaceCheckoutOrder>(
      '/marketplace/cart/checkout',
      { method: 'POST', body: JSON.stringify(input) },
    ),

  getMarketplaceCustomerOrders: () =>
    authenticatedFetch<MarketplaceCustomerOrder[]>('/marketplace/cart/orders'),

  getMarketplaceOrderPaymentStatus: (orderId: string) =>
    authenticatedFetch<MarketplaceOrderPaymentStatus>(
      `/payments/marketplace-orders/${encodeURIComponent(orderId)}/status`,
    ),

  createMarketplacePaymentIntent: (orderId: string) =>
    authenticatedFetch<MarketplacePaymentIntent>(
      `/payments/marketplace-orders/${encodeURIComponent(orderId)}`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  addMarketplaceCartItem: (payload: {
    productId: string;
    variantId?: string;
    quantity: number;
  }) =>
    authenticatedFetch<MarketplaceCart>('/marketplace/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMarketplaceCartItem: (itemId: string, quantity: number) =>
    authenticatedFetch<MarketplaceCart>(
      `/marketplace/cart/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      },
    ),

  removeMarketplaceCartItem: (itemId: string) =>
    authenticatedFetch<{ removed: boolean; itemId: string }>(
      `/marketplace/cart/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    ),

  clearMarketplaceCart: () =>
    authenticatedFetch<{ cleared: boolean }>('/marketplace/cart/items', {
      method: 'DELETE',
    }),
  getTestPaymentSimulatorStatus: () =>
    authenticatedFetch<TestSimulatorStatus>('/payments/admin/testing/status'),

  getPendingSellerMembershipPayments: () =>
    authenticatedFetch<AdminPendingSellerMembershipPayment[]>(
      '/payments/admin/testing/pending-seller-memberships',
    ),

  simulateSellerMembershipPayment: (paymentId: string) =>
    authenticatedFetch<{
      status: string;
      paymentReference: string;
      simulated: boolean;
      alreadyProcessed: boolean;
    }>(`/payments/membership/${encodeURIComponent(paymentId)}/test-confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getAdminKycSimulatorStatus: () =>
    authenticatedFetch<TestSimulatorStatus>('/admin/testing/kyc/status'),

  getAdminKycVerifications: () =>
    authenticatedFetch<AdminKycVerification[]>('/admin/testing/kyc'),

  simulateAdminKycVerification: (
    verificationId: string,
    status: 'VERIFIED' | 'REJECTED' | 'MORE_INFORMATION_REQUIRED',
  ) =>
    authenticatedFetch<unknown>(
      `/admin/testing/kyc/${encodeURIComponent(verificationId)}/simulate`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
    ),

};
