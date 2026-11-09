'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, type SellerApplication } from '@/lib/api';

type WorkspaceState = {
  application: SellerApplication | null;
  loading: boolean;
  error: string;
};

type WorkspaceNavigationItem = {
  label: string;
  href: string;
  icon?: 'store';
};

const WorkspaceContext = createContext<WorkspaceState>({
  application: null,
  loading: true,
  error: '',
});

export function useSellerWorkspace() {
  return useContext(WorkspaceContext);
}

const navigation: WorkspaceNavigationItem[] = [
  { label: 'Overview', href: '/dashboard/business/seller/dashboard' },
  { label: 'Inventory', href: '/dashboard/business/seller/dashboard/inventory' },
  { label: 'Customers', href: '/dashboard/business/seller/dashboard/customers' },
  { label: 'Sales & Analytics', href: '/dashboard/business/seller/dashboard/analytics' },
  { label: 'Earnings', href: '/dashboard/business/seller/dashboard/earnings' },
  { label: 'Payouts', href: '/dashboard/business/seller/dashboard/payouts' },
  { label: 'Promotions', href: '/dashboard/business/seller/dashboard/promotions' },
  { label: 'Verification', href: '/dashboard/business/seller/dashboard/verification' },
  { label: 'KYC / Business Information', href: '/dashboard/business/seller/dashboard/information' },
  { label: 'Become a Wholesaler', href: '/dashboard/business/seller/dashboard/wholesaler', icon: 'store' },
  { label: 'Become a Distributor', href: '/dashboard/business/seller/dashboard/distributor', icon: 'store' },
  { label: 'Support', href: '/dashboard/business/seller/dashboard/support' },
  { label: 'Settings', href: '/dashboard/business/seller/dashboard/settings' },
];

export function SellerWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    application: null,
    loading: true,
    error: '',
  });
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    let active = true;

    api.getSellerApplication().then(
      (application) => {
        if (active) setWorkspace({ application, loading: false, error: '' });
      },
      (error: unknown) => {
        if (!active) return;
        setWorkspace({
          application: null,
          loading: false,
          error:
            (error as { status?: number })?.status === 404
              ? 'No seller application was found for this account.'
              : error instanceof Error
                ? error.message
                : 'Unable to load your seller application.',
        });
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const approved =
    workspace.application?.onboarding_status === 'APPROVED' &&
    workspace.application?.kyc_status === 'VERIFIED';

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="-mx-4 -my-4 min-h-[calc(100vh-5rem)] bg-[#F4F7FB] text-slate-800 sm:-mx-6 sm:-my-6 lg:-mx-8 lg:-my-8">
        <div className="mx-auto max-w-[1600px] lg:flex">
          <aside className="hidden min-h-[calc(100vh-5rem)] w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
            <div className="px-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2F80ED]">
                CHIMZO Business
              </p>
              <p className="mt-1 text-lg font-bold text-[#08205B]">Seller workspace</p>
            </div>
            <nav className="mt-6 space-y-1" aria-label="Seller workspace navigation">
              {navigation.map((item) => {
                if (
                  item.href.endsWith('/distributor') &&
                  workspace.application?.seller_type !== 'WHOLESALER' &&
                  workspace.application?.seller_type !== 'DISTRIBUTOR'
                ) return null;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'border-[#00D4A3] bg-[#F0FBF8] text-[#08205B]'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-[#08205B]'
                    }`}
                  >
                    {item.icon === 'store' && <WholesalerIcon />}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <Link
                href="/dashboard/business/seller/orders"
                className={`block rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition ${
                  pathname === '/dashboard/business/seller/orders'
                    ? 'border-[#00D4A3] bg-[#F0FBF8] text-[#08205B]'
                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-[#08205B]'
                }`}
              >
                Orders
              </Link>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#08205B]">
                    {workspace.application?.store_name ?? 'Seller workspace'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <StatusBadge label="Seller approved" active={workspace.application?.onboarding_status === 'APPROVED'} />
                    <StatusBadge label="KYC verified" active={workspace.application?.kyc_status === 'VERIFIED'} />
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={mobileNavigationOpen}
                  aria-controls="seller-mobile-navigation"
                  onClick={() => setMobileNavigationOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-[#08205B] lg:hidden"
                >
                  <span aria-hidden="true">☰</span>
                  Sections
                </button>
              </div>
              {mobileNavigationOpen && (
                <nav
                  id="seller-mobile-navigation"
                  aria-label="Seller workspace navigation"
                  className="mt-4 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3 sm:grid-cols-3"
                >
                  {[...navigation, { label: 'Orders', href: '/dashboard/business/seller/orders' }].map((item) => {
                    if (
                      item.href.endsWith('/distributor') &&
                      workspace.application?.seller_type !== 'WHOLESALER' &&
                      workspace.application?.seller_type !== 'DISTRIBUTOR'
                    ) return null;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setMobileNavigationOpen(false)}
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          active ? 'bg-[#F0FBF8] text-[#08205B]' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {item.icon === 'store' && <WholesalerIcon />}
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>

            <div className="p-4 sm:p-6 lg:p-8">
              {workspace.loading ? (
                <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
                  Loading seller workspace...
                </div>
              ) : workspace.error || !workspace.application ? (
                <section className="rounded-lg border border-red-200 bg-white p-6" role="alert">
                  <h1 className="text-xl font-bold text-[#08205B]">Seller workspace unavailable</h1>
                  <p className="mt-2 text-sm text-slate-600">{workspace.error || 'Your seller application could not be loaded.'}</p>
                  <Link href="/dashboard/business/seller" className="mt-5 inline-flex rounded-md bg-[#08205B] px-4 py-2.5 text-sm font-semibold text-white">
                    View seller application
                  </Link>
                </section>
              ) : !approved ? (
                <section className="rounded-lg border border-amber-200 bg-white p-6">
                  <h1 className="text-xl font-bold text-[#08205B]">Seller access is not yet approved</h1>
                  <p className="mt-2 text-sm text-slate-600">The workspace requires an approved seller application and verified KYC.</p>
                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">Application status</dt><dd className="mt-1 font-semibold">{workspace.application.onboarding_status.replaceAll('_', ' ')}</dd></div>
                    <div><dt className="text-xs text-slate-500">KYC status</dt><dd className="mt-1 font-semibold">{workspace.application.kyc_status.replaceAll('_', ' ')}</dd></div>
                  </dl>
                  <Link href="/dashboard/business/seller" className="mt-5 inline-flex rounded-md bg-[#08205B] px-4 py-2.5 text-sm font-semibold text-white">
                    View application details
                  </Link>
                </section>
              ) : children}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function WholesalerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-2 h-4 w-4 shrink-0"
    >
      <path d="M3 10 12 3l9 7v10H3V10Z" />
      <path d="M7 13h10M7 16h10" />
    </svg>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {label}
    </span>
  );
}

export function SellerMetricCard({
  label,
  value,
  description,
  tone = 'navy',
}: {
  label: string;
  value: string | number;
  description: string;
  tone?: 'navy' | 'blue' | 'amber' | 'teal';
}) {
  const valueColors = {
    navy: 'text-[#08205B]',
    blue: 'text-[#2F80ED]',
    amber: 'text-amber-700',
    teal: 'text-emerald-700',
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-3 break-words text-2xl font-bold ${valueColors[tone]}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </article>
  );
}