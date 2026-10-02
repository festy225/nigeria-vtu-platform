'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { Card } from '@/components/ui/primitives';
import { useAuth } from '@/components/providers/auth-provider';

function AdminWorkspace() {
  const { hasRole } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          Admin workspace
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Backend authorization controls access to this area.
        </p>
      </div>

      {hasRole('SUPER_ADMIN') && (
        <Link
          href="/dashboard/admin/sellers"
          className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <Card className="transition hover:border-brand-500/50">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-white">
                  Seller applications
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  View submitted seller profiles and their current statuses.
                </p>
              </div>
              <span className="text-sm font-semibold text-brand-300">
                Open applications →
              </span>
            </div>
          </Card>
        </Link>
      )}

      <Card>
        <h2 className="font-semibold text-white">Permission boundary active</h2>
        <p className="mt-2 text-sm text-slate-400">
          This placeholder confirms the frontend role gate. Every sensitive
          operation must also be protected by backend guards.
        </p>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
      <AdminWorkspace />
    </ProtectedRoute>
  );
}
