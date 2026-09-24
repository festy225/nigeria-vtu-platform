'use client';

import { useState } from 'react';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';
import { Sidebar } from './sidebar';

export function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const displayName = user?.email ?? user?.phone ?? 'Account';
  const role = user?.roles?.[0] ?? 'CUSTOMER';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
        {/* Mobile menu */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Open navigation"
          >
            ☰
          </button>

          <Brand compact />
        </div>

        {/* Desktop workspace information */}
        <div className="hidden lg:block">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
            Workspace
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            Good to see you back
          </p>
        </div>

        {/* Right side */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
            aria-expanded={menuOpen}
          >
            {/* Avatar */}
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#155EEF] text-sm font-bold text-white">
              {initial}
            </span>

            {/* Account details */}
            <span className="hidden text-left sm:block">
              <span className="block max-w-48 truncate text-sm font-semibold text-slate-900">
                {displayName}
              </span>

              <span className="mt-0.5 block text-xs font-medium text-slate-400">
                {role}
              </span>
            </span>

            <span
              className={`text-sm text-slate-400 transition ${
                menuOpen ? 'rotate-180' : ''
              }`}
            >
              ⌄
            </span>
          </button>

          {/* Account menu */}
          {menuOpen && (
            <div className="absolute right-0 top-14 z-30 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="text-xs font-medium text-slate-400">
                  Signed in as
                </p>

                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {displayName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void logout()}
                className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile navigation */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${
          mobileNavOpen
            ? ''
            : 'pointer-events-none invisible'
        }`}
      >
        <div
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />

        <div className="relative h-full">
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </div>
      </div>
    </>
  );
}