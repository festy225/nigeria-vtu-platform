'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api,
  ApiError,
  type WalletApiRecord,
  type WalletStatementRecord,
} from '@/lib/api';
import { Badge, Card } from '@/components/ui/primitives';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value) / 100);
}

export default function WalletPage() {
  const [wallets, setWallets] = useState<WalletApiRecord[]>([]);
  const [statement, setStatement] = useState<WalletStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
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
            : 'Unable to load your wallet information.',
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

  if (loading) return <LoadingState label="Loading your wallets..." />;
  if (error) return <ErrorState message={error} />;

  const naira = wallets.find((wallet) => wallet.currency === 'NGN');
  const dollar = wallets.find((wallet) => wallet.currency === 'USD');

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">
          Money
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Wallet & Payments
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          View your available balances and recent wallet activity.
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-slate-500">Naira balance</p>
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {naira ? money(naira.available_minor, 'NGN') : 'Not available'}
          </p>
          {naira ? (
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={naira.status === 'ACTIVE' ? 'success' : 'warning'}>
                {naira.status}
              </Badge>
              <span className="text-xs text-slate-500">
                Held: {money(naira.held_minor, 'NGN')}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No NGN wallet has been returned for your account.
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm font-medium text-slate-500">Dollar balance</p>
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {dollar ? money(dollar.available_minor, 'USD') : 'Not available'}
          </p>
          {dollar ? (
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={dollar.status === 'ACTIVE' ? 'success' : 'warning'}>
                {dollar.status}
              </Badge>
              <span className="text-xs text-slate-500">
                Held: {money(dollar.held_minor, 'USD')}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No USD wallet has been returned for your account.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-900">Recent wallet activity</h2>
            <p className="mt-1 text-sm text-slate-500">
              {statement.length} recorded wallet entries
            </p>
          </div>
          <Link
            href="/dashboard/transactions"
            className="text-sm font-semibold text-[#155EEF] hover:text-blue-700"
          >
            View all transactions
          </Link>
        </div>

        {statement.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            No wallet activity has been recorded yet.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {statement.slice(0, 5).map((item) => (
              <div
                key={`${item.reference}-${item.created_at}`}
                className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {item.description || item.operation}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {item.reference} · {new Date(item.created_at).toLocaleString('en-NG')}
                  </p>
                </div>
                <span className={`text-sm font-bold ${item.entry_type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-700'}`}>
                  {item.entry_type === 'CREDIT' ? '+' : '-'}
                  {money(item.amount_minor, item.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}