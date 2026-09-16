export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly errors?: string[]) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = typeof window !== 'undefined' ? window.localStorage.getItem('vtu_access_token') : null;
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
  const body = (await response.json().catch(() => ({}))) as { message?: string; errors?: string[]; data?: T };
  if (!response.ok) throw new ApiError(response.status, body.message ?? 'Request failed', body.errors);
  return (body.data === undefined ? body : body.data) as T;
}

export const api = {
  login: (payload: { identifier: string; password: string }) => fetchJson<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload: { email?: string; phone?: string; password: string }) => fetchJson<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  logout: (refreshToken?: string) => fetchJson<{ loggedOut: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
};

export interface AuthUser { id: string; email?: string | null; phone?: string | null; roles: string[]; }
