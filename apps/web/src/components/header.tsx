'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';
import { Sidebar } from './sidebar';

const dashboardDestinations = [
  { label: 'Dashboard', href: '/dashboard', hint: 'Overview and wallet summary' },
  { label: 'Airtime & Data', href: '/dashboard/services', hint: 'Browse available services' },
  { label: 'Electricity & TV', href: '/dashboard/services', hint: 'Services' },
  { label: 'Wallet & Payments', href: '/dashboard/wallet', hint: 'Balances and wallet activity' },
  { label: 'Marketplace', href: '/marketplace', hint: 'Discover products' },
  { label: 'Orders', href: '/marketplace/orders', hint: 'View your marketplace orders' },
  { label: 'Transactions', href: '/dashboard/transactions', hint: 'Review transaction history' },
  { label: 'My Account', href: '/dashboard/account', hint: 'Account settings' },
  { label: 'Admin overview', href: '/dashboard/admin', hint: 'Administration', admin: true },
  { label: 'Provider management', href: '/dashboard/admin/providers', hint: 'Administration', admin: true },
  { label: 'Feature configuration', href: '/dashboard/admin/features', hint: 'Administration', admin: true },
  { label: 'Seller applications', href: '/dashboard/admin/sellers', hint: 'Administration', admin: true },
];

export function Header() {
  const { user, logout, hasRole } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = hasRole('ADMIN', 'SUPER_ADMIN');
  const displayName = user?.email ?? user?.phone ?? 'Account';
  const role = user?.roles?.includes('SUPER_ADMIN')
    ? 'SUPER ADMIN'
    : user?.roles?.includes('ADMIN')
      ? 'ADMIN'
      : user?.roles?.[0] ?? 'CUSTOMER';
  const initial = displayName.charAt(0).toUpperCase();
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return dashboardDestinations
      .filter((item) => (!item.admin || isAdmin) && (item.label.toLowerCase().includes(term) || item.hint.toLowerCase().includes(term)))
      .filter((item, index, all) => all.findIndex((candidate) => candidate.href === item.href && candidate.label === item.label) === index)
      .slice(0, 6);
  }, [search, isAdmin]);

  return (
    <>
      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-3 lg:hidden">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50" aria-label="Open navigation">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Brand compact />
        </div>

        <div className="hidden shrink-0 lg:block">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Good to see you back</p>
        </div>

        <div className="relative ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <div className="relative hidden w-56 md:block lg:w-72">
            <label htmlFor="chimzo-global-search" className="sr-only">Search dashboard</label>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m16 16 4 4" /></svg>
            <input id="chimzo-global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your workspace..." autoComplete="off" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
            {search.trim() && (
              <div className="absolute right-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {results.length ? results.map((item) => (
                  <Link key={`${item.label}-${item.href}`} href={item.href} onClick={() => setSearch('')} className="block rounded-xl px-3 py-2.5 transition hover:bg-emerald-50">
                    <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{item.hint}</span>
                  </Link>
                )) : <p className="px-3 py-3 text-sm text-slate-500">No matching dashboard destinations.</p>}
              </div>
            )}
          </div>

          <div className="relative">
            <button type="button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications" aria-expanded={notificationsOpen} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            </button>
            {notificationsOpen && <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><p className="text-sm font-semibold text-slate-900">Notifications</p><p className="mt-2 text-sm leading-5 text-slate-500">You have no new notifications.</p></div>}
          </div>

          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-slate-50 sm:gap-3 sm:px-2 sm:py-2" aria-expanded={menuOpen} aria-label="Open account menu">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#073F35] text-sm font-bold text-white ring-2 ring-emerald-100">{initial}</span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-48 truncate text-sm font-semibold text-slate-900">{displayName}</span>
                <span className="mt-0.5 block text-[11px] font-semibold tracking-wide text-slate-500">{role}</span>
              </span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`hidden h-4 w-4 text-slate-400 transition sm:inline ${menuOpen ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5" /></svg>
            </button>
            {menuOpen && <div className="absolute right-0 top-14 z-40 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-3"><p className="text-xs font-medium text-slate-400">Signed in as</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{displayName}</p><p className="mt-1 text-xs text-slate-500">{role}</p></div>
              <Link href="/dashboard/account" onClick={() => setMenuOpen(false)} className="mt-1 block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">My account</Link>
              <button type="button" onClick={() => void logout()} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50">Sign out</button>
            </div>}
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 z-40 lg:hidden ${mobileNavOpen ? '' : 'pointer-events-none invisible'}`}>
        <button type="button" aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/60 backdrop-blur-sm" />
        <div className="relative h-full w-fit max-w-[85vw]"><Sidebar onNavigate={() => setMobileNavOpen(false)} /></div>
      </div>
    </>
  );
}
