'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

export default function AccountPage() {
  const { user, isLoading } = useAuth();

  const roles = user?.roles?.length
    ? user.roles.map((role) => role.replace(/_/g, ' ')).join(', ')
    : 'CUSTOMER';

  return (
    <div className="space-y-6 pb-8">
      <header>
        <p className="text-sm font-semibold text-emerald-700">Settings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          My account
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          View your CHIMZO account details and access your available services.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading your account details…
        </div>
      ) : !user ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">
            Account details unavailable
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            We could not load your signed-in account details. Please sign in
            again and reopen this page.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 bg-emerald-900 p-6 text-white sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold">
                {(user.email || user.phone || 'C').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-emerald-100">Your CHIMZO account</p>
                <h2 className="mt-1 break-words text-xl font-bold">
                  {user.email || user.phone || 'CHIMZO customer'}
                </h2>
                <p className="mt-1 text-sm text-emerald-100">
                  Account role: {roles}
                </p>
              </div>
              <span className="w-fit rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
                Signed in
              </span>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Detail label="Email address" value={user.email || 'Not provided'} />
              <Detail label="Phone number" value={user.phone || 'Not provided'} />
              <Detail label="Account ID" value={user.id} />
              <Detail label="Account role" value={roles} />
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Account and services
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Shortcuts to the main areas of your CHIMZO workspace.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href="/dashboard"
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-800">
                  ◫
                </span>
                <h3 className="mt-4 font-bold text-slate-900">
                  Customer dashboard
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Return to your wallet overview, popular services and recent
                  transactions.
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-emerald-700 group-hover:text-emerald-900">
                  Open dashboard →
                </span>
              </Link>

              <Link
                href="/marketplace"
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-800">
                  ◈
                </span>
                <h3 className="mt-4 font-bold text-slate-900">
                  CHIMZO marketplace
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Browse products available in the marketplace.
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-emerald-700 group-hover:text-emerald-900">
                  Explore marketplace →
                </span>
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="font-bold text-slate-900">Profile and security</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your account details above are read-only in this version. Profile
              editing and authenticated password changes will be added only
              when their supported backend workflows are confirmed.
            </p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Keep your account secure
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Never share your password or authentication codes with anyone.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
