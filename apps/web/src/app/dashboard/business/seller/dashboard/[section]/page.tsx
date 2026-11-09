'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type SellerProduct, type SellerProductMedia } from '@/lib/api';
import { useSellerWorkspace } from '../SellerWorkspace';
import SellerMembershipGate from '../../../SellerMembershipGate';
import { useAuth } from '@/components/providers/auth-provider';

const pages: Record<string, { title: string; description: string }> = {
  customers: {
    title: 'Customers',
    description: 'Customer profiles and relationship tools for your store.',
  },
  analytics: {
    title: 'Sales & Analytics',
    description: 'Sales trends and performance reporting for your business.',
  },
  earnings: {
    title: 'Earnings',
    description: 'A clear view of seller earnings and settlement activity.',
  },
  payouts: {
    title: 'Payouts',
    description: 'Payout destination and transfer history for your store.',
  },
  promotions: {
    title: 'Promotions',
    description: 'Tools for creating and managing offers in the marketplace.',
  },
  support: {
    title: 'Support',
    description: 'Seller support requests and service updates.',
  },
  settings: {
    title: 'Settings',
    description: 'Preferences and operational settings for your seller account.',
  },
};

export default function SellerSectionPage({ params }: { params: { section: string } }) {
  const section = params.section;
  if (section === 'inventory') return <InventoryPage />;
  if (section === 'verification') return <VerificationPage />;
  if (section === 'information') return <BusinessInformationPage />;
  if (section === 'wholesaler') return <WholesalerUpgradePage />;
  if (section === 'distributor') return <DistributorUpgradePage />;

  const page = pages[section];
  if (!page) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-[#08205B]">Page not found</h1>
        <Link href="/dashboard/business/seller/dashboard" className="mt-4 inline-block text-sm font-semibold text-[#2F80ED]">Back to overview</Link>
      </section>
    );
  }

  return <BackendPlaceholder title={page.title} description={page.description} />;
}

function WholesalerUpgradePage() {
  const { application } = useSellerWorkspace();
  const { user, refreshUser } = useAuth();

  if (user?.roles.includes('WHOLESALER')) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-white p-6">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Wholesaler active</span>
        <h1 className="mt-4 text-2xl font-bold text-[#08205B]">Your wholesaler access is active</h1>
        <p className="mt-2 text-sm text-slate-600">Your seller account and existing products and orders remain available.</p>
      </section>
    );
  }

  if (application?.seller_type === 'WHOLESALER') {
    return (
      <div className="space-y-5">
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h1 className="text-lg font-bold text-[#08205B]">Wholesaler membership required</h1>
          <p className="mt-2 text-sm text-slate-600">Your seller profile is marked as a wholesaler, but verified wholesaler membership is not active. Complete the configured membership payment to enable wholesaler access.</p>
        </section>
        <SellerMembershipGate programCode="WHOLESALER" onVerified={refreshUser} />
      </div>
    );
  }

  return <SellerMembershipGate programCode="WHOLESALER" onVerified={refreshUser} />;
}

function DistributorUpgradePage() {
  const { application } = useSellerWorkspace();
  const { user, refreshUser } = useAuth();

  if (user?.roles.includes('DISTRIBUTOR')) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-white p-6">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Distributor active</span>
        <h1 className="mt-4 text-2xl font-bold text-[#08205B]">Your distributor access is active</h1>
        <p className="mt-2 text-sm text-slate-600">Your existing seller and wholesaler account history remains available.</p>
      </section>
    );
  }

  if (application?.seller_type !== 'WHOLESALER' && application?.seller_type !== 'DISTRIBUTOR') {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-[#08205B]">Wholesaler membership required</h1>
        <p className="mt-2 text-sm text-slate-600">Distributor membership is an upgrade for eligible, approved Wholesaler accounts.</p>
      </section>
    );
  }

  return <SellerMembershipGate programCode="DISTRIBUTOR" onVerified={refreshUser} />;
}

function InventoryPage() {
  const { application } = useSellerWorkspace();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getSellerProducts().then(
      (result) => {
        if (active) setProducts(Array.isArray(result) ? result : []);
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load seller products.');
      },
    ).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeading eyebrow={application?.store_name ?? 'Store inventory'} title="Inventory" description="Products submitted under your seller account, including their moderation and media status." />
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500" role="status">Loading products...</div>
      ) : error ? null : products.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-[#08205B]">No products yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Products will appear here once they are submitted through CHIMZO product management. Product creation is not currently available through the seller web API.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} className="h-44 w-full bg-slate-100 object-cover" loading="lazy" />
              ) : <div className="flex h-44 items-center justify-center bg-slate-100 text-sm text-slate-500">No product image</div>}
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold text-[#08205B]">{product.name}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.status.toUpperCase() === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{product.status.replaceAll('_', ' ')}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{product.description}</p>
                <p className="mt-3 font-semibold text-[#08205B]">{product.price_minor !== null && product.currency ? formatMoney(Number(product.price_minor), product.currency) : 'Price not set'}</p>
                <p className="mt-1 text-xs text-slate-500">{product.enabled ? 'Listing enabled' : 'Listing not enabled'}</p>
                <ProductMediaPanel product={product} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductMediaPanel({ product }: { product: SellerProduct }) {
  const [media, setMedia] = useState<SellerProductMedia[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getSellerProductMedia(product.id).then(
      (result) => { if (active) setMedia(Array.isArray(result) ? result : []); },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load product media.'); },
    ).finally(() => { if (active) setLoadingMedia(false); });
    return () => { active = false; };
  }, [product.id]);

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);
    const invalid = selected.find((file) => !allowedTypes.has(file.type));
    const oversized = selected.find((file) => file.size > 50 * 1024 * 1024);
    if (invalid) {
      setError(`${invalid.name} has an unsupported file type.`);
      return;
    }
    if (oversized) {
      setError(`${oversized.name} exceeds the 50 MB file limit.`);
      return;
    }
    if (media.length + selected.length > 10) {
      setError('A product can have at most 10 media files.');
      return;
    }
    setFiles(selected);
    setError('');
    setMessage('');
  }

  async function uploadMedia() {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const uploaded = await api.uploadSellerProductMedia(product.id, files);
      setMedia((current) => [...current, ...uploaded]);
      setFiles([]);
      setMessage('Product media uploaded.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Media upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMedia(item: SellerProductMedia) {
    if (removingId || !window.confirm('Remove this saved media file?')) return;
    setRemovingId(item.id);
    setError('');
    setMessage('');
    try {
      await api.deleteSellerProductMedia(product.id, item.id);
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      setMessage('Media file removed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove media.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-800">Product photos and videos</p>
      <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP, GIF, MP4 or WebM, up to 50 MB each.</p>
      <input
        aria-label={`Choose media for ${product.name}`}
        className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#F4F7FB] file:px-3 file:py-2 file:font-semibold file:text-[#08205B]"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
        multiple
        onChange={selectFiles}
      />
      {files.length > 0 && <button type="button" onClick={() => void uploadMedia()} disabled={busy} className="mt-3 rounded-md bg-[#08205B] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? 'Uploading...' : `Upload ${files.length} file${files.length === 1 ? '' : 's'}`}</button>}
      {loadingMedia ? (
        <p className="mt-3 text-xs text-slate-500">Loading saved media...</p>
      ) : media.length ? (
        <div className="mt-3 space-y-2">
          {media.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{item.mediaType === 'VIDEO' ? 'Video' : 'Image'}</p>
                <p className="text-xs text-slate-500">{item.mimeType} · {formatFileSize(item.fileSize)}</p>
              </div>
              <button type="button" onClick={() => void removeMedia(item)} disabled={removingId !== null} className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">{removingId === item.id ? 'Removing...' : 'Remove'}</button>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-xs text-slate-500">No saved media yet.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
    </div>
  );
}

function formatFileSize(value: number | string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VerificationPage() {
  const { application } = useSellerWorkspace();
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Seller verification" title="Verification" description="Current onboarding and KYC decisions associated with your seller application." />
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <StatusField label="Seller application" value={application?.onboarding_status} />
          <StatusField label="Identity verification" value={application?.kyc_status} />
          <StatusField label="Risk status" value={application?.risk_status} />
          <StatusField label="Last reviewed" value={application?.reviewed_at ? new Date(application.reviewed_at).toLocaleDateString('en-NG') : 'Not reviewed'} />
        </dl>
      </section>
      <Link href="/dashboard/business/seller" className="inline-flex rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#08205B]">Open seller application</Link>
    </div>
  );
}

function BusinessInformationPage() {
  const { application } = useSellerWorkspace();
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Seller profile" title="KYC / Business Information" description="Business and store details currently on your seller application." />
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <StatusField label="Business name" value={application?.business_name} />
          <StatusField label="Store name" value={application?.store_name} />
          <StatusField label="Store URL slug" value={application?.store_slug} />
          <StatusField label="Seller type" value={application?.seller_type.replaceAll('_', ' ')} />
          <StatusField label="Business verification" value={application?.kyc_status} />
          <StatusField label="Application status" value={application?.onboarding_status.replaceAll('_', ' ')} />
        </dl>
      </section>
      <Link href="/dashboard/business/seller" className="inline-flex rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#08205B]">Manage seller application</Link>
    </div>
  );
}

function BackendPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Seller workspace" title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
        <span className="inline-flex rounded-full bg-[#EAF2FF] px-3 py-1 text-xs font-semibold text-[#2F80ED]">Awaiting backend integration</span>
        <h2 className="mt-4 text-lg font-semibold text-[#08205B]">This area is not connected yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">CHIMZO does not currently provide seller API functionality for this section. No customer, financial, sales, payout, or promotion data is being shown until a supported backend is available.</p>
      </section>
    </div>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#2F80ED]">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold text-[#08205B] sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </header>
  );
}

function StatusField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800">{value || 'Unavailable'}</dd>
    </div>
  );
}

function formatMoney(amountMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}