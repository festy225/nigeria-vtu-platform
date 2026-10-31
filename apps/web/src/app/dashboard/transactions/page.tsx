'use client';

import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
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

export default function TransactionsPage() {
  const [statement, setStatement] = useState<WalletStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await api.walletStatement();
        if (active) setStatement(response);
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Unable to load your transaction history.',
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

  if (loading) return <LoadingState label="Loading transactions..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">
          Activity
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Transactions
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Review entries returned by your CHIMZO wallet statement.
        </p>
      </section>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900">Wallet statement</h2>
            <p className="mt-1 text-sm text-slate-500">
              {statement.length} recorded entries
            </p>
          </div>
        </div>

        {statement.length === 0 ? (
          <div className="py-12 text-center">
            <h3 className="font-semibold text-slate-800">No transactions yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              Your recorded wallet activity will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 font-semibold">Reference</th>
                  <th className="px-3 py-3 font-semibold">Description</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Entry</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.map((item) => (
                  <tr key={`${item.reference}-${item.created_at}`}>
                    <td className="px-3 py-4 font-medium text-slate-700">
                      {item.reference}
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {item.description || item.operation}
                    </td>
                    <td className={`px-3 py-4 font-semibold ${item.entry_type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {item.entry_type === 'CREDIT' ? '+' : '-'}
                      {money(item.amount_minor, item.currency)}
                    </td>
                    <td className="px-3 py-4">
                      <Badge tone={item.entry_type === 'CREDIT' ? 'success' : 'neutral'}>
                        {item.entry_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-4 text-slate-500">
                      {new Date(item.created_at).toLocaleString('en-NG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}