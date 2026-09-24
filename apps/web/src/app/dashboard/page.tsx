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
import { ErrorState, LoadingState } from '@/components/ui/loading-state';

function money(value: number | string, currency: 'NGN' | 'USD') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value) / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function transactionTone(
  entry: WalletStatementRecord['entry_type'],
) {
  return entry === 'CREDIT' ? 'success' : 'neutral';
}

export default function DashboardPage() {
  const [wallets, setWallets] = useState<WalletApiRecord[]>([]);
  const [statement, setStatement] = useState<WalletStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [walletResponse, statementResponse] = await Promise.all([
          api.wallets(),
          api.walletStatement(),
        ]);

        if (!active) return;

        setWallets(walletResponse);
        setStatement(statementResponse);
      } catch (caught) {
        if (!active) return;

        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Unable to load your financial activity.',
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const recentTransactions = useMemo(
    () => statement.slice(0, 5),
    [statement],
  );

  const transactionCount = statement.length;

  const nairaWallet = wallets.find(
    (wallet) => wallet.currency === 'NGN',
  );

  const dollarWallet = wallets.find(
    (wallet) => wallet.currency === 'USD',
  );

  if (loading) {
    return <LoadingState label="Loading your wallet and activity…" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">
            Overview
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Your dashboard
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Manage your wallet, payments, digital services and
            marketplace activity from one place.
          </p>
        </div>

        <Link
          href="/dashboard/services"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#155EEF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700"
        >
          Buy a service
          <span>→</span>
        </Link>
      </section>

      {/* Wallet cards */}
      {wallets.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">
              ₦
            </div>

            <h2 className="mt-4 font-semibold text-slate-900">
              No wallets available
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Your wallet accounts have not been set up yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Main balance */}
          <div className="rounded-2xl bg-[#0B1220] p-6 text-white shadow-xl lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Available Naira balance
                </p>

                <p className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                  {nairaWallet
                    ? money(
                        nairaWallet.available_minor,
                        'NGN',
                      )
                    : '₦0.00'}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-lg">
                ₦
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard/wallet"
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Fund wallet
              </Link>

              <Link
                href="/dashboard/transactions"
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View transactions
              </Link>
            </div>
          </div>

          {/* Secondary wallets */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Naira wallet
                  </p>

                  <p className="mt-3 text-xl font-bold text-slate-900">
                    {nairaWallet
                      ? money(
                          nairaWallet.available_minor,
                          'NGN',
                        )
                      : '₦0.00'}
                  </p>
                </div>

                <Badge
                  tone={
                    nairaWallet?.status === 'ACTIVE'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {nairaWallet?.status ?? 'UNAVAILABLE'}
                </Badge>
              </div>

              {nairaWallet && (
                <p className="mt-3 text-xs text-slate-400">
                  Held: {money(nairaWallet.held_minor, 'NGN')}
                </p>
              )}
            </Card>

            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Dollar wallet
                  </p>

                  <p className="mt-3 text-xl font-bold text-slate-900">
                    {dollarWallet
                      ? money(
                          dollarWallet.available_minor,
                          'USD',
                        )
                      : '$0.00'}
                  </p>
                </div>

                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                  $
                </span>
              </div>

              <p className="mt-3 text-xs text-slate-400">
                {dollarWallet
                  ? `Status: ${dollarWallet.status}`
                  : 'Dollar wallet not available'}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Quick actions
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Access your most-used Naivex services.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/services"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-[#155EEF]">
              ◈
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              Buy airtime & data
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Recharge your line or buy data bundles.
            </p>

            <span className="mt-4 block text-xs font-semibold text-[#155EEF]">
              Open services →
            </span>
          </Link>

          <Link
            href="/dashboard/wallet"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-600">
              ₦
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              Fund wallet
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Add funds to your Naivex wallet.
            </p>

            <span className="mt-4 block text-xs font-semibold text-[#155EEF]">
              Manage wallet →
            </span>
          </Link>

          <Link
            href="/dashboard/transactions"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-lg text-violet-600">
              ↔
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              Transactions
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Review your wallet activity and history.
            </p>

            <span className="mt-4 block text-xs font-semibold text-[#155EEF]">
              View history →
            </span>
          </Link>

          <Link
            href="/dashboard/services"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-lg text-amber-600">
              ◆
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              Marketplace
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Shop products from Naivex marketplace sellers.
            </p>

            <span className="mt-4 block text-xs font-semibold text-[#155EEF]">
              Explore marketplace →
            </span>
          </Link>
        </div>
      </section>

      {/* Activity + wallet information */}
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900">
                Recent activity
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {transactionCount} recorded wallet{' '}
                {transactionCount === 1
                  ? 'transaction'
                  : 'transactions'}
              </p>
            </div>

            <Link
              href="/dashboard/transactions"
              className="text-xs font-semibold text-[#155EEF] hover:text-blue-700"
            >
              View all →
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                ↔
              </div>

              <p className="mt-4 text-sm font-medium text-slate-700">
                No transactions yet
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Your wallet activity will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-100">
              {recentTransactions.map((item) => (
                <div
                  key={`${item.reference}-${item.created_at}`}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {item.description || item.operation}
                    </p>

                    <p className="mt-1 truncate text-xs text-slate-400">
                      {item.reference} · {date(item.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span
                      className={`text-sm font-bold ${
                        item.entry_type === 'CREDIT'
                          ? 'text-emerald-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {item.entry_type === 'CREDIT' ? '+' : '-'}
                      {money(
                        item.amount_minor,
                        item.currency,
                      )}
                    </span>

                    <Badge tone={transactionTone(item.entry_type)}>
                      {item.entry_type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">
                Wallet information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Your current wallet accounts.
              </p>
            </div>

            <Link
              href="/dashboard/wallet"
              className="text-xs font-semibold text-[#155EEF]"
            >
              Manage →
            </Link>
          </div>

          <div className="mt-5 space-y-1">
            {wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                    {wallet.currency === 'NGN' ? '₦' : '$'}
                  </span>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {wallet.currency === 'NGN'
                        ? 'Naira'
                        : 'Dollar'}{' '}
                      wallet
                    </p>

                    <p className="mt-0.5 text-xs text-slate-400">
                      Status: {wallet.status}
                    </p>
                  </div>
                </div>

                <span className="text-sm font-bold text-slate-900">
                  {money(
                    wallet.available_minor,
                    wallet.currency,
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}