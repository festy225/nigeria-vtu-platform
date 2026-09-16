'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { LoadingState } from './ui/loading-state';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => { if (!isLoading && !isAuthenticated) router.replace('/login'); }, [isAuthenticated, isLoading, router]);
  if (isLoading || !isAuthenticated) return <LoadingState label="Preparing your workspace…" />;
  return <>{children}</>;
}
