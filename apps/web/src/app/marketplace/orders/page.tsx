'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { ApiError, api, type MarketplaceCustomerOrder } from '@/lib/api';

function money(minor: number, currency: string) {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = BigInt(minor);
  const scale = 10n ** BigInt(digits);
  const whole = formatter.formatToParts(amount / scale);
  const fraction = digits ? (amount % scale).toString().padStart(digits, '0') : '';
  return whole.map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}

function readable(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not started';
}

const panel = 'rounded-2xl border border-[#E8EEF6] bg-white p-5 shadow-sm';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl bg-[#00D4A3] px-4 py-2 text-sm font-bold text-[#08205B] hover:bg-[#63F0CF]';

export default function MarketplaceOrdersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<MarketplaceCustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.getMarketplaceCustomerOrders());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to load your orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void loadOrders();
  }, [authLoading, isAuthenticated, loadOrders]);

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#334155]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <nav className="mb-8 flex gap-3 text-sm font-semibold" aria-label="Breadcrumb">
          <Link href="/marketplace" className="text-[#2F80ED] hover:underline">Marketplace</Link>
          <span aria-hidden="true">/</span><span>My Orders</span>
        </nav>
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2F80ED]">Your purchases</p>
            <h1 className="mt-2 text-3xl font-extrabold text-[#08205B] sm:text-4xl">My Orders</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Review your marketplace orders and latest recorded payment status.</p>
          </div>
          <Link href="/marketplace" className={button}>Continue shopping</Link>
        </header>

        {authLoading || loading ? (
          <div className={panel} role="status">Loading your orders...</div>
        ) : !isAuthenticated ? (
          <section className={panel}>
            <h2 className="text-xl font-bold text-[#08205B]">Sign in to view your orders</h2>
            <p className="mt-2 text-sm text-slate-600">Your order history is private to your account.</p>
            <Link href="/login" className={`${button} mt-5`}>Sign in</Link>
          </section>
        ) : error ? (
          <section className={panel} role="alert">
            <p className="font-semibold text-rose-700">{error}</p>
            <button type="button" onClick={() => void loadOrders()} className={`${button} mt-4`}>Try again</button>
          </section>
        ) : orders.length === 0 ? (
          <section className={`${panel} py-12 text-center`}>
            <h2 className="text-xl font-bold text-[#08205B]">No orders yet</h2>
            <p className="mt-2 text-sm text-slate-600">Your marketplace orders will appear here after you place an order.</p>
            <Link href="/marketplace" className={`${button} mt-5`}>Explore products</Link>
          </section>
        ) : (
          <section className="space-y-4" aria-label="Your marketplace orders">
            <p className="text-sm text-slate-500">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</p>
            {orders.map((order) => (
              <article key={order.id} className={`${panel} flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order number</p>
                  <h2 className="mt-1 break-all text-lg font-extrabold text-[#08205B]">{order.orderNumber}</h2>
                  <p className="mt-1 text-sm text-slate-500">Placed {new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#E8EEF6] px-3 py-1 text-xs font-semibold text-[#08205B]">Order: {readable(order.status)}</span>
                    <span className="rounded-full bg-[#E6FAF4] px-3 py-1 text-xs font-semibold text-[#087A61]">Payment: {readable(order.payment?.state ?? order.payment?.providerStatus)}</span>
                  </div>
                  {order.payment?.reference && <p className="mt-3 break-all text-xs text-slate-500">Payment reference: {order.payment.reference}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                  <p className="text-xl font-extrabold text-[#08205B]">{money(order.totalMinor, order.currency)}</p>
                  <Link href={`/marketplace/orders/${encodeURIComponent(order.id)}`} className={button}>View order status</Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}