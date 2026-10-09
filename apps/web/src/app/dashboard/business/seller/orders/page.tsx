'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type SellerOrder, type SellerOrderDetail } from '@/lib/api';

function formatMoney(amountMinor: number, currency: string) {
try {
return new Intl.NumberFormat('en-NG', {
style: 'currency',
currency,
}).format(amountMinor / 100);
} catch {
return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}
}

function formatDate(value: string) {
const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return 'Date unavailable';
}

return new Intl.DateTimeFormat('en-NG', {
dateStyle: 'medium',
timeStyle: 'short',
}).format(date);
}

function statusStyle(status: string) {
const normalized = status.toUpperCase();

if (
['COMPLETED', 'DELIVERED', 'PAID', 'FULFILLED'].includes(normalized)
) {
return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
}

if (
['CANCELLED', 'CANCELED', 'FAILED', 'REJECTED', 'REFUNDED'].includes(
normalized,
)
) {
return 'bg-red-50 text-red-700 ring-red-200';
}

if (
['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'READY_FOR_FULFILLMENT'].includes(
normalized,
)
) {
return 'bg-amber-50 text-amber-800 ring-amber-200';
}

return 'bg-blue-50 text-blue-700 ring-blue-200';
}

function humanizeStatus(status: string) {
return status
.toLowerCase()
.split('_')
.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
.join(' ');
}

function StatusBadge({ status }: { status: string }) {
return (
<span
className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(status)}`}
>
{humanizeStatus(status)}
</span>
);
}

export default function SellerOrdersPage() {
const [orders, setOrders] = useState<SellerOrder[]>([]);
const [selectedOrder, setSelectedOrder] = useState<SellerOrderDetail | null>(null);
const [requestedOrderId, setRequestedOrderId] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [detailLoading, setDetailLoading] = useState(false);
const [error, setError] = useState('');
const [detailError, setDetailError] = useState('');
const [refreshing, setRefreshing] = useState(false);

const loadOrders = useCallback(async (isRefresh = false) => {
if (isRefresh) {
setRefreshing(true);
} else {
setLoading(true);
}

setError('');

try {
  const result = await api.getSellerOrders();
  setOrders(result);
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : 'Unable to load your orders. Please try again.',
  );
} finally {
  setLoading(false);
  setRefreshing(false);
}

}, []);

useEffect(() => {
void loadOrders();
}, [loadOrders]);

const openOrder = async (orderId: string) => {
setRequestedOrderId(orderId);
setSelectedOrder(null);
setDetailError('');
setDetailLoading(true);

try {
  const result = await api.getSellerOrder(orderId);
  setSelectedOrder(result);
} catch (err) {
  setDetailError(
    err instanceof Error
      ? err.message
      : 'Unable to load the order details. Please try again.',
  );
} finally {
  setDetailLoading(false);
}

};

const closeOrder = () => {
setSelectedOrder(null);
setDetailError('');
};

const pendingOrders = orders.filter((order) =>
['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'READY_FOR_FULFILLMENT'].includes(
order.status.toUpperCase(),
),
).length;

const completedOrders = orders.filter((order) =>
['COMPLETED', 'DELIVERED', 'FULFILLED'].includes(
order.status.toUpperCase(),
),
).length;

const orderCurrencies = Array.from(new Set(orders.map((order) => order.currency)));

const sellerRevenueDisplay = orders.length === 0 ? "—" : orderCurrencies.length > 1 ? "Multiple currencies" : formatMoney(orders.reduce((total, order) => total + order.sellerTotalMinor, 0), orderCurrencies[0]);

return (
<main className="min-h-screen bg-[#F5F7FB] px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
<div className="mx-auto max-w-7xl space-y-6">
<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#00A985]">
CHIMZO Seller Centre
</p>
<h1 className="mt-2 text-3xl font-bold tracking-tight text-[#08205B]">
My Orders
</h1>
<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
Track customer orders containing your products and review your
share of each order.
</p>
</div>

      <div className="flex flex-wrap gap-3">
        <a
          href="/dashboard/business/seller"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#08205B] transition hover:bg-slate-50"
        >
          Seller account
        </a>
        <button
          type="button"
          onClick={() => void loadOrders(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center rounded-xl bg-[#08205B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#10357F] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh orders'}
        </button>
      </div>
    </header>

    {error && (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="self-start rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Try again
        </button>
      </div>
    )}

    <section
      aria-label="Order overview"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <OverviewCard
        label="Total orders"
        value={loading ? '—' : String(orders.length)}
        description="Orders containing your products"
        accent="blue"
      />
      <OverviewCard
        label="Needs attention"
        value={loading ? '—' : String(pendingOrders)}
        description="Pending or in progress"
        accent="amber"
      />
      <OverviewCard
        label="Completed orders"
        value={loading ? '—' : String(completedOrders)}
        description="Successfully completed"
        accent="green"
      />
      <OverviewCard
        label="Your order totals"
        value={loading ? "—" : sellerRevenueDisplay}
        description={orderCurrencies.length > 1 ? "Review individual orders in their respective currencies" : "Sum of seller-specific order totals"}
        accent="navy"
      />
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-bold text-[#08205B]">
            Recent orders
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Select an order to inspect its products and quantities.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#E8EEF6] px-3 py-1 text-xs font-semibold text-[#08205B]">
          {loading ? 'Loading…' : `${orders.length} orders`}
        </span>
      </div>

      {loading ? (
        <div className="space-y-4 p-6" aria-label="Loading orders">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : orders.length === 0 && !error ? (
        <div className="px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8EEF6] text-2xl text-[#08205B]">
            ↗
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#08205B]">
            No orders yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Orders containing your products will appear here when customers
            place them.
          </p>
          <a
            href="/marketplace"
            className="mt-5 inline-flex rounded-xl bg-[#00D4A3] px-5 py-3 text-sm font-bold text-[#08205B] transition hover:bg-[#00BC91]"
          >
            Visit marketplace
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Order</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Items</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Your total</th>
                <th className="px-6 py-4 text-right font-semibold">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="transition hover:bg-slate-50/80"
                >
                  <td className="px-6 py-5">
                    <p className="font-bold text-[#08205B]">
                      {order.orderNumber}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.id}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-600">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">
                    {order.itemCount}
                  </td>
                  <td className="px-6 py-5">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-5 text-sm font-bold text-[#08205B]">
                    {formatMoney(
                      order.sellerTotalMinor,
                      order.currency,
                    )}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button
                      type="button"
                      onClick={() => void openOrder(order.id)}
                      className="whitespace-nowrap rounded-lg border border-[#2F80ED]/30 px-3 py-2 text-sm font-semibold text-[#2F80ED] transition hover:bg-blue-50"
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {(detailLoading || detailError || selectedOrder) && (
      <section
        id="order-details"
        aria-label="Selected order details"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#00A985]">
              Order details
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#08205B]">
              {selectedOrder?.orderNumber ??
                (detailLoading ? 'Loading order…' : 'Unable to open order')}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeOrder}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {detailLoading ? (
          <div className="p-6 text-sm text-slate-500">
            Loading order details…
          </div>
        ) : detailError ? (
          <div role="alert" className="p-6 text-sm text-red-700">
            {detailError}
            <button
              type="button"
              onClick={() => {
                if (requestedOrderId) void openOrder(requestedOrderId);
              }}
              className="ml-3 font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : selectedOrder ? (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedOrder.status} />
              <span className="text-sm text-slate-500">
                Placed {formatDate(selectedOrder.createdAt)}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <DetailCard
                label="Your order total"
                value={formatMoney(
                  selectedOrder.sellerTotalMinor,
                  selectedOrder.currency,
                )}
              />
              <DetailCard
                label="Items"
                value={String(selectedOrder.itemCount)}
              />
              <DetailCard
                label="Last updated"
                value={formatDate(selectedOrder.updatedAt)}
              />
            </div>

            <div>
              <h3 className="mb-3 font-bold text-[#08205B]">
                Products in this order
              </h3>

              {selectedOrder.items.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  No product items were returned for this order.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#08205B]">
                          {item.productName}
                        </p>
                        {item.variantDescription != null && (
                          <p className="mt-1 text-sm text-slate-500">
                            Variant:{' '}
                            {typeof item.variantDescription === 'string'
                              ? item.variantDescription
                              : JSON.stringify(item.variantDescription)}
                          </p>
                        )}
                        {item.sku && (
                          <p className="mt-1 text-xs text-slate-400">
                            SKU: {item.sku}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-slate-500">
                          Quantity: {item.quantity} ×{' '}
                          {formatMoney(item.unitPriceMinor, item.currency)}
                        </p>
                      </div>
                      <p className="whitespace-nowrap font-bold text-[#08205B]">
                        {formatMoney(item.lineTotalMinor, item.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F5F7FB] p-4">
              <div>
                <p className="text-sm text-slate-500">
                  Seller-specific total
                </p>
                <p className="mt-1 text-xl font-bold text-[#08205B]">
                  {formatMoney(
                    selectedOrder.sellerTotalMinor,
                    selectedOrder.currency,
                  )}
                </p>
              </div>
              <p className="max-w-md text-xs leading-5 text-slate-500">
                This amount represents your items in the order. Final
                settlement, commissions, delivery charges, and refunds
                follow CHIMZO&apos;s configured marketplace rules.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    )}

    <footer className="px-1 pb-4 text-xs leading-5 text-slate-500">
      Order information is retrieved from your authenticated seller
      account. Only orders and item details permitted by the seller API
      should be displayed here.
    </footer>
  </div>
</main>

);
}

function OverviewCard({
label,
value,
description,
accent,
}: {
label: string;
value: string;
description: string;
accent: 'blue' | 'amber' | 'green' | 'navy';
}) {
const accentClasses = {
blue: 'bg-blue-50 text-[#2F80ED]',
amber: 'bg-amber-50 text-amber-700',
green: 'bg-emerald-50 text-emerald-700',
navy: 'bg-[#E8EEF6] text-[#08205B]',
};

return (
<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
<div className="flex items-start justify-between gap-3">
<p className="text-sm font-medium text-slate-500">{label}</p>
<span
aria-hidden="true"
className={`h-2.5 w-2.5 rounded-full ${accentClasses[accent]}`}
/>
</div>
<p className="mt-4 break-words text-2xl font-bold tracking-tight text-[#08205B]">
{value}
</p>
<p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
</article>
);
}

function DetailCard({ label, value }: { label: string; value: string }) {
return (
<div className="rounded-xl border border-slate-200 p-4">
<p className="text-xs font-medium text-slate-500">{label}</p>
<p className="mt-2 break-words text-sm font-bold text-[#08205B]">
{value}
</p>
</div>
);
}