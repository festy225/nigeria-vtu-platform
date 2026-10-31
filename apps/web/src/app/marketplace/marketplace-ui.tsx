'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  ApiError,
  api,
  type MarketplaceCart,
  type MarketplaceCartItem,
  type MarketplaceCustomerAddress,
  type MarketplaceProduct,
  type MarketplaceProductDetail,
} from '@/lib/api';

const pageClass =
  'min-h-screen bg-white text-[#334155] [font-family:var(--font-sora),Arial,sans-serif]';
const panelClass = 'rounded-xl border border-[#E8EEF6] bg-white p-5 text-[#334155] shadow-sm';
const actionClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#00D4A3] px-5 py-2.5 text-sm font-bold text-[#08205B] transition hover:bg-[#63f0cf] disabled:cursor-not-allowed disabled:opacity-50';
const mutedActionClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-[#CBD5E1] px-4 py-2 text-sm font-semibold text-[#08205B] transition hover:border-[#00D4A3] hover:text-[#08205B] disabled:cursor-not-allowed disabled:opacity-50';

function formatMoney(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  if (digits === undefined) {
    throw new Error('Currency precision could not be determined.');
  }
  const amount = BigInt(minor);
  const scale = 10n ** BigInt(digits);
  const wholeParts = formatter.formatToParts(amount / scale);
  const fraction = (amount % scale).toString().padStart(digits, '0');
  return wholeParts
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return 'The marketplace is currently unavailable.';
  }
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className={pageClass}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#08205B] text-white shadow-md">
        <div className="mx-auto flex min-h-[62px] max-w-[1500px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link
            href="/marketplace"
            className="flex shrink-0 items-center gap-2"
            aria-label="CHIMZO marketplace home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#00D4A3] text-lg font-black text-[#08205B]">
              C
            </span>
            <span className="text-lg font-extrabold tracking-tight text-white">CHIMZO</span>
          </Link>

          <nav className="hidden items-center gap-4 text-xs font-semibold text-white/90 lg:flex" aria-label="Main navigation">
            <Link href="/marketplace" className="transition hover:text-[#00D4A3]">Marketplace</Link>
            <Link href="/marketplace" className="transition hover:text-[#00D4A3]">Services</Link>
            <Link href="/marketplace" className="transition hover:text-[#00D4A3]">VTU</Link>
            <Link href="/marketplace#categories" className="transition hover:text-[#00D4A3]">Categories</Link>
          </nav>

          <form action="/marketplace" method="get" className="ml-auto hidden min-w-0 max-w-xl flex-1 sm:flex">
            <label htmlFor="chimzo-marketplace-search" className="sr-only">Search products</label>
            <input
              id="chimzo-marketplace-search"
              name="q"
              type="search"
              placeholder="Search for products, brands and more..."
              className="min-h-9 w-full rounded-l-md border-0 bg-white px-3 text-xs text-[#08205B] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#00D4A3]"
            />
            <button type="submit" aria-label="Search" className="rounded-r-md bg-white px-3 text-[#08205B] hover:bg-slate-100">
              Search
            </button>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs font-semibold sm:ml-0 sm:gap-4">
            <Link href="/marketplace/cart" aria-label="Shopping cart" className="text-base transition hover:text-[#00D4A3]">
              Cart
            </Link>
            <Link href="/login" className="whitespace-nowrap transition hover:text-[#00D4A3]">
              Login / Register
            </Link>
          </div>
        </div>

        <div className="px-4 pb-3 sm:hidden">
          <form action="/marketplace" method="get" className="flex">
            <label htmlFor="chimzo-marketplace-search-mobile" className="sr-only">Search products</label>
            <input
              id="chimzo-marketplace-search-mobile"
              name="q"
              type="search"
              placeholder="Search products and brands..."
              className="min-h-9 w-full rounded-l-md bg-white px-3 text-xs text-[#08205B] outline-none placeholder:text-slate-400"
            />
            <button type="submit" className="rounded-r-md bg-white px-3 text-xs font-semibold text-[#08205B]">
              Search
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className={`${panelClass} border-amber-300/30`}>
      <p className="text-lg font-bold text-[#08205B]">{message}</p>
      {retry && <button type="button" onClick={retry} className={`${mutedActionClass} mt-5`}>Try again</button>}
    </div>
  );
}

export function MarketplaceCatalog() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.marketplaceProducts());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  return (
    <PageFrame>
      <section className="relative mb-8 overflow-hidden rounded-2xl bg-[#08205B] px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-[#00D4A3]/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#00D4A3]">Welcome to CHIMZO</p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">Discover products made for you.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">Explore marketplace listings, compare available options and find products from sellers in one convenient place.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#products" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#00D4A3] px-5 py-3 text-sm font-bold text-[#08205B] transition hover:bg-white">Shop products <span className="ml-2" aria-hidden="true">?</span></a>
            <a href="/dashboard/business/seller" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/50 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">Sell on CHIMZO</a>
          </div>
        </div>
      </section>
      <section aria-labelledby="categories-heading" className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F70]">Browse the store</p>
            <h2 id="categories-heading" className="mt-1 text-xl font-extrabold text-[#08205B] sm:text-2xl">Shop by category</h2>
          </div>
          <a href="#products" className="text-sm font-bold text-[#087F70] hover:text-[#08205B]">View products ?</a>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <a href="#products" className="group rounded-xl border border-[#E8EEF6] bg-white p-4 transition hover:border-[#00D4A3] hover:shadow-sm sm:p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8F8F4] text-xl" aria-hidden="true">?</span>
            <span className="mt-3 block text-sm font-bold text-[#08205B]">Electronics</span>
            <span className="mt-1 block text-xs text-[#64748B]">Explore listings</span>
          </a>
          <a href="#products" className="group rounded-xl border border-[#E8EEF6] bg-white p-4 transition hover:border-[#00D4A3] hover:shadow-sm sm:p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EAF1FF] text-xl" aria-hidden="true">?</span>
            <span className="mt-3 block text-sm font-bold text-[#08205B]">Fashion</span>
            <span className="mt-1 block text-xs text-[#64748B]">Explore listings</span>
          </a>
          <a href="#products" className="group rounded-xl border border-[#E8EEF6] bg-white p-4 transition hover:border-[#00D4A3] hover:shadow-sm sm:p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF3E8] text-xl" aria-hidden="true">?</span>
            <span className="mt-3 block text-sm font-bold text-[#08205B]">Home & living</span>
            <span className="mt-1 block text-xs text-[#64748B]">Explore listings</span>
          </a>
          <a href="#products" className="group rounded-xl border border-[#E8EEF6] bg-white p-4 transition hover:border-[#00D4A3] hover:shadow-sm sm:p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3EDFF] text-xl" aria-hidden="true">?</span>
            <span className="mt-3 block text-sm font-bold text-[#08205B]">More to explore</span>
            <span className="mt-1 block text-xs text-[#64748B]">Browse all listings</span>
          </a>
        </div>
      </section>

      <section aria-label="CHIMZO marketplace promotion" className="mb-10 flex flex-col justify-between gap-5 rounded-2xl border border-[#D8F3EC] bg-[#F0FBF8] p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F70]">Your marketplace, all in one place</p>
          <h2 className="mt-2 text-xl font-extrabold text-[#08205B] sm:text-2xl">Find something you?ll love.</h2>
          <p className="mt-2 text-sm leading-6 text-[#475569]">Browse available listings and open a product to see its details, pricing and options.</p>
        </div>
        <a href="#products" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[#08205B] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12377E]">Explore listings ?</a>
      </section>

      <section aria-labelledby="featured-products-heading" className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F70]">Handpicked for browsing</p>
        <h2 id="featured-products-heading" className="mt-1 text-xl font-extrabold text-[#08205B] sm:text-2xl">Explore products</h2>
        <p className="mt-2 text-sm text-[#64748B]">Browse available listings and view each product for more information.</p>
      </section>

      {loading ? (
        <p className="text-sm text-[#475569]" role="status">Loading products…</p>
      ) : error ? (
        <ErrorPanel message={error} retry={() => void loadProducts()} />
      ) : products.length === 0 ? (
        <div className={panelClass}><h2 className="text-xl font-bold text-[#08205B]">No products available yet</h2><p className="mt-2 text-sm text-[#475569]">Please check back later.</p></div>
      ) : (
        <section id="products" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Marketplace products">
          {products.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-xl border border-[#E8EEF6] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative flex h-48 items-end overflow-hidden bg-[#F5F7FB] p-4">
                {product.imageUrl && <img src={product.imageUrl} alt={product.name} loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full object-contain p-4" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                <span className="rounded-full border border-[#E8EEF6] bg-white px-3 py-1 text-xs font-semibold text-[#334155]">{product.categoryName}</span>
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#087F70]">{product.sellerName}</p>
                <h2 className="mt-2 line-clamp-2 text-base font-bold text-[#08205B]">{product.name}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#64748B]">{product.description}</p>
                <div className="mt-5 flex min-h-11 items-center justify-between gap-3">
                  <p className="font-bold text-[#08205B]">
                    {product.hasVariants
                      ? 'Options available'
                      : product.priceMinor !== null && product.currency
                        ? formatMoney(product.priceMinor, product.currency)
                        : 'Price unavailable'}
                  </p>
                  <Link href={`/marketplace/products/${encodeURIComponent(product.id)}`} className="text-sm font-bold text-[#087F70] hover:text-[#08205B]">View details →</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      <footer className="mt-14 border-t border-[#E8EEF6] pt-7 pb-3">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <a href="/marketplace" className="text-lg font-extrabold tracking-tight text-[#08205B]">CHIMZO<span className="text-[#00A98A]">.</span></a>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#64748B]">Discover products and explore marketplace listings in one place.</p>
          </div>
          <nav aria-label="Marketplace footer" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-[#475569]">
            <a href="/marketplace" className="hover:text-[#087F70]">Marketplace</a>
            <a href="#categories-heading" className="hover:text-[#087F70]">Categories</a>
            <a href="#products" className="hover:text-[#087F70]">Products</a>
          </nav>
        </div>
        <p className="mt-6 border-t border-[#E8EEF6] pt-4 text-xs text-[#64748B]">Product availability and pricing are shown on individual listings.</p>
      </footer>
    </PageFrame>
  );
}

export function MarketplaceProductDetail({ productId }: { productId: string }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [product, setProduct] = useState<MarketplaceProductDetail | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await api.marketplaceProduct(productId));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const selectedVariant = product?.variants.find((variant) => variant.id === selectedVariantId);
  const priceMinor = product?.hasVariants ? selectedVariant?.priceMinor : product?.priceMinor;
  const currency = product?.hasVariants ? selectedVariant?.currency : product?.currency;
  const pricingAvailable = priceMinor !== null && priceMinor !== undefined && currency !== null && currency !== undefined;

  async function addToCart() {
    if (!product || !pricingAvailable || (product.hasVariants && !selectedVariant)) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      await api.addMarketplaceCartItem({
        productId: product.id,
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
        quantity,
      });
      setNotice('Added to your cart.');
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setAdding(false);
    }
  }

  return (
    <PageFrame>
      <p className="mb-6 text-sm text-[#64748B]"><Link href="/marketplace" className="hover:text-[#00D4A3]">Discover</Link><span className="px-2">/</span>Product details</p>
      {loading ? (
        <p className="text-sm text-[#E8EEF6]/70" role="status">Loading product…</p>
      ) : error && !product ? (
        <ErrorPanel message={error} retry={() => void loadProduct()} />
      ) : product ? (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative flex min-h-72 items-end overflow-hidden rounded-xl border border-[#E8EEF6] bg-[#F5F7FB] p-7">
            {product.imageUrl && <img src={product.imageUrl} alt={product.name} className="pointer-events-none absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
            <span className="rounded-full border border-[#E8EEF6] bg-white px-4 py-2 text-sm font-semibold text-[#334155]">{product.categoryName}</span>
          </div>
          <section className={panelClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00D4A3]">{product.sellerName}</p>
            <h1 className="mt-3 text-3xl font-extrabold text-white">{product.name}</h1>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#475569]">{product.description}</p>
            <p className="mt-6 text-2xl font-extrabold text-[#08205B]">
              {pricingAvailable ? formatMoney(priceMinor, currency) : 'Price unavailable'}
            </p>

            {product.hasVariants && (
              <fieldset className="mt-7">
                <legend className="mb-3 text-sm font-bold text-[#08205B]">Choose an available option</legend>
                {product.variants.length ? (
                  <div className="space-y-2">
                    {product.variants.map((variant) => (
                      <label key={variant.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selectedVariantId === variant.id ? 'border-[#00D4A3] bg-[#00D4A3]/10' : 'border-[#E8EEF6] hover:border-[#94A3B8]'}`}>
                        <input type="radio" name="marketplace-variant" value={variant.id} checked={selectedVariantId === variant.id} onChange={() => { setSelectedVariantId(variant.id); setNotice(null); }} className="mt-1 accent-[#00D4A3]" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[#08205B]">
                            {variant.attributeValues.length
                              ? variant.attributeValues.map((selection) => `${selection.attributeName}: ${selection.value}`).join(' · ')
                              : 'Available variant'}
                          </span>
                          <span className="mt-1 block text-xs text-[#64748B]">SKU {variant.sku}</span>
                        </span>
                        <span className="text-sm font-bold text-[#08205B]">{formatMoney(variant.priceMinor, variant.currency)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">No options are currently available.</p>
                )}
              </fieldset>
            )}

            <label htmlFor="product-quantity" className="mt-6 block text-sm font-semibold text-white">Quantity</label>
            <input id="product-quantity" type="number" min={1} max={2147483647} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 min-h-11 w-28 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[#08205B] outline-none focus:border-[#00D4A3]" />
            {error && <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>}
            {notice && <p role="status" className="mt-4 text-sm font-semibold text-[#00D4A3]">{notice} <Link href="/marketplace/cart" className="underline">View cart</Link></p>}
            <div className="mt-6">
              {authLoading ? (
                <p className="text-sm text-[#E8EEF6]/65">Checking your session…</p>
              ) : isAuthenticated ? (
                <button type="button" onClick={() => void addToCart()} disabled={adding || !pricingAvailable || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647 || (product.hasVariants && (!selectedVariant || product.variants.length === 0))} className={actionClass}>
                  {adding ? 'Adding…' : 'Add to cart'}
                </button>
              ) : (
                <Link href="/login" className={actionClass}>Sign in to add to cart</Link>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </PageFrame>
  );
}

export function MarketplaceCartPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [cart, setCart] = useState<MarketplaceCart | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [deliveryAddresses, setDeliveryAddresses] = useState<MarketplaceCustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCart(await api.marketplaceCart());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void loadCart();
    else if (!authLoading) setLoading(false);
  }, [authLoading, isAuthenticated, loadCart]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setDeliveryAddresses([]);
      setSelectedAddressId('');
      setAddressError(null);
      setAddressesLoading(false);
      return;
    }

    let active = true;
    setAddressesLoading(true);
    setAddressError(null);

    api.getMarketplaceCustomerAddresses()
      .then((addresses) => {
        if (!active) return;

        setDeliveryAddresses(addresses);
        setSelectedAddressId((current) => {
          if (current && addresses.some((address) => address.id === current)) {
            return current;
          }

          return addresses.find((address) => address.isDefault)?.id
            ?? addresses[0]?.id
            ?? '';
        });
      })
      .catch((loadError: unknown) => {
        if (active) setAddressError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated]);

  async function updateQuantity(item: MarketplaceCartItem) {
    const quantity = Number(quantities[item.id] ?? item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    setBusyItemId(item.id);
    setError(null);
    try {
      setCart(await api.updateMarketplaceCartItem(item.id, quantity));
      setQuantities((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    setBusyItemId(itemId);
    setError(null);
    try {
      await api.removeMarketplaceCartItem(itemId);
      await loadCart();
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusyItemId(null);
    }
  }

  async function clearCart() {
    setClearing(true);
    setError(null);
    try {
      await api.clearMarketplaceCart();
      setCart({ id: cart?.id ?? null, items: [] });
      setQuantities({});
    } catch (clearError) {
      setError(errorMessage(clearError));
    } finally {
      setClearing(false);
    }
  }

  async function checkout() {
    if (checkingOut || !cart?.items.length) return;

    if (!selectedAddressId) {
      setError('Select a delivery address before continuing to payment.');
      return;
    }

    setCheckingOut(true);
    setError(null);

    try {
      // The server creates or reuses the pending order and calculates its prices.
      const order = await api.checkoutMarketplaceCart({
        customerAddressId: selectedAddressId,
      });
      const intent = await api.createMarketplacePaymentIntent(order.id);
      const checkoutUrl = intent.checkout?.url;

      if (!checkoutUrl) {
        throw new Error(
          'The payment provider did not return a checkout link. Your order may still be pending; please try again.',
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(checkoutUrl);
      } catch {
        throw new Error('The payment provider returned an invalid checkout link.');
      }

      if (parsedUrl.protocol !== 'https:') {
        throw new Error(
          'The payment provider returned an unsupported checkout link. Secure HTTPS is required.',
        );
      }

      window.location.assign(parsedUrl.toString());
    } catch (checkoutError) {
      setError(errorMessage(checkoutError));
      setCheckingOut(false);
    }
  }

  return (
    <PageFrame>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#00D4A3]">Your selections</p><h1 className="text-4xl font-extrabold text-white">Shopping cart</h1></div>
        {isAuthenticated && cart?.items.length ? <button type="button" onClick={() => void clearCart()} disabled={clearing} className={mutedActionClass}>{clearing ? 'Clearing…' : 'Clear cart'}</button> : null}
      </div>
      {authLoading || loading ? (
        <p className="text-sm text-[#E8EEF6]/70" role="status">Loading cart…</p>
      ) : !isAuthenticated ? (
        <div className={panelClass}><h2 className="text-xl font-bold text-white">Sign in to view your cart</h2><Link href="/login" className={`${actionClass} mt-5`}>Sign in</Link></div>
      ) : error && !cart ? (
        <ErrorPanel message={error} retry={() => void loadCart()} />
      ) : (
        <>
          {error && <p role="alert" className="mb-5 text-sm text-rose-200">{error}</p>}
          {cart?.items.length ? (
            <>
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <CartLine key={item.id} item={item} quantity={quantities[item.id] ?? String(item.quantity)} busy={busyItemId === item.id} onQuantityChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} onUpdate={() => void updateQuantity(item)} onRemove={() => void removeItem(item.id)} />
                ))}
              </div>
              <section className={`${panelClass} mt-6`} aria-labelledby="delivery-address-heading">
                <h2 id="delivery-address-heading" className="text-lg font-bold text-white">Delivery address</h2>
                <p className="mt-1 text-sm text-[#E8EEF6]/70">Choose where your order should be delivered.</p>

                {addressesLoading ? (
                  <p className="mt-4 text-sm text-[#E8EEF6]/70" role="status">Loading saved addresses…</p>
                ) : addressError ? (
                  <p className="mt-4 text-sm text-rose-200" role="alert">{addressError}</p>
                ) : deliveryAddresses.length === 0 ? (
                  <p className="mt-4 text-sm text-amber-200">
                    No saved delivery addresses were found. Add an enabled address to your customer account before checkout.
                  </p>
                ) : (
                  <label className="mt-4 block text-sm font-semibold text-[#E8EEF6]">
                    Select address
                    <select
                      value={selectedAddressId}
                      onChange={(event) => {
                        setSelectedAddressId(event.target.value);
                        setAddressError(null);
                        setError(null);
                      }}
                      className="mt-2 block min-h-12 w-full rounded-xl border border-white/20 bg-[#08205B] px-3 py-2 text-sm text-white outline-none focus:border-[#00D4A3]"
                    >
                      <option value="">Choose a delivery address</option>
                      {deliveryAddresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label?.trim()
                            ? `${address.label} — ${address.addressLine1}, ${address.city}, ${address.countryCode}`
                            : `${address.recipientName} — ${address.addressLine1}, ${address.city}, ${address.countryCode}`}
                          {address.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
              <div className={`${panelClass} mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
                <div>
                  <h2 className="text-lg font-bold text-white">Ready to place your order?</h2>
                  <p className="mt-1 text-sm text-[#E8EEF6]/70">
                    Review your order and continue to secure payment.
                    Final prices are confirmed by CHIMZO at checkout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void checkout()}
                  disabled={
                    checkingOut || clearing || Boolean(busyItemId) ||
                    addressesLoading || deliveryAddresses.length === 0 ||
                    !selectedAddressId
                  }
                  className={actionClass}
                >
                  {checkingOut ? 'Preparing checkout…' : 'Proceed to checkout'}
                </button>
              </div>
            </>
          ) : (
            <div className={panelClass}><h2 className="text-xl font-bold text-white">Your cart is empty</h2><p className="mt-2 text-sm text-[#E8EEF6]/70">Explore products and add an item to get started.</p><Link href="/marketplace" className={`${actionClass} mt-5`}>Browse products</Link></div>
          )}
        </>
      )}
    </PageFrame>
  );
}

function CartLine({
  item,
  quantity,
  busy,
  onQuantityChange,
  onUpdate,
  onRemove,
}: {
  item: MarketplaceCartItem;
  quantity: string;
  busy: boolean;
  onQuantityChange: (value: string) => void;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  return (
    <article className={`${panelClass} flex flex-col gap-5 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1">
        <Link href={`/marketplace/products/${encodeURIComponent(item.productId)}`} className="text-lg font-bold text-white hover:text-[#00D4A3]">{item.productName}</Link>
        {item.variantAttributes.length > 0 && <p className="mt-2 text-sm text-[#E8EEF6]/65">{item.variantAttributes.map((attribute) => `${attribute.attributeName}: ${attribute.value}`).join(' · ')}</p>}
        {item.sku && <p className="mt-1 text-xs text-[#E8EEF6]/45">SKU {item.sku}</p>}
        <p className="mt-3 text-sm text-[#E8EEF6]/70">{formatMoney(item.unitPriceMinor, item.currency)} each</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[#E8EEF6]/70">Quantity<input type="number" min={1} max={2147483647} step={1} value={quantity} onChange={(event) => onQuantityChange(event.target.value)} className="mt-1 block min-h-10 w-24 rounded-lg border border-white/20 bg-[#08205B] px-3 text-sm text-white outline-none focus:border-[#00D4A3]" /></label>
        <button type="button" onClick={onUpdate} disabled={busy || Number(quantity) === item.quantity} className={mutedActionClass}>Update</button>
        <button type="button" onClick={onRemove} disabled={busy} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-rose-200 hover:bg-rose-300/10">Remove</button>
        <p className="min-w-28 text-right text-base font-extrabold text-white">{formatMoney(item.lineTotalMinor, item.currency)}</p>
      </div>
    </article>
  );
}
