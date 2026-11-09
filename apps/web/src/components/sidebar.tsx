'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';


function NavigationIcon({ label }: { label: string }) {
  const paths: Record<string, React.ReactNode> = {
    Dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    'Airtime & Data': <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10 5.5h4M11 18.5h2" /></>,
    'Electricity & TV': <><path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z" /></>,
    'Airtime PIN / Voucher': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h.01M7 15h.01M11 9h6M11 15h6" /></>,
    'Wallet & Payments': <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h2" /><path d="M6 5V3h12v2" /></>,
    Marketplace: <><path d="M3 9h18l-1.5-6h-15L3 9Z" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></>,
    Orders: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    Transactions: <><path d="M4 7h15l-3-3M20 17H5l3 3" /><path d="M19 7v4M5 17v-4" /></>,
    'My Account': <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 0 0 1 16 0" /></>,
    Settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
    'My Referrals': <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 15a4 4 0 0 1 5 4v1" /></>,
    Support: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1 1-1.7 1.2-1.7 2.7M12 17h.01" /></>,
    'Seller workspace': <><path d="M3 10 12 3l9 7v10H3V10Z" /><path d="M9 20v-6h6v6" /></>,
    'Seller orders': <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></>,
    Finance: <><path d="M3 9h18L12 3 3 9Z" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M2 18h20" /></>,
    'Admin overview': <><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></>,
    'Provider management': <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.8-.7a8 8 0 0 1-1.7 1l-.3 1.9h-3l-.3-1.9a8 8 0 0 1-1.7-1l-1.8.7-1.5-2.6 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.8.7a8 8 0 0 1 1.7-1l.3-1.9h3l.3 1.9a8 8 0 0 1 1.7 1l1.8-.7 1.5 2.6-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.05)" /></>,
    'Feature configuration': <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="5" /></>,
    'User management': <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1" /></>,
    'Seller applications': <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      {paths[label] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
type NavigationLink = {
  label: string;
  href: string;
  marker: string;
  roles?: string[];
};

const customerLinks: NavigationLink[] = [
  { label: 'Dashboard', href: '/dashboard', marker: 'D' },
  { label: 'Airtime & Data', href: '/dashboard/services', marker: 'S' },
  { label: 'Electricity & TV', href: '/dashboard/services', marker: 'E' },
  { label: 'Airtime PIN / Voucher', href: '/dashboard/services', marker: 'V' },
  { label: 'Wallet & Payments', href: '/dashboard/wallet', marker: 'W' },
  { label: 'Marketplace', href: '/marketplace', marker: 'M' },
  { label: 'Become a Seller', href: '/dashboard/business/seller', marker: 'B' },
  { label: 'Orders', href: '/marketplace/orders', marker: 'O' },
  { label: 'Transactions', href: '/dashboard/transactions', marker: 'T' },
  { label: 'My Account', href: '/dashboard/account', marker: 'A' },
  { label: 'Settings', href: '/dashboard/settings', marker: 'S' },
  { label: 'My Referrals', href: '/dashboard/referrals', marker: 'R' },
  { label: 'Support', href: '/dashboard/support', marker: '?' },
  {
    label: 'Seller Dashboard',
    href: '/dashboard/business/seller/dashboard',
    marker: 'B',
    roles: ['SELLER', 'WHOLESALER', 'DISTRIBUTOR', 'VENDOR'],
  },
  {
    label: 'Seller orders',
    href: '/dashboard/business/seller/orders',
    marker: 'O',
    roles: ['SELLER', 'WHOLESALER', 'DISTRIBUTOR', 'VENDOR'],
  },
];

const adminLinks: NavigationLink[] = [
  { label: 'Finance', href: '/dashboard/admin/finance', marker: 'F', roles: ['SUPER_ADMIN'] },
  { label: 'Admin overview', href: '/dashboard/admin', marker: 'O' },
  { label: 'Provider management', href: '/dashboard/admin/providers', marker: 'P' },
  { label: 'Feature configuration', href: '/dashboard/admin/features', marker: 'F', roles: ['SUPER_ADMIN'] },
  { label: 'User management', href: '/dashboard/admin/users', marker: 'U', roles: ['SUPER_ADMIN'] },
  { label: 'Seller applications', href: '/dashboard/admin/sellers', marker: 'S', roles: ['SUPER_ADMIN'] },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN', 'SUPER_ADMIN');
  const isSeller = hasRole('SELLER', 'WHOLESALER', 'DISTRIBUTOR', 'VENDOR');
  const visibleLinks = (isAdmin ? adminLinks : customerLinks).filter(
    (link) =>
      (!link.roles || hasRole(...link.roles)) &&
      (link.label !== 'Become a Seller' || !isSeller),
  );

  if (pathname.startsWith('/dashboard/business/seller/dashboard')) {
    return null;
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto bg-[#073F35] px-4 py-6 text-white shadow-xl">
      <div className="rounded-2xl px-2 py-1">
        <div className="rounded-xl bg-white px-3 py-3 [&_*]:text-[#073F35]">
          <Brand />
        </div>
        <p className="mt-3 px-1 text-xs font-medium text-emerald-100/75">
          {isAdmin ? 'Platform administration' : 'Your CHIMZO account'}
        </p>
      </div>

      <div className="mt-8 px-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">
          {isAdmin ? 'Management' : 'Workspace'}
        </p>
      </div>

      <nav className="mt-3 space-y-1" aria-label="Main navigation">
        {visibleLinks.map((link) => {
          const active = (pathname === link.href ||
            (link.href !== '/dashboard' && pathname.startsWith(`${link.href}/`))) &&
            (link.href !== '/dashboard/services' || link.label === 'Airtime & Data');
          return (
            <Link
              key={`${link.label}-${link.href}`}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-white text-[#073F35] shadow-sm'
                  : 'text-emerald-50/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                active ? 'bg-[#00D4A3] text-[#073F35]' : 'bg-white/10 text-emerald-50 group-hover:bg-white/15'
              }`}>
                <NavigationIcon label={link.label} />
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        {!isAdmin && (
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-sm font-semibold text-white">More with CHIMZO</p>
            <p className="mt-1 text-xs leading-5 text-emerald-50/75">Explore services and discover products in the marketplace.</p>
            <Link href="/marketplace" onClick={onNavigate} className="mt-3 inline-flex rounded-lg bg-[#00D4A3] px-3 py-2 text-xs font-bold text-[#073F35] transition hover:bg-emerald-300">
              Explore marketplace
            </Link>
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <p className="text-sm font-semibold text-white">{isAdmin ? 'Platform control' : 'Need help?'}</p>
          <p className="mt-2 text-xs leading-5 text-emerald-50/70">
            {isAdmin ? 'Manage the platform through your authorized workspace.' : 'Your CHIMZO services and account in one place.'}
          </p>
        </div>
        <p className="mt-4 px-2 text-[11px] font-medium text-emerald-100/55">CHIMZO Platform</p>
      </div>
    </aside>
  );
}
