'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '@/lib/api';
import { api } from '@/lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setSession: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const raw = window.localStorage.getItem('vtu_user');
    if (raw) {
      try { setUser(JSON.parse(raw) as AuthUser); } catch { window.localStorage.removeItem('vtu_user'); }
    }
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: Boolean(user && window.localStorage.getItem('vtu_access_token')),
    setSession: (accessToken, refreshToken, nextUser) => {
      window.localStorage.setItem('vtu_access_token', accessToken);
      window.localStorage.setItem('vtu_refresh_token', refreshToken);
      window.localStorage.setItem('vtu_user', JSON.stringify(nextUser));
      setUser(nextUser);
    },
    logout: async () => {
      const refreshToken = window.localStorage.getItem('vtu_refresh_token') ?? undefined;
      try { await api.logout(refreshToken); } finally {
        window.localStorage.removeItem('vtu_access_token');
        window.localStorage.removeItem('vtu_refresh_token');
        window.localStorage.removeItem('vtu_user');
        setUser(null);
      }
    }
  }), [isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
