'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthStorage, readAuthStorage, writeAuthStorage, type AuthUser } from '@/lib/api';

type AuthContextValue = { user: AuthUser | null; isLoading: boolean; isAuthenticated: boolean; error: string | null; setSession: (session: { accessToken: string; refreshToken: string; user: AuthUser }) => void; logout: () => Promise<void>; refreshUser: () => Promise<void>; hasRole: (...roles: string[]) => boolean; };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null); const [isLoading, setIsLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let mounted = true; const bootstrap = async () => { const stored = readAuthStorage(); if (!stored) { if (mounted) setIsLoading(false); return; } try { const current = await api.me(); if (mounted) setUser(current); } catch { clearAuthStorage(); if (mounted) setError('Your session has expired. Please sign in again.'); } finally { if (mounted) setIsLoading(false); } }; void bootstrap(); return () => { mounted = false; }; }, []);
  const value = useMemo<AuthContextValue>(() => ({ user, isLoading, isAuthenticated: Boolean(user), error, setSession: (session) => { writeAuthStorage(session); setUser(session.user); setError(null); }, logout: async () => { const token = readAuthStorage()?.refreshToken; try { await api.logout(token); } finally { clearAuthStorage(); setUser(null); } }, refreshUser: async () => { const current = await api.me(); setUser(current); }, hasRole: (...roles) => Boolean(user?.roles.some((role) => roles.includes(role))) }), [error, isLoading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
