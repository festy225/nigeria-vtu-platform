'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { ApiError, api, type MarketplaceOrderPaymentStatus } from '@/lib/api';

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

const panel = 'rounded-2xl border border-[#E8EEF6] bg-white p-6 shadow-sm';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl bg-[#00D4A3] px-4 py-2 text-sm font-bold text-[#08205B] hover:bg-[#63F0CF]';

export default function MarketplaceOrderStatusPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [result, setResult] = useState<MarketplaceOrderPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getMarketplaceOrderPaymentStatus(orderId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to load this order status.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void loadStatus();
  }, [authLoading, isAuthenticated, loadStatus]);

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#334155]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
        <nav className="mb-8 flex flex-wrap gap-3 text-sm font-semibold" aria-label="Breadcrumb">
          <Link href="/marketplace" className="text-[#2F80ED] hover:underline">Marketplace</Link>
          <span aria-hidden="true">/</span>
          <Link href="/marketplace/orders" className="text-[#2F80ED] hover:underline">My Orders</Link>
          <span aria-hidden="true">/</span><span>Status</span>
        </nav>
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2F80ED]">Order tracking</p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#08205B]">Order status</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Review the order and latest payment information recorded by CHIMZO.</p>
        </header>

        {authLoading || loading ? (
          <section className={panel} role="status">Checking order status...</section>
        ) : !isAuthenticated ? (
          <section className={panel}>
            <h2 className="text-xl font-bold text-[#08205B]">Sign in to view this order</h2>
            <Link href="/login" className={`${button} mt-5`}>Sign in</Link>
          </section>
        ) : error ? (
          <section className={panel} role="alert">
            <h2 className="text-lg font-bold text-rose-700">Could not load this order</h2>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button type="button" onClick={() => void loadStatus()} className={`${button} mt-5`}>Try again</button>
          </section>
        ) : result ? (
          <div className="space-y-5">
            <section className={panel}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order number</p>
              <h2 className="mt-2 break-all text-xl font-extrabold text-[#08205B]">{result.order.orderNumber}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-[#F5F7FB] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order status</p>
                  <p className="mt-2 font-bold text-[#08205B]">{readable(result.order.status)}</p>
                </div>
                <div className="rounded-xl bg-[#F5F7FB] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order total</p>
                  <p className="mt-2 text-xl font-extrabold text-[#08205B]">{money(result.order.totalMinor, result.order.currency)}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">Placed {new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.order.createdAt))}</p>
            </section>

            <section className={panel}>
              <h2 className="text-xl font-extrabold text-[#08205B]">Payment status</h2>
              {result.payment ? (
                <dl className="mt-4 divide-y divide-[#E8EEF6]">
                  <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-sm text-slate-500">Payment state</dt>
                    <dd className="font-semibold text-[#08205B]">{readable(result.payment.state)}</dd>
                  </div>
                  <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-sm text-slate-500">Provider status</dt>
                    <dd className="font-semibold text-[#08205B]">{readable(result.payment.providerStatus)}</dd>
                  </div>
                  {result.payment.reference && <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between"><dt className="text-sm text-slate-500">Payment reference</dt><dd className="break-all font-semibold text-[#08205B]">{result.payment.reference}</dd></div>}
                  {result.payment.providerReference && <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between"><dt className="text-sm text-slate-500">Provider reference</dt><dd className="break-all font-semibold text-[#08205B]">{result.payment.providerReference}</dd></div>}
                  {result.payment.providerName && <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between"><dt className="text-sm text-slate-500">Payment provider</dt><dd className="font-semibold text-[#08205B]">{result.payment.providerName}</dd></div>}
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">No payment record is available for this order yet. This does not confirm that payment has been made.</p>
              )}
              <p className="mt-4 rounded-xl bg-[#E8EEF6] p-4 text-sm leading-6 text-slate-600">Payment confirmation depends on the status recorded by CHIMZO. A browser redirect alone is not proof of successful payment or settlement.</p>
            </section>
            <div className="flex flex-wrap gap-3">
              <Link href="/marketplace/orders" className={button}>Back to My Orders</Link>
              <Link href="/marketplace" className="inline-flex min-h-10 items-center rounded-xl border border-[#D5DEEA] bg-white px-4 py-2 text-sm font-semibold text-[#08205B] hover:border-[#2F80ED]">Continue shopping</Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}