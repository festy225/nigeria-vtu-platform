'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type WalletApiRecord,
  type WalletStatementRecord,
} from '@/lib/api';
import { Badge, Card } from '@/components/ui/primitives';
import { LoadingState } from '@/components/ui/loading-state';

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value) / 100);
}

function date(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function transactionTone(entry: WalletStatementRecord['entry_type']) {
  return entry === 'CREDIT' ? 'success' : 'neutral';
}

const quickActions = [
  {
    icon: 'phone',
    title: 'Airtime & Data',
    description: 'Recharge your line or buy a data bundle.',
    href: '/dashboard/services',
    color: 'bg-blue-50 text-blue-700',
  },
  {
    icon: 'zap',
    title: 'Electricity & TV',
    description: 'Explore available utility and TV services.',
    href: '/dashboard/services',
    color: 'bg-amber-50 text-amber-700',
  },
  {
    icon: 'ticket',
    title: 'Airtime PIN / Voucher',
    description: 'Access available PIN and voucher services.',
    href: '/dashboard/services',
    color: 'bg-violet-50 text-violet-700',
  },
  {
    icon: 'bag',
    title: 'Marketplace',
    description: 'Discover products offered by marketplace sellers.',
    href: '/marketplace',
    color: 'bg-emerald-50 text-emerald-700',
  },
  {
    icon: 'store',
    title: 'Become a Seller',
    description: 'Start your seller registration and set up your CHIMZO store.',
    href: '/dashboard/business/seller',
    color: 'bg-emerald-50 text-emerald-700',
  },
  {
    icon: 'building',
    title: 'CAC Registration',
    description: 'Explore business name and company registration services.',
    href: '/dashboard/cac-registration',
    color: 'bg-teal-50 text-teal-700',
  },
];

export default function DashboardPage() {
  const [wallets, setWallets] = useState<WalletApiRecord[]>([]);
  const [statement, setStatement] = useState<WalletStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setWalletError(null);
      setStatementError(null);

      try {
        const [walletResult, statementResult] = await Promise.allSettled([
          api.wallets(),
          api.walletStatement(),
        ]);

        if (!active) return;

        if (walletResult.status === 'fulfilled') {
          setWallets(walletResult.value);
        } else {
          setWalletError(
            walletResult.reason instanceof ApiError
              ? walletResult.reason.message
              : 'Your wallets are temporarily unavailable.',
          );
        }

        if (statementResult.status === 'fulfilled') {
          setStatement(statementResult.value);
        } else {
          setStatementError(
            statementResult.reason instanceof ApiError
              ? statementResult.reason.message
              : 'Your transaction history is temporarily unavailable.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const recentTransactions = useMemo(() => statement.slice(0, 5), [statement]);
  const nairaWallet = wallets.find((wallet) => wallet.currency === 'NGN');
  const dollarWallet = wallets.find((wallet) => wallet.currency === 'USD');

  if (loading) return <LoadingState label="Loading your wallet and activity..." />;

  return (
    <div className="space-y-8 pb-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            Customer overview
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Your dashboard
          </h1>
          <p data-chimzo-current-date="true" className="mt-2 text-sm text-slate-500">
            {/* CHIMZO_CURRENT_DATE */}
            {new Intl.DateTimeFormat('en-NG', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'Africa/Lagos',
            }).format(new Date())}
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Manage your wallet, payments, digital services and marketplace
            activity from one place.
          </p>
        </div>
        <Link
          href="/dashboard/services"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#073F35] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A5547] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Buy a service <span aria-hidden="true">-&gt;</span>
        </Link>
      </section>

      {walletError && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Wallet information could not be loaded. Your other dashboard features remain available. {walletError}
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#073F35] via-[#075344] to-[#08745D] p-6 text-white shadow-lg sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-100">
                Available Naira balance
              </p>
              <p className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {nairaWallet ? money(nairaWallet.available_minor, 'NGN') : 'Not available'}
              </p>
              {nairaWallet && (
                <p className="mt-2 text-xs text-emerald-100">
                  Held: {money(nairaWallet.held_minor, 'NGN')}
                </p>
              )}
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold">
              NGN
            </span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard/wallet"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#073F35] transition hover:bg-emerald-50"
            >
              Fund wallet
            </Link>
            <Link
              href="/dashboard/transactions"
              className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View statement
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            { label: 'Naira wallet', currency: 'NGN', wallet: nairaWallet },
            { label: 'Dollar wallet', currency: 'USD', wallet: dollarWallet },

          ].map((item) => (
            <Card key={item.currency}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {item.wallet
                      ? money(item.wallet.available_minor, item.currency)
                      : 'Not available'}
                  </p>
                </div>
                {item.wallet ? (
                  <Badge tone={item.wallet.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {item.wallet.status}
                  </Badge>
                ) : (
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">
                    Unavailable
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Popular services</h2>
          <p className="mt-1 text-sm text-slate-500">
            Get to your most-used CHIMZO services quickly.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${item.color}`}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  {item.icon === 'phone' && (
                    <>
                      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
                      <path d="M10 18.5h4" />
                    </>
                  )}
                  {item.icon === 'zap' && (
                    <path d="M13 2 4.5 13h6l-.5 9L19.5 11h-6L13 2Z" />
                  )}
                  {item.icon === 'ticket' && (
                    <>
                      <path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2Z" />
                      <path d="M13 5v2m0 4v2m0 4v2" />
                    </>
                  )}
                  {item.icon === 'bag' && (
                    <>
                      <path d="M5 8h14l1 13H4L5 8Z" />
                      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                    </>
                  )}
                                  {item.icon === 'building' && (
                    <>
                      <path d="M3 21h18" />
                      <path d="M5 21V7l7-4 7 4v14" />
                      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" />
                    </>
                  )}</svg>
              </span>
              <h3 className="mt-4 text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
                {item.description}
              </p>
              <span className="mt-4 inline-flex text-xs font-bold text-emerald-700 group-hover:text-emerald-800">
                Explore <span className="ml-1" aria-hidden="true">-&gt;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Recent transactions</h2>
              <p className="mt-1 text-sm text-slate-500">
                {statement.length} recorded wallet {statement.length === 1 ? 'transaction' : 'transactions'}
              </p>
            </div>
            <Link
              href="/dashboard/transactions"
              className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              View all <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>

          {statementError ? (
            <div role="status" className="py-8 text-sm text-amber-800">
              Transaction history is temporarily unavailable. Please try again later.
              <p className="mt-1 text-xs text-amber-700">{statementError}</p>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-500">
                TX
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-700">No transactions yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Your recorded wallet activity will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {recentTransactions.map((item) => (
                <div
                  key={`${item.reference}-${item.created_at}`}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {item.description || item.operation}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.reference} | {date(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <span className={`text-sm font-bold ${item.entry_type === 'CREDIT' ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {item.entry_type === 'CREDIT' ? '+' : '-'}
                      {money(item.amount_minor, item.currency)}
                    </span>
                    <Badge tone={transactionTone(item.entry_type)}>{item.entry_type}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
              More with CHIMZO
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Refer &amp; grow together</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Invite others to CHIMZO and explore your referral opportunities.</p>
            <Link href="/dashboard/referrals"
              className="mt-4 inline-flex rounded-xl bg-[#073F35] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0A5547]"
            >
              View referrals
            </Link>
          </div>

          <Card>
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                ?
              </span>
              <div>
                <h2 className="font-bold text-slate-900">Need help?</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Manage your account and explore available CHIMZO services.
                </p>
                <Link
                  href="/dashboard/account"
                  className="mt-3 inline-flex text-sm font-bold text-emerald-700 hover:text-emerald-800"
                >
                  Account settings <span className="ml-1" aria-hidden="true">-&gt;</span>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
