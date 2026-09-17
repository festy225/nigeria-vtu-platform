'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type WalletApiRecord, type WalletStatementRecord } from '@/lib/api';
import { Badge, Card } from '@/components/ui/primitives';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';

function money(value: number | string, currency: 'NGN' | 'USD') {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(value) / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function transactionTone(entry: WalletStatementRecord['entry_type']) {
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
        const [walletResponse, statementResponse] = await Promise.all([api.wallets(), api.walletStatement()]);
        if (!active) return;
        setWallets(walletResponse);
        setStatement(statementResponse);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Unable to load your financial activity.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const recentTransactions = useMemo(() => statement.slice(0, 5), [statement]);
  const transactionCount = statement.length;

  if (loading) return <LoadingState label="Loading your wallet and activity…" />;
  if (error) return <ErrorState message={error} />;

  return <div className="space-y-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Overview</p><h1 className="mt-2 text-3xl font-bold text-white">Your dashboard</h1><p className="mt-2 text-sm text-slate-400">Live balances and wallet activity from your account.</p></div>
      <Link className="button button-primary" href="/dashboard/services">Buy a service <span>→</span></Link>
    </div>

    {wallets.length === 0 ? <Card><div className="py-6 text-center"><h2 className="font-semibold text-white">No wallets available</h2><p className="mt-2 text-sm text-slate-400">Your wallet accounts have not been set up yet.</p></div></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{wallets.map((wallet) => <Card key={wallet.id}><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">{wallet.currency === 'NGN' ? 'Naira' : 'Dollar'} wallet</p><p className="mt-4 break-words text-2xl font-bold text-white">{money(wallet.available_minor, wallet.currency)}</p></div><Badge tone={wallet.status === 'ACTIVE' ? 'success' : 'warning'}>{wallet.status}</Badge></div><p className="mt-4 text-xs text-slate-500">Held: {money(wallet.held_minor, wallet.currency)}</p></Card>)}</div>}

    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Recent activity</h2><p className="mt-1 text-sm text-slate-500">{transactionCount} recorded wallet {transactionCount === 1 ? 'transaction' : 'transactions'}</p></div><Link href="/dashboard/transactions" className="text-xs font-semibold text-brand-300">View all →</Link></div>{recentTransactions.length === 0 ? <div className="py-10 text-center"><p className="text-sm text-slate-400">No transactions yet.</p><p className="mt-2 text-xs text-slate-500">Your wallet activity will appear here.</p></div> : <div className="mt-5 space-y-4">{recentTransactions.map((item) => <div key={`${item.reference}-${item.created_at}`} className="flex flex-col gap-2 border-b border-slate-800 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-200">{item.description || item.operation}</p><p className="truncate text-xs text-slate-500">{item.reference} · {date(item.created_at)}</p></div><div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1"><span className={`text-sm font-semibold ${item.entry_type === 'CREDIT' ? 'text-brand-300' : 'text-slate-300'}`}>{item.entry_type === 'CREDIT' ? '+' : '-'}{money(item.amount_minor, item.currency)}</span><Badge tone={transactionTone(item.entry_type)}>{item.entry_type}</Badge></div></div>)}</div>}</Card>
      <Card><h2 className="font-semibold text-white">Wallet information</h2><div className="mt-5 space-y-4">{wallets.map((wallet) => <div key={wallet.id} className="flex items-center justify-between border-b border-slate-800 pb-4 last:border-0 last:pb-0"><div><p className="text-sm text-slate-300">{wallet.currency} balance</p><p className="text-xs text-slate-500">Account status: {wallet.status}</p></div><span className="text-sm font-semibold text-white">{money(wallet.available_minor, wallet.currency)}</span></div>)}</div></Card>
    </div>
  </div>;
}
