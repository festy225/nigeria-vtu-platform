'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import SellerMembershipGate from '../SellerMembershipGate';
import {
  api,
  ApiError,
  type SellerApplication,
  type SellerApplicationType,
  type SellerType,
} from '@/lib/api';
import { Badge, Button, Card } from '@/components/ui/primitives';
import {
  ErrorState,
  LoadingState,
} from '@/components/ui/loading-state';
import { useAuth } from '@/components/providers/auth-provider';

const sellerTypes: {
  value: SellerApplicationType;
  label: string;
  description: string;
}[] = [
  {
    value: 'RETAILER',
    label: 'Retailer',
    description: 'Sell products directly to customers.',
  },
];

type FormField =
  | 'sellerType'
  | 'businessName'
  | 'storeName'
  | 'storeSlug'
  | 'businessDescription'
  | 'businessRegistrationStatus'
  | 'cacRegistrationNumber'
  | 'businessEmail'
  | 'businessPhone'
  | 'businessAddress'
  | 'productsServicesDescription'
  | 'productCategories';
type FieldErrors = Partial<Record<FormField, string>>;

function getApiMessage(error: ApiError) {
  return error.errors?.[0] ?? error.message;
}

function applicationStatusLabel(status: SellerApplication['onboarding_status']) {
  const labels: Record<SellerApplication['onboarding_status'], string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    UNDER_REVIEW: 'Under review',
    MORE_INFORMATION_REQUIRED: 'More information required',
    APPROVED: 'Approved',
    SUSPENDED: 'Suspended',
    REJECTED: 'Rejected',
  };

  return labels[status];
}

function kycStatusLabel(status: SellerApplication['kyc_status']) {
  const labels: Record<SellerApplication['kyc_status'], string> = {
    PENDING: 'Pending',
    IN_REVIEW: 'In review',
    VERIFIED: 'Verified',
    REJECTED: 'Rejected',
  };

  return labels[status];
}

function sellerTypeLabel(type: SellerType) {
  return sellerTypes.find((sellerType) => sellerType.value === type)?.label ?? type;
}

function applicationTone(status: SellerApplication['onboarding_status']) {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'danger';
  if (status === 'UNDER_REVIEW' || status === 'MORE_INFORMATION_REQUIRED') {
    return 'warning';
  }
  return 'neutral';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
  }).format(date);
}

function isMissingApplication(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

function isExistingApplicationError(error: ApiError) {
  const message = getApiMessage(error).toLowerCase();
  return (
    message.includes('seller application already exists') ||
    message.includes('application already exists')
  );
}

function isDuplicateStoreSlugError(error: ApiError) {
  const message = getApiMessage(error).toLowerCase();
  return (
    error.status === 409 &&
    message.includes('store slug') &&
    (message.includes('already in use') ||
      message.includes('already exists') ||
      message.includes('already taken'))
  );
}

export default function SellerApplicationPage() {
  const { refreshUser } = useAuth();
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sellerType, setSellerType] = useState<SellerApplicationType | ''>('');
  const [businessName, setBusinessName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [businessRegistrationStatus, setBusinessRegistrationStatus] =
    useState<'REGISTERED' | 'UNREGISTERED' | 'IN_PROGRESS'>('UNREGISTERED');
  const [cacRegistrationNumber, setCacRegistrationNumber] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [productsServicesDescription, setProductsServicesDescription] = useState('');
  const [productCategories, setProductCategories] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sellerMembershipVerified, setSellerMembershipVerified] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadApplication() {
      setLoading(true);
      setPageError('');

      try {
        const result = await api.getSellerApplication();
        if (active) {
          setApplication(result);
          setSellerType(result.seller_type === 'RETAILER' ? 'RETAILER' : '');
          setBusinessName(result.business_name ?? '');
          setStoreName(result.store_name ?? '');
          setStoreSlug(result.store_slug ?? '');
          setBusinessDescription(result.business_description ?? '');
          setBusinessRegistrationStatus(
            result.business_registration_status ?? 'UNREGISTERED',
          );
          setCacRegistrationNumber(result.cac_registration_number ?? '');
          setBusinessEmail(result.business_email ?? '');
          setBusinessPhone(result.business_phone ?? '');
          setBusinessAddress(result.business_address ?? '');
          setProductsServicesDescription(
            result.products_services_description ?? '',
          );
          setProductCategories((result.product_categories ?? []).join(', '));
        }
      } catch (caught) {
        if (!active) return;

        if (isMissingApplication(caught)) {
          setApplication(null);

          try {
            const eligibility = await api.getSellerApplicationEligibility();
            if (active) {
              setSellerMembershipVerified(eligibility.eligible);
            }
          } catch (eligibilityError) {
            if (active) {
              setPageError(
                eligibilityError instanceof ApiError
                  ? getApiMessage(eligibilityError)
                  : "Unable to verify seller membership eligibility. Please try again.",
              );
            }
          }
        } else {
          setPageError(
            caught instanceof ApiError
              ? getApiMessage(caught)
              : 'Unable to load your seller application. Please try again.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadApplication();

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  function validateForm(): FieldErrors {
    const errors: FieldErrors = {};
    const required = (value: string, field: FormField, label: string, min: number, max: number) => {
      const trimmed = value.trim();
      if (!trimmed) errors[field] = `${label} is required.`;
      else if (trimmed.length < min || trimmed.length > max) {
        errors[field] = `${label} must be between ${min} and ${max} characters.`;
      }
    };

    if (!sellerType) errors.sellerType = 'Choose a business type.';
    required(businessName, 'businessName', 'Business name', 2, 200);
    required(storeName, 'storeName', 'Store name', 2, 200);
    required(businessDescription, 'businessDescription', 'Business description', 20, 3000);
    required(businessPhone, 'businessPhone', 'Business phone', 7, 40);
    required(businessAddress, 'businessAddress', 'Business address', 10, 1000);
    required(productsServicesDescription, 'productsServicesDescription', 'Products and services description', 20, 3000);

    const slug = storeSlug.trim();
    if (slug && (slug.length < 2 || slug.length > 220 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
      errors.storeSlug = 'Use 2–220 lowercase letters or numbers, separated by single hyphens.';
    }

    if (businessEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail.trim())) {
      errors.businessEmail = 'Enter a valid business email address.';
    }

    if (businessRegistrationStatus === 'REGISTERED' && !cacRegistrationNumber.trim()) {
      errors.cacRegistrationNumber = 'CAC registration number is required for a registered business.';
    }

    const categories = productCategories.split(',').map((item) => item.trim()).filter(Boolean);
    if (!categories.length) errors.productCategories = 'Enter at least one product or service category.';
    else if (categories.length > 30) errors.productCategories = 'Enter no more than 30 categories.';

    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !sellerType) return;

    setSubmitting(true);

    try {
      const payload = {
        sellerType,
        businessName: businessName.trim(),
        storeName: storeName.trim(),
        ...(storeSlug.trim() ? { storeSlug: storeSlug.trim() } : {}),
        businessDescription: businessDescription.trim(),
        businessRegistrationStatus,
        ...(cacRegistrationNumber.trim()
          ? { cacRegistrationNumber: cacRegistrationNumber.trim() }
          : {}),
        ...(businessEmail.trim() ? { businessEmail: businessEmail.trim() } : {}),
        businessPhone: businessPhone.trim(),
        businessAddress: businessAddress.trim(),
        productsServicesDescription: productsServicesDescription.trim(),
        productCategories: productCategories
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      const result = application
        ? await api.updateSellerApplication(payload)
        : await api.createSellerApplication(payload);

      setApplication(result);
      setSubmittedSuccessfully(false);

      // Application creation has succeeded. A session refresh failure
      // must not make the user believe that submission failed.
      try {
        await refreshUser();
      } catch {
        // Keep the successful application state visible.
      }
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        isDuplicateStoreSlugError(caught)
      ) {
        setFieldErrors((current) => ({
          ...current,
          storeSlug: getApiMessage(caught),
        }));
      } else if (
        caught instanceof ApiError &&
        isExistingApplicationError(caught)
      ) {
        try {
          const existing = await api.getSellerApplication();
          setApplication(existing);
          setSubmittedSuccessfully(false);
        } catch (loadError) {
          setFormError(
            isMissingApplication(loadError)
              ? getApiMessage(caught)
              : loadError instanceof ApiError
                ? getApiMessage(loadError)
                : 'An application may already exist, but we could not load it. Please try again.',
          );
        }
      } else {
        setFormError(
          caught instanceof ApiError
            ? getApiMessage(caught)
            : 'Unable to submit your application. Please try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading your seller application..." />;

  if (pageError) {
    return (
      <div className="space-y-4" role="alert">
        <ErrorState message={pageError} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (
    application &&
    !['DRAFT', 'MORE_INFORMATION_REQUIRED'].includes(application.onboarding_status)
  ) {
    return (
      <div className="space-y-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">
            Business
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Become a Seller
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Create your seller profile and start building your business on CHIMZO.
          </p>
        </header>

        <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {submittedSuccessfully && (
                <Badge tone="success">Application submitted</Badge>
              )}
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                {submittedSuccessfully
                  ? 'Application submitted'
                  : 'Your seller application'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {submittedSuccessfully
                  ? 'Your application is now awaiting review. Weâ€™ll update you when its status changes.'
                  : 'Your seller application is already on file.'}
              </p>
            </div>
            <Badge tone={applicationTone(application.onboarding_status)}>
              {applicationStatusLabel(application.onboarding_status)}
            </Badge>
          </div>

          <dl className="mt-7 grid gap-x-8 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Business name
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {application.business_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Store name
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {application.store_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Business type
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {sellerTypeLabel(application.seller_type)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Store slug
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {application.store_slug}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                KYC status
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {kycStatusLabel(application.kyc_status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Submitted date
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {formatDate(application.created_at)}
              </dd>
            </div>
          </dl>

          {application.onboarding_status === 'APPROVED' &&
            application.kyc_status === 'VERIFIED' && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <Link
                  href="/dashboard/business/seller/dashboard"
                  className="inline-flex items-center justify-center rounded-lg bg-[#08205B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#123477]"
                >
                  Open Seller Dashboard
                </Link>
              </div>
            )}
        </Card>
      </div>
    );
  }

  if (!sellerMembershipVerified && !application) {
    return (
      <SellerMembershipGate
        onVerified={async () => {
          await refreshUser();
          setSellerMembershipVerified(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">
          Business
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Become a Seller
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Create your seller profile and start building your business on CHIMZO.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="space-y-6">
        <fieldset disabled={submitting} className="space-y-6">
          <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#155EEF]">
                Step 1
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                Choose business type
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Wholesaler and Distributor are membership upgrades for existing eligible seller accounts, not separate applications.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Business type"
              aria-describedby={fieldErrors.sellerType ? 'seller-type-error' : undefined}
              className="mt-5 grid gap-3 sm:grid-cols-2"
            >
              {sellerTypes.map((type) => {
                const selected = sellerType === type.value;
                return (
                  <label
                    key={type.value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-[#155EEF]/30 ${
                      selected
                        ? 'border-[#155EEF] bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sellerType"
                      value={type.value}
                      checked={selected}
                      onChange={() => {
                        setSellerType(type.value);
                        setFieldErrors((current) => ({
                          ...current,
                          sellerType: undefined,
                        }));
                      }}
                      required
                      className="mt-1 h-4 w-4 accent-[#155EEF]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">
                        {type.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {type.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {fieldErrors.sellerType && (
              <p id="seller-type-error" className="mt-2 text-sm text-rose-600">
                {fieldErrors.sellerType}
              </p>
            )}
          </Card>

          <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#155EEF]">
                Step 2
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                Business information
              </h2>
            </div>

            <div className="mt-5 grid gap-5">
              <div>
                <label htmlFor="businessName" className="mb-2 block text-sm font-medium text-slate-700">
                  Business name
                </label>
                <input
                  id="businessName"
                  name="businessName"
                  type="text"
                  value={businessName}
                  onChange={(event) => {
                    setBusinessName(event.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      businessName: undefined,
                    }));
                  }}
                  required
                  minLength={2}
                  maxLength={200}
                  aria-invalid={Boolean(fieldErrors.businessName)}
                  aria-describedby={fieldErrors.businessName ? 'business-name-error' : undefined}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                    fieldErrors.businessName
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-[#155EEF] focus:ring-[#155EEF]/20'
                  }`}
                />
                {fieldErrors.businessName && (
                  <p id="business-name-error" className="mt-2 text-sm text-rose-600">
                    {fieldErrors.businessName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="storeName" className="mb-2 block text-sm font-medium text-slate-700">
                  Store name
                </label>
                <input
                  id="storeName"
                  name="storeName"
                  type="text"
                  value={storeName}
                  onChange={(event) => {
                    setStoreName(event.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      storeName: undefined,
                    }));
                  }}
                  required
                  minLength={2}
                  maxLength={200}
                  aria-invalid={Boolean(fieldErrors.storeName)}
                  aria-describedby={fieldErrors.storeName ? 'store-name-error' : undefined}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                    fieldErrors.storeName
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-[#155EEF] focus:ring-[#155EEF]/20'
                  }`}
                />
                {fieldErrors.storeName && (
                  <p id="store-name-error" className="mt-2 text-sm text-rose-600">
                    {fieldErrors.storeName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="storeSlug" className="mb-2 block text-sm font-medium text-slate-700">
                  Store slug <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="storeSlug"
                  name="storeSlug"
                  type="text"
                  value={storeSlug}
                  onChange={(event) => {
                    setStoreSlug(event.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      storeSlug: undefined,
                    }));
                  }}
                  maxLength={220}
                  aria-invalid={Boolean(fieldErrors.storeSlug)}
                  aria-describedby={
                    fieldErrors.storeSlug ? 'store-slug-error store-slug-preview' : 'store-slug-preview'
                  }
                  placeholder="your-store-slug"
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                    fieldErrors.storeSlug
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-[#155EEF] focus:ring-[#155EEF]/20'
                  }`}
                />
                {fieldErrors.storeSlug && (
                  <p id="store-slug-error" className="mt-2 text-sm text-rose-600">
                    {fieldErrors.storeSlug}
                  </p>
                )}
                <p id="store-slug-preview" className="mt-2 text-xs text-slate-500">
                  Preview: <span className="font-medium text-slate-700">{storeSlug.trim() || 'your-store-slug'}</span>
                </p>
              </div>

              <div>
                <label htmlFor="businessDescription" className="mb-2 block text-sm font-medium text-slate-700">
                  Business description
                </label>
                <textarea
                  id="businessDescription"
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                {fieldErrors.businessDescription && <p className="mt-2 text-sm text-rose-600">{fieldErrors.businessDescription}</p>}
              </div>

              <div>
                <label htmlFor="businessRegistrationStatus" className="mb-2 block text-sm font-medium text-slate-700">
                  Business registration status
                </label>
                <select
                  id="businessRegistrationStatus"
                  value={businessRegistrationStatus}
                  onChange={(e) => setBusinessRegistrationStatus(e.target.value as typeof businessRegistrationStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                >
                  <option value="UNREGISTERED">Not registered</option>
                  <option value="REGISTERED">CAC registered</option>
                  <option value="IN_PROGRESS">Registration in progress</option>
                </select>
              </div>

              {businessRegistrationStatus === 'REGISTERED' && (
                <div>
                  <label htmlFor="cacRegistrationNumber" className="mb-2 block text-sm font-medium text-slate-700">
                    CAC registration number
                  </label>
                  <input
                    id="cacRegistrationNumber"
                    value={cacRegistrationNumber}
                    onChange={(e) => setCacRegistrationNumber(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                  />
                  {fieldErrors.cacRegistrationNumber && <p className="mt-2 text-sm text-rose-600">{fieldErrors.cacRegistrationNumber}</p>}
                </div>
              )}

              <div>
                <label htmlFor="businessEmail" className="mb-2 block text-sm font-medium text-slate-700">
                  Business email (optional)
                </label>
                <input
                  id="businessEmail"
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                {fieldErrors.businessEmail && <p className="mt-2 text-sm text-rose-600">{fieldErrors.businessEmail}</p>}
              </div>

              <div>
                <label htmlFor="businessPhone" className="mb-2 block text-sm font-medium text-slate-700">
                  Business phone
                </label>
                <input
                  id="businessPhone"
                  type="tel"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                {fieldErrors.businessPhone && <p className="mt-2 text-sm text-rose-600">{fieldErrors.businessPhone}</p>}
              </div>

              <div>
                <label htmlFor="businessAddress" className="mb-2 block text-sm font-medium text-slate-700">
                  Business address
                </label>
                <textarea
                  id="businessAddress"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                {fieldErrors.businessAddress && <p className="mt-2 text-sm text-rose-600">{fieldErrors.businessAddress}</p>}
              </div>

              <div>
                <label htmlFor="productsServicesDescription" className="mb-2 block text-sm font-medium text-slate-700">
                  Products and services description
                </label>
                <textarea
                  id="productsServicesDescription"
                  value={productsServicesDescription}
                  onChange={(e) => setProductsServicesDescription(e.target.value)}
                  rows={4}
                  maxLength={3000}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                {fieldErrors.productsServicesDescription && <p className="mt-2 text-sm text-rose-600">{fieldErrors.productsServicesDescription}</p>}
              </div>

              <div>
                <label htmlFor="productCategories" className="mb-2 block text-sm font-medium text-slate-700">
                  Product and service categories
                </label>
                <input
                  id="productCategories"
                  value={productCategories}
                  onChange={(e) => setProductCategories(e.target.value)}
                  placeholder="Electronics, clothing, groceries"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">Separate categories with commas.</p>
                {fieldErrors.productCategories && <p className="mt-2 text-sm text-rose-600">{fieldErrors.productCategories}</p>}
              </div>
            </div>
          </Card>
        </fieldset>

        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </div>
        )}

        <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
          {submitting ? 'Saving draft...' : 'Save Draft'}
        </Button>
      </form>
    </div>
  );
}
