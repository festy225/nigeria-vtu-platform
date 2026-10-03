'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  ApiError,
  api,
  type MarketplaceCart,
  type MarketplaceCartItem,
  type MarketplaceProduct,
  type MarketplaceProductDetail,
} from '@/lib/api';

const pageClass =
  'min-h-screen bg-[#08205B] text-[#E8EEF6] [font-family:var(--font-sora),Arial,sans-serif]';
const panelClass = 'rounded-3xl border border-white/10 bg-white/[0.06] p-6';
const actionClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#00D4A3] px-5 py-2.5 text-sm font-bold text-[#08205B] transition hover:bg-[#63f0cf] disabled:cursor-not-allowed disabled:opacity-50';
const mutedActionClass =
  'inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-[#E8EEF6] transition hover:border-[#00D4A3] hover:text-[#00D4A3] disabled:cursor-not-allowed disabled:opacity-50';

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
      <header className="border-b border-white/10 bg-[#08205B]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/marketplace" className="flex items-center gap-3" aria-label="CHIMZO marketplace home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#00D4A3] text-lg font-black text-[#08205B]">C</span>
            <span className="text-lg font-extrabold tracking-tight text-white">CHIMZO</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6" aria-label="Marketplace">
            <Link href="/marketplace" className="text-sm font-semibold text-[#E8EEF6] hover:text-[#00D4A3]">Discover</Link>
            <Link href="/marketplace/cart" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-[#00D4A3] hover:text-[#00D4A3]">Cart</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>
    </main>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className={`${panelClass} border-amber-300/30`}>
      <p className="text-lg font-bold text-white">{message}</p>
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
      <section className="mb-10 max-w-3xl">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#00D4A3]">CHIMZO marketplace</p>
        <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">Discover products made for you.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#E8EEF6]/75">Browse seller listings and explore each product’s configured options.</p>
      </section>
      {loading ? (
        <p className="text-sm text-[#E8EEF6]/70" role="status">Loading products…</p>
      ) : error ? (
        <ErrorPanel message={error} retry={() => void loadProducts()} />
      ) : products.length === 0 ? (
        <div className={panelClass}><h2 className="text-xl font-bold text-white">No products available yet</h2><p className="mt-2 text-sm text-[#E8EEF6]/70">Please check back later.</p></div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Marketplace products">
          {products.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06]">
              <div className="flex h-40 items-end bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#2F80ED]/50 via-[#08205B] to-[#08205B] p-5">
                <span className="rounded-full border border-white/20 bg-[#08205B]/60 px-3 py-1 text-xs font-semibold text-[#E8EEF6]">{product.categoryName}</span>
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#00D4A3]">{product.sellerName}</p>
                <h2 className="mt-2 text-xl font-bold text-white">{product.name}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#E8EEF6]/70">{product.description}</p>
                <div className="mt-5 flex min-h-11 items-center justify-between gap-3">
                  <p className="font-bold text-white">
                    {product.hasVariants
                      ? 'Options available'
                      : product.priceMinor !== null && product.currency
                        ? formatMoney(product.priceMinor, product.currency)
                        : 'Price unavailable'}
                  </p>
                  <Link href={`/marketplace/products/${encodeURIComponent(product.id)}`} className="text-sm font-bold text-[#00D4A3] hover:text-white">View details →</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
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
      <p className="mb-6 text-sm text-[#E8EEF6]/60"><Link href="/marketplace" className="hover:text-[#00D4A3]">Discover</Link><span className="px-2">/</span>Product details</p>
      {loading ? (
        <p className="text-sm text-[#E8EEF6]/70" role="status">Loading product…</p>
      ) : error && !product ? (
        <ErrorPanel message={error} retry={() => void loadProduct()} />
      ) : product ? (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex min-h-72 items-end rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#2F80ED]/50 via-[#08205B] to-[#08205B] p-7">
            <span className="rounded-full border border-white/20 bg-[#08205B]/70 px-4 py-2 text-sm font-semibold text-white">{product.categoryName}</span>
          </div>
          <section className={panelClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00D4A3]">{product.sellerName}</p>
            <h1 className="mt-3 text-3xl font-extrabold text-white">{product.name}</h1>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#E8EEF6]/75">{product.description}</p>
            <p className="mt-6 text-2xl font-extrabold text-white">
              {pricingAvailable ? formatMoney(priceMinor, currency) : 'Price unavailable'}
            </p>

            {product.hasVariants && (
              <fieldset className="mt-7">
                <legend className="mb-3 text-sm font-bold text-white">Choose an available option</legend>
                {product.variants.length ? (
                  <div className="space-y-2">
                    {product.variants.map((variant) => (
                      <label key={variant.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selectedVariantId === variant.id ? 'border-[#00D4A3] bg-[#00D4A3]/10' : 'border-white/15 hover:border-white/35'}`}>
                        <input type="radio" name="marketplace-variant" value={variant.id} checked={selectedVariantId === variant.id} onChange={() => { setSelectedVariantId(variant.id); setNotice(null); }} className="mt-1 accent-[#00D4A3]" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-white">
                            {variant.attributeValues.length
                              ? variant.attributeValues.map((selection) => `${selection.attributeName}: ${selection.value}`).join(' · ')
                              : 'Available variant'}
                          </span>
                          <span className="mt-1 block text-xs text-[#E8EEF6]/55">SKU {variant.sku}</span>
                        </span>
                        <span className="text-sm font-bold text-white">{formatMoney(variant.priceMinor, variant.currency)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">No options are currently available.</p>
                )}
              </fieldset>
            )}

            <label htmlFor="product-quantity" className="mt-6 block text-sm font-semibold text-white">Quantity</label>
            <input id="product-quantity" type="number" min={1} max={2147483647} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 min-h-11 w-28 rounded-xl border border-white/20 bg-[#08205B] px-3 text-white outline-none focus:border-[#00D4A3]" />
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
            <div className="space-y-4">
              {cart.items.map((item) => (
                <CartLine key={item.id} item={item} quantity={quantities[item.id] ?? String(item.quantity)} busy={busyItemId === item.id} onQuantityChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} onUpdate={() => void updateQuantity(item)} onRemove={() => void removeItem(item.id)} />
              ))}
            </div>
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
