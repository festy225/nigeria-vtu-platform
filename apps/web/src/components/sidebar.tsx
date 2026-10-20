'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';

type NavigationLink = {
  label: string;
  href: string;
  marker: string;
  roles?: string[];
};

const customerLinks: NavigationLink[] = [
  { label: 'Dashboard', href: '/dashboard', marker: 'D' },
  { label: 'Services', href: '/dashboard/services', marker: 'S' },
  { label: 'Transactions', href: '/dashboard/transactions', marker: 'T' },
  { label: 'Wallet', href: '/dashboard/wallet', marker: 'W' },
  { label: 'Account', href: '/dashboard/account', marker: 'A' },
  {
    label: 'Seller workspace',
    href: '/dashboard/business/seller',
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
  {
    label: 'Feature configuration',
    href: '/dashboard/admin/features',
    marker: 'F',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'User management',
    href: '/dashboard/admin/users',
    marker: 'U',
    roles: ['SUPER_ADMIN'],
  },  {
    label: 'Seller applications',
    href: '/dashboard/admin/sellers',
    marker: 'S',
    roles: ['SUPER_ADMIN'],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN', 'SUPER_ADMIN');

  const visibleLinks = (isAdmin ? adminLinks : customerLinks).filter(
    (link) => !link.roles || hasRole(...link.roles),
  );

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 text-slate-700">
      <div className="px-2">
        <Brand />
        <p className="mt-3 text-xs font-medium text-slate-400">
          {isAdmin ? 'Platform administration' : 'Your CHIMZO account'}
        </p>
      </div>

      <div className="mt-9 px-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {isAdmin ? 'Management' : 'Workspace'}
        </p>
      </div>

      <nav className="mt-3 space-y-1" aria-label="Main navigation">
        {visibleLinks.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== '/dashboard' &&
              pathname.startsWith(`${link.href}/`));

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                active
                  ? 'bg-[#EAF2FF] text-[#08205B]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  active
                    ? 'bg-[#08205B] text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                }`}
              >
                {link.marker}
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {isAdmin ? 'Platform control' : 'Need help?'}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {isAdmin
              ? 'Manage the platform through your authorized workspace.'
              : 'Your CHIMZO services and account in one place.'}
          </p>
        </div>
        <p className="mt-4 px-2 text-[11px] font-medium text-slate-400">
          CHIMZO Platform
        </p>
      </div>
    </aside>
  );
}
