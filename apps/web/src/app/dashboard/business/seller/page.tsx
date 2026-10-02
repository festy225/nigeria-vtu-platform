'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type SellerApplication,
  type SellerType,
} from '@/lib/api';
import { Badge, Button, Card } from '@/components/ui/primitives';
import {
  ErrorState,
  LoadingState,
} from '@/components/ui/loading-state';

const sellerTypes: {
  value: SellerType;
  label: string;
  description: string;
}[] = [
  {
    value: 'RETAILER',
    label: 'Retailer',
    description: 'Sell products directly to customers.',
  },
  {
    value: 'VENDOR',
    label: 'Vendor',
    description: 'Operate a business store and sell products through CHIMZO.',
  },
  {
    value: 'WHOLESALER',
    label: 'Wholesaler',
    description: 'Sell products in larger quantities and support wholesale pricing.',
  },
  {
    value: 'DISTRIBUTOR',
    label: 'Distributor',
    description: 'Supply products at scale while also being able to sell directly.',
  },
];

type FormField = 'sellerType' | 'businessName' | 'storeName' | 'storeSlug';
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
    error.status === 409 ||
    message.includes('seller application already exists') ||
    message.includes('application already exists')
  );
}

export default function SellerApplicationPage() {
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sellerType, setSellerType] = useState<SellerType | ''>('');
  const [businessName, setBusinessName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadApplication() {
      setLoading(true);
      setPageError('');

      try {
        const result = await api.getSellerApplication();
        if (active) setApplication(result);
      } catch (caught) {
        if (!active) return;

        if (isMissingApplication(caught)) {
          setApplication(null);
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
    const trimmedBusinessName = businessName.trim();
    const trimmedStoreName = storeName.trim();
    const trimmedStoreSlug = storeSlug.trim();

    if (!sellerType) errors.sellerType = 'Choose a business type.';

    if (!trimmedBusinessName) {
      errors.businessName = 'Business name is required.';
    } else if (trimmedBusinessName.length < 2 || trimmedBusinessName.length > 200) {
      errors.businessName = 'Business name must be between 2 and 200 characters.';
    }

    if (!trimmedStoreName) {
      errors.storeName = 'Store name is required.';
    } else if (trimmedStoreName.length < 2 || trimmedStoreName.length > 200) {
      errors.storeName = 'Store name must be between 2 and 200 characters.';
    }

    if (trimmedStoreSlug) {
      if (trimmedStoreSlug.length < 2 || trimmedStoreSlug.length > 220) {
        errors.storeSlug = 'Store slug must be between 2 and 220 characters.';
      } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedStoreSlug)) {
        errors.storeSlug =
          'Use lowercase letters, numbers, and single hyphens between words.';
      }
    }

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
      const result = await api.createSellerApplication({
        sellerType,
        businessName: businessName.trim(),
        storeName: storeName.trim(),
        ...(storeSlug.trim() ? { storeSlug: storeSlug.trim() } : {}),
      });

      setApplication(result);
      setSubmittedSuccessfully(true);
    } catch (caught) {
      if (caught instanceof ApiError && isExistingApplicationError(caught)) {
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

  if (loading) return <LoadingState label="Loading your seller application…" />;

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

  if (application) {
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
                  ? 'Your application is now awaiting review. We’ll update you when its status changes.'
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
        </Card>
      </div>
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
          {submitting ? 'Submitting application...' : 'Submit seller application'}
        </Button>
      </form>
    </div>
  );
}
