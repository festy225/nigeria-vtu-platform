'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { LoadingState } from './ui/loading-state';

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const router = useRouter(); const { isAuthenticated, isLoading, hasRole } = useAuth();
  useEffect(() => { if (!isLoading && !isAuthenticated) router.replace('/login'); else if (!isLoading && roles?.length && !hasRole(...roles)) router.replace('/dashboard'); }, [hasRole, isAuthenticated, isLoading, roles, router]);
  if (isLoading || !isAuthenticated || (roles?.length && !hasRole(...roles))) return <LoadingState label="Preparing your workspace…" />;
  return <>{children}</>;
}
