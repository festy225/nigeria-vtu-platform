'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import {
  ErrorState,
  LoadingState,
} from '@/components/ui/loading-state';
import { Badge, Button, Card } from '@/components/ui/primitives';
import {
  api,
  ApiError,
  type SellerApplication,
  type SellerType,
} from '@/lib/api';

const sellerTypes: { value: SellerType; label: string }[] = [
  { value: 'RETAILER', label: 'Retailer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
];

const applicationStatuses: {
  value: SellerApplication['onboarding_status'];
  label: string;
}[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  {
    value: 'MORE_INFORMATION_REQUIRED',
    label: 'More information required',
  },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Rejected' },
];

const kycStatuses: {
  value: SellerApplication['kyc_status'];
  label: string;
}[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
];

function statusLabel(status: SellerApplication['onboarding_status']) {
  return applicationStatuses.find((item) => item.value === status)?.label ?? status;
}

function kycLabel(status: SellerApplication['kyc_status']) {
  return kycStatuses.find((item) => item.value === status)?.label ?? status;
}

function sellerTypeLabel(type: SellerType) {
  return sellerTypes.find((item) => item.value === type)?.label ?? type;
}

function statusTone(status: SellerApplication['onboarding_status']) {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'danger';
  if (status === 'UNDER_REVIEW' || status === 'MORE_INFORMATION_REQUIRED') {
    return 'warning';
  }
  return 'neutral';
}

function riskTone(status: SellerApplication['risk_status']) {
  if (status === 'NORMAL') return 'success';
  if (status === 'WATCH') return 'warning';
  return 'danger';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function loadErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status < 500) {
    return error.errors?.[0] ?? error.message;
  }

  return 'Unable to load seller applications right now. Please try again.';
}

function SellerApplicationsContent() {
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    SellerApplication['onboarding_status'] | ''
  >('');
  const [typeFilter, setTypeFilter] = useState<SellerType | ''>('');
  const [kycFilter, setKycFilter] = useState<
    SellerApplication['kyc_status'] | ''
  >('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadApplications() {
      setLoading(true);
      setError('');

      try {
        const result = await api.getSellerApplications();
        if (active) setApplications(result);
      } catch (caught) {
        if (active) setError(loadErrorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadApplications();

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesSearch =
        !query ||
        application.business_name.toLowerCase().includes(query) ||
        application.store_name.toLowerCase().includes(query);

      return (
        matchesSearch &&
        (!statusFilter || application.onboarding_status === statusFilter) &&
        (!typeFilter || application.seller_type === typeFilter) &&
        (!kycFilter || application.kyc_status === kycFilter)
      );
    });
  }, [applications, kycFilter, search, statusFilter, typeFilter]);

  if (loading) {
    return <LoadingState label="Loading seller applications..." />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">CHIMZO - Administration</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Seller applications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review submitted seller profiles and their current application and KYC statuses.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="text-sm font-medium text-brand-300 hover:text-brand-200"
        >
          Back to Admin workspace
        </Link>
      </header>

      {error ? (
        <div className="space-y-4">
          <ErrorState message={error} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Try again
          </Button>
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <h2 className="font-semibold text-white">
              No seller applications yet
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              There are currently no seller applications to review.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="seller-search" className="label">
                  Search
                </label>
                <input
                  id="seller-search"
                  type="search"
                  className="input"
                  placeholder="Business or store name"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="seller-status" className="label">
                  Application status
                </label>
                <select
                  id="seller-status"
                  className="input"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as SellerApplication['onboarding_status'] | '',
                    )
                  }
                >
                  <option value="">All statuses</option>
                  {applicationStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seller-type" className="label">
                  Seller type
                </label>
                <select
                  id="seller-type"
                  className="input"
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as SellerType | '')
                  }
                >
                  <option value="">All types</option>
                  {sellerTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seller-kyc" className="label">
                  KYC status
                </label>
                <select
                  id="seller-kyc"
                  className="input"
                  value={kycFilter}
                  onChange={(event) =>
                    setKycFilter(event.target.value as SellerApplication['kyc_status'] | '')
                  }
                >
                  <option value="">All KYC statuses</option>
                  {kycStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {filteredApplications.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-slate-400">
                No applications match your search or filters.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-sm text-slate-400" aria-live="polite">
                Showing {filteredApplications.length} of {applications.length}{' '}
                {applications.length === 1 ? 'application' : 'applications'}
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredApplications.map((application) => (
                  <Card
                    key={application.id}
                    className="min-w-0"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="break-words text-lg font-semibold text-white">
                          {application.business_name}
                        </h2>
                        <p className="mt-1 break-words text-sm text-slate-400">
                          {application.store_name}
                        </p>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {sellerTypeLabel(application.seller_type)}
                        </p>
                      </div>
                      <Badge tone={statusTone(application.onboarding_status)}>
                        {statusLabel(application.onboarding_status)}
                      </Badge>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-slate-500">KYC status</dt>
                        <dd className="mt-1">
                          <Badge
                            tone={
                              application.kyc_status === 'VERIFIED'
                                ? 'success'
                                : application.kyc_status === 'REJECTED'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {kycLabel(application.kyc_status)}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Risk status</dt>
                        <dd className="mt-1">
                          <Badge tone={riskTone(application.risk_status)}>
                            {application.risk_status.replace(/_/g, ' ')}
                          </Badge>
                        </dd>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="text-xs text-slate-500">Submitted</dt>
                        <dd className="mt-1 text-sm text-slate-300">
                          {formatDate(application.created_at)}
                        </dd>
                      </div>
                    </dl>

                    <details className="mt-4 border-t border-slate-800 pt-4">
                      <summary className="cursor-pointer text-sm font-medium text-brand-300 outline-none hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-brand-400">
                        View application details
                      </summary>
                      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-500">
                            Application ID
                          </dt>
                          <dd className="mt-1 break-all text-slate-300">
                            {application.id}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Store slug</dt>
                          <dd className="mt-1 break-all text-slate-300">
                            {application.store_slug}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Last updated</dt>
                          <dd className="mt-1 text-slate-300">
                            {formatDate(application.updated_at)}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function SellerApplicationsPage() {
  return (
    <ProtectedRoute roles={['SUPER_ADMIN']}>
      <SellerApplicationsContent />
    </ProtectedRoute>
  );
}
