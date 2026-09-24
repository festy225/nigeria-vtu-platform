'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';

const links = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: '⌂',
  },
  {
    label: 'Services',
    href: '/dashboard/services',
    icon: '◈',
    roles: ['CUSTOMER', 'AGENT', 'VENDOR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Transactions',
    href: '/dashboard/transactions',
    icon: '↔',
  },
  {
    label: 'Wallet',
    href: '/dashboard/wallet',
    icon: '₦',
  },
  {
    label: 'Account',
    href: '/dashboard/account',
    icon: '○',
  },
  {
    label: 'Admin workspace',
    href: '/dashboard/admin',
    icon: '◆',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasRole } = useAuth();

  const visibleLinks = links.filter(
    (link) => !link.roles || hasRole(...link.roles),
  );

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-200 bg-[#0B1220] px-4 py-6 text-white">
      {/* Brand */}
      <div className="px-2">
        <Brand />
      </div>

      {/* Workspace label */}
      <div className="mt-10 px-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Workspace
        </p>
      </div>

      {/* Navigation */}
      <nav
        className="mt-3 space-y-1"
        aria-label="Main navigation"
      >
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
              className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                active
                  ? 'bg-[#155EEF] text-white shadow-lg shadow-blue-950/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-base ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'bg-white/[0.03] text-slate-500 group-hover:text-slate-200'
                }`}
              >
                {link.icon}
              </span>

              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Support */}
      <div className="mt-auto">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#155EEF]/15 text-sm text-blue-300">
              ?
            </span>

            <p className="text-sm font-semibold text-white">
              Need help?
            </p>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-400">
            Our support team is available to help with your Naivex account.
          </p>

          <button
            type="button"
            className="mt-3 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
          >
            Contact support →
          </button>
        </div>

        <p className="mt-5 px-2 text-[11px] text-slate-600">
          Naivex Platform
        </p>
      </div>
    </aside>
  );
}