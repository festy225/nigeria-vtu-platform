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
  | 'VENDOR'
  | 'WHOLESALER'
  | 'DISTRIBUTOR';

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
  hasVariants: boolean;
  priceMinor: number | null;
  currency: CurrencyCode | null;
}

export interface MarketplaceProductDetail extends MarketplaceProduct {
  variants: MarketplaceCatalogVariant[];
}

export interface MarketplaceCart {
  id: string | null;
  items: MarketplaceCartItem[];
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
      'Content-Type': 'application/json',
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

  createSellerApplication: (payload: {
    sellerType: SellerType;
    businessName: string;
    storeName: string;
    storeSlug?: string;
  }) =>
    authenticatedFetch<SellerApplication>('/sellers/application', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSellerApplication: () =>
    authenticatedFetch<SellerApplication>('/sellers/application'),

  getSellerApplications: () =>
    authenticatedFetch<SellerApplication[]>('/sellers/applications'),

  marketplaceProducts: () =>
    fetchJson<MarketplaceProduct[]>('/marketplace/products'),

  marketplaceProduct: (productId: string) =>
    fetchJson<MarketplaceProductDetail>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
    ),

  marketplaceCart: () =>
    authenticatedFetch<MarketplaceCart>('/marketplace/cart'),

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
};
