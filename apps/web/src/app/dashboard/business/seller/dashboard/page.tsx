'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../../lib/api';
import type {
  SellerApplication,
  SellerOrder,
  SellerProduct,
  SellerProductMedia,
} from '../../../../../lib/api';

function formatMoney(amountMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function statusStyle(status: string) {
  const value = status.toUpperCase();

  if (['COMPLETED', 'DELIVERED', 'SUCCESS'].includes(value)) {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (['FAILED', 'CANCELLED', 'REJECTED'].includes(value)) {
    return 'bg-red-50 text-red-700';
  }

  return 'bg-amber-50 text-amber-700';
}

function SellerProductMediaPanel({ product }: { product: SellerProduct }) {
  const [media, setMedia] = useState<SellerProductMedia[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [mediaMessage, setMediaMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadMedia() {
      setLoadingMedia(true);
      setMediaError('');
      try {
        const result = await api.getSellerProductMedia(product.id);
        if (active) setMedia(Array.isArray(result) ? result : []);
      } catch (error) {
        if (active) {
          setMediaError(
            error instanceof Error ? error.message : 'Could not load product media.',
          );
        }
      } finally {
        if (active) setLoadingMedia(false);
      }
    }

    void loadMedia();
    return () => {
      active = false;
    };
  }, [product.id]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!files.length) return;

    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
    ]);

    const invalid = files.find((file) => !allowedTypes.has(file.type));
    if (invalid) {
      setMediaError(`${invalid.name} has an unsupported file type.`);
      return;
    }

    const tooLarge = files.find((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge) {
      setMediaError(`${tooLarge.name} exceeds the 50 MB file limit.`);
      return;
    }

    if (media.length + files.length > 10) {
      setMediaError('A product can have at most 10 media files.');
      return;
    }

    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setSelectedFiles(files);
    setPreviewUrls(files.map((file) => URL.createObjectURL(file)));
    setMediaError('');
    setMediaMessage('');
  }

  async function handleUpload() {
    if (!selectedFiles.length || uploading) return;

    setUploading(true);
    setMediaError('');
    setMediaMessage('');

    try {
      const uploaded = await api.uploadSellerProductMedia(
        product.id,
        selectedFiles,
      );
      setMedia((current) => [...current, ...uploaded]);
      setSelectedFiles([]);
      setPreviewUrls([]);
      setMediaMessage('Product media uploaded successfully.');
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Media upload failed.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(item: SellerProductMedia) {
    if (removingId) return;
    if (!window.confirm('Remove this saved media file?')) return;

    setRemovingId(item.id);
    setMediaError('');
    setMediaMessage('');

    try {
      await api.deleteSellerProductMedia(product.id, item.id);
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      setMediaMessage('Media file removed.');
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Could not remove media.',
      );
    } finally {
      setRemovingId(null);
    }
  }

  function formatFileSize(value: number | string) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <section className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">
          Product photos and videos
        </h4>
        <span className="text-xs text-slate-500">
          {media.length}/10 saved
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        JPG, PNG, WebP, GIF, MP4 or WebM. Maximum 50 MB per file.
      </p>

      <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        Choose photos or videos
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          multiple
          onChange={handleFileSelection}
          className="sr-only"
        />
      </label>

      {selectedFiles.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Selected files ({selectedFiles.length})
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="min-w-0">
                {file.type.startsWith('image/') ? (
                  <img
                    src={previewUrls[index]}
                    alt={file.name}
                    className="h-24 w-full rounded-md object-cover"
                  />
                ) : (
                  <video
                    src={previewUrls[index]}
                    controls
                    className="h-24 w-full rounded-md bg-black object-contain"
                  />
                )}
                <p className="mt-1 truncate text-xs text-slate-600">
                  {file.name}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Upload selected media'}
          </button>
        </div>
      )}

      {loadingMedia ? (
        <p className="mt-3 text-xs text-slate-500">Loading saved media...</p>
      ) : media.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Saved media</p>
          {media.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">
                  {item.mediaType === 'VIDEO' ? 'Video' : 'Image'}
                </p>
                <p className="text-xs text-slate-500">
                  {item.mimeType} · {formatFileSize(item.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(item)}
                disabled={removingId !== null}
                className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                {removingId === item.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No saved media yet.</p>
      )}

      {mediaError && (
        <p role="alert" className="mt-2 text-xs text-red-600">{mediaError}</p>
      )}
      {mediaMessage && (
        <p className="mt-2 text-xs text-emerald-700">{mediaMessage}</p>
      )}
    </section>
  );
}
export default function SellerDashboardPage() {
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsError, setProductsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const sellerApplication = await api.getSellerApplication();

        if (!active) return;
        setApplication(sellerApplication);

        if (
          sellerApplication.onboarding_status === 'APPROVED' &&
          sellerApplication.kyc_status === 'VERIFIED'
        ) {
          const sellerOrders = await api.getSellerOrders();
          if (!active) return;
          setOrders(Array.isArray(sellerOrders) ? sellerOrders : []);

          try {
            const sellerProducts = await api.getSellerProducts();
            if (!active) return;
            setProducts(Array.isArray(sellerProducts) ? sellerProducts : []);
          } catch (productError) {
            if (!active) return;
            setProductsError(
              productError instanceof Error
                ? productError.message
                : 'Unable to load your products.',
            );
          }
        }
      } catch (err) {
        if (!active) return;

        const status = (err as { status?: number })?.status;
        setError(
          status === 404
            ? 'No seller application was found for this account.'
            : err instanceof Error
              ? err.message
              : 'Unable to load your seller dashboard. Please try again.',
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const approved =
    application?.onboarding_status === 'APPROVED' &&
    application?.kyc_status === 'VERIFIED';

  const completedOrders = orders.filter((order) =>
    ['COMPLETED', 'DELIVERED'].includes(order.status.toUpperCase()),
  ).length;

  const activeOrders = orders.filter((order) =>
    ['PENDING', 'PROCESSING', 'CONFIRMED', 'READY_FOR_FULFILLMENT']
      .includes(order.status.toUpperCase()),
  ).length;

  const currencies = Array.from(
    new Set(orders.map((order) => order.currency)),
  );

  const salesSummary =
    currencies.length === 0
      ? formatMoney(0, 'NGN')
      : currencies.length === 1
        ? formatMoney(
            orders.reduce((sum, order) => sum + order.sellerTotalMinor, 0),
            currencies[0],
          )
        : 'Multiple currencies';

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading your seller workspace...
      </div>
    );
  }

  if (error || !application) {
    return (

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-[#08205B]">Seller Dashboard</h1>
        <p className="mt-3 text-sm text-slate-600">
          {error || 'Your seller application could not be loaded.'}
        </p>
        <Link
          href="/dashboard/business/seller"
          className="mt-5 inline-flex rounded-lg bg-[#08205B] px-4 py-3 text-sm font-semibold text-white"
        >
          View seller application
        </Link>
      </section>
    );
  }

  if (!approved) {
    return (
      <section className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#2F80ED]">
            CHIMZO Business
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#08205B]">
            Seller Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your seller workspace will become available when your application
            and identity verification meet the approval requirements.
          </p>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Seller access is not yet fully approved
          </h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Application status
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {application.onboarding_status.replaceAll('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                KYC status
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {application.kyc_status.replaceAll('_', ' ')}
              </dd>
            </div>
          </dl>
          <Link
            href="/dashboard/business/seller"
            className="mt-6 inline-flex rounded-lg bg-[#08205B] px-4 py-3 text-sm font-semibold text-white"
          >
            View application details
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#2F80ED]">
            CHIMZO Business
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#08205B]">
            Seller Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Welcome to your store workspace, {application.store_name}.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          Seller approved
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total orders</p>
          <p className="mt-3 text-3xl font-bold text-[#08205B]">{orders.length}</p>
          <p className="mt-2 text-xs text-slate-500">Orders assigned to your store</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active orders</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">{activeOrders}</p>
          <p className="mt-2 text-xs text-slate-500">Awaiting processing or fulfillment</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Completed orders</p>
          <p className="mt-3 text-3xl font-bold text-emerald-700">{completedOrders}</p>
          <p className="mt-2 text-xs text-slate-500">Completed or delivered</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Seller order value</p>
          <p className="mt-3 break-words text-2xl font-bold text-[#08205B]">
            {salesSummary}
          </p>
          <p className="mt-2 text-xs text-slate-500">Based on seller order totals</p>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-[#08205B]">Store overview</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Business name</dt>
              <dd className="mt-1 font-semibold text-slate-800">{application.business_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Store name</dt>
              <dd className="mt-1 font-semibold text-slate-800">{application.store_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Business type</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {application.seller_type.replaceAll('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">KYC verification</dt>
              <dd className="mt-1 font-semibold text-emerald-700">Verified</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-[#08205B]">Seller actions</h2>
          <div className="mt-5 space-y-3">
            <Link
              href="/dashboard/business/seller/orders"
              className="block rounded-lg bg-[#08205B] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#123477]"
            >
              Manage orders
            </Link>
            <Link
              href="/dashboard/business/seller"
              className="block rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Seller application
            </Link>
            <Link
              href="/marketplace"
              className="block rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View marketplace
            </Link>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#08205B]">My products</h2>
            <p className="mt-1 text-sm text-slate-500">
              Products submitted under your seller account.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
        </div>

        {productsError ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Your orders loaded, but your products could not be loaded: {productsError}
          </p>
        ) : products.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            You have not added any products yet. Your products will appear here
            after you submit them through product management.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-40 w-full bg-slate-100 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-slate-100 text-sm text-slate-400">
                    No product image
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-800">{product.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {product.description}
                  </p>
                  <p className="mt-3 font-bold text-[#08205B]">
                    {product.price_minor !== null && product.currency
                      ? formatMoney(Number(product.price_minor), product.currency)
                      : 'Price not set'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(product.status)}`}>
                      {product.status.replaceAll('_', ' ')}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.enabled
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {product.enabled ? 'Enabled' : 'Not enabled'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Added {formatDate(product.created_at)}
                  </p>
                  <SellerProductMediaPanel product={product} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#08205B]">Recent orders</h2>
            <p className="mt-1 text-sm text-slate-500">
              The latest orders associated with your store.
            </p>
          </div>
          <Link
            href="/dashboard/business/seller/orders"
            className="text-sm font-semibold text-[#2F80ED] hover:underline"
          >
            View all orders
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            No seller orders have been recorded yet. Orders will appear here
            when customers purchase your products.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-3 font-semibold">Order</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Items</th>
                  <th className="px-3 py-3 font-semibold">Seller total</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4 font-semibold text-[#08205B]">
                      {order.orderNumber}
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-3 py-4 text-slate-600">{order.itemCount}</td>
                    <td className="px-3 py-4 font-semibold text-slate-800">
                      {formatMoney(order.sellerTotalMinor, order.currency)}
                    </td>
                    <td className="px-3 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(order.status)}`}>
                        {order.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Order information is retrieved from your authenticated seller account.
        Your product list is retrieved from your authenticated seller account.
      </p>
    </div>
  );
}



