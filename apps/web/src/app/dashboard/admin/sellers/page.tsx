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
  type SellerApplicationReviewDecision,
  type SellerType,
} from '@/lib/api';

const sellerTypes: { value: SellerType; label: string }[] = [
  { value: 'RETAILER', label: 'Retailer' },
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
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [reviewingApplicationId, setReviewingApplicationId] = useState<string | null>(null);
  const [applicationDetails, setApplicationDetails] = useState<Record<string, SellerApplication>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [documentReviewErrors, setDocumentReviewErrors] = useState<Record<string, string>>({});
  const [documentDownloadErrors, setDocumentDownloadErrors] = useState<Record<string, string>>({});
  const [reviewingDocumentId, setReviewingDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);

  async function loadApplicationDetails(applicationId: string) {
    if (applicationDetails[applicationId] || detailLoading[applicationId]) return;

    setDetailLoading((current) => ({ ...current, [applicationId]: true }));
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[applicationId];
      return next;
    });

    try {
      const result = await api.getAdminSellerApplication(applicationId);
      setApplicationDetails((current) => ({ ...current, [applicationId]: result }));
    } catch (caught) {
      setDetailErrors((current) => ({
        ...current,
        [applicationId]: loadErrorMessage(caught),
      }));
    } finally {
      setDetailLoading((current) => ({ ...current, [applicationId]: false }));
    }
  }

  async function reviewApplicationDocument(
    applicationId: string,
    documentId: string,
    decision: 'ACCEPTED' | 'REJECTED',
  ) {
    setReviewingDocumentId(documentId);
    setDocumentReviewErrors((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });

    try {
      const updated = await api.reviewSellerApplicationDocument(
        applicationId,
        documentId,
        {
          decision,
          note: documentNotes[documentId]?.trim() || undefined,
        },
      );

      setApplicationDetails((current) => {
        const detail = current[applicationId];
        if (!detail) return current;

        return {
          ...current,
          [applicationId]: {
            ...detail,
            documents: (detail.documents ?? []).map((document) =>
              document.id === documentId ? updated : document,
            ),
          },
        };
      });

      setDocumentNotes((current) => ({ ...current, [documentId]: '' }));
    } catch (caught) {
      setDocumentReviewErrors((current) => ({
        ...current,
        [documentId]:
          caught instanceof ApiError
            ? caught.errors?.[0] ?? caught.message
            : 'Document review failed. Please try again.',
      }));
    } finally {
      setReviewingDocumentId(null);
    }
  }

  async function downloadApplicationDocument(
    applicationId: string,
    documentId: string,
    filename: string,
  ) {
    setDownloadingDocumentId(documentId);
    setDocumentDownloadErrors((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });

    try {
      const blob = await api.downloadSellerApplicationDocument(
        applicationId,
        documentId,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setDocumentDownloadErrors((current) => ({
        ...current,
        [documentId]:
          caught instanceof ApiError
            ? caught.errors?.[0] ?? caught.message
            : 'Document download failed. Please try again.',
      }));
    } finally {
      setDownloadingDocumentId(null);
    }
  }

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

  async function submitApplicationReview(
    applicationId: string,
    decision: SellerApplicationReviewDecision,
  ) {
    setReviewingApplicationId(applicationId);
    setReviewErrors((current) => {
      const next = { ...current };
      delete next[applicationId];
      return next;
    });

    try {
      const result = await api.reviewSellerApplication(applicationId, {
        decision,
        reviewNote: reviewNotes[applicationId]?.trim() || undefined,
      });

      setApplications((current) =>
        current.map((application) =>
          application.id === applicationId
            ? { ...application, ...result }
            : application,
        ),
      );
      setReviewNotes((current) => ({ ...current, [applicationId]: '' }));
    } catch (caught) {
      setReviewErrors((current) => ({
        ...current,
        [applicationId]: loadErrorMessage(caught),
      }));
    } finally {
      setReviewingApplicationId(null);
    }
  }

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
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Seller applications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review submitted seller profiles and their current application and KYC statuses.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Back to CHIMZO Admin
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
            <h2 className="font-semibold text-slate-900">
              No seller applications yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
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
              <p className="py-8 text-center text-sm text-slate-600">
                No applications match your search or filters.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-sm text-slate-600" aria-live="polite">
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
                        <h2 className="break-words text-lg font-semibold text-slate-900">
                          {application.business_name}
                        </h2>
                        <p className="mt-1 break-words text-sm text-slate-600">
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

                    {['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED'].includes(application.onboarding_status) && (
                      <section className="mt-5 space-y-3 border-t border-slate-800 pt-4">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Review application
                        </h3>
                        <div>
                          <label htmlFor={`seller-review-note-${application.id}`} className="label">
                            Review note (optional)
                          </label>
                          <textarea
                            id={`seller-review-note-${application.id}`}
                            className="input min-h-24"
                            maxLength={2000}
                            value={reviewNotes[application.id] ?? ''}
                            disabled={reviewingApplicationId === application.id}
                            onChange={(event) => setReviewNotes((current) => ({
                              ...current,
                              [application.id]: event.target.value,
                            }))}
                            placeholder="Add an explanation or instructions for the applicant..."
                          />
                        </div>

                        {reviewErrors[application.id] && (
                          <p className="text-sm text-red-600" role="alert">
                            {reviewErrors[application.id]}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {application.onboarding_status === 'SUBMITTED' && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={reviewingApplicationId !== null}
                              onClick={() => void submitApplicationReview(application.id, 'START_REVIEW')}
                            >
                              Start review
                            </Button>
                          )}
                          <Button
                            type="button"
                            disabled={reviewingApplicationId !== null}
                            onClick={() => void submitApplicationReview(application.id, 'APPROVE')}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={reviewingApplicationId !== null}
                            onClick={() => void submitApplicationReview(application.id, 'MORE_INFORMATION_REQUIRED')}
                          >
                            Request more information
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={reviewingApplicationId !== null}
                            onClick={() => void submitApplicationReview(application.id, 'REJECT')}
                          >
                            Reject
                          </Button>
                        </div>
                      </section>
                    )}

                    <details
                      className="mt-4 border-t border-slate-200 pt-4"
                      onToggle={(event) => {
                        if (event.currentTarget.open) {
                          void loadApplicationDetails(application.id);
                        }
                      }}
                    >
                      <summary className="cursor-pointer text-sm font-semibold text-blue-700 hover:text-blue-800">
                        View business profile and verification documents
                      </summary>

                      {detailLoading[application.id] && (
                        <p className="mt-4 text-sm text-slate-600">
                          Loading application details...
                        </p>
                      )}

                      {detailErrors[application.id] && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-red-600" role="alert">
                            {detailErrors[application.id]}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void loadApplicationDetails(application.id)}
                          >
                            Try again
                          </Button>
                        </div>
                      )}

                      {applicationDetails[application.id] && (() => {
                        const detail = applicationDetails[application.id];

                        return (
                          <div className="mt-4 space-y-6">
                            <dl className="grid gap-4 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-xs text-slate-500">Application ID</dt>
                                <dd className="mt-1 break-all text-slate-800">{detail.id}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Store slug</dt>
                                <dd className="mt-1 break-all text-slate-800">{detail.store_slug}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Last updated</dt>
                                <dd className="mt-1 text-slate-800">{formatDate(detail.updated_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Business registration</dt>
                                <dd className="mt-1 text-slate-800">
                                  {detail.business_registration_status || 'Not provided'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">CAC registration number</dt>
                                <dd className="mt-1 text-slate-800">
                                  {detail.cac_registration_number || 'Not provided'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Business email</dt>
                                <dd className="mt-1 break-all text-slate-800">
                                  {detail.business_email || 'Not provided'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Business phone</dt>
                                <dd className="mt-1 text-slate-800">
                                  {detail.business_phone || 'Not provided'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500">Business address</dt>
                                <dd className="mt-1 text-slate-800">
                                  {detail.business_address || 'Not provided'}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-slate-500">Business description</dt>
                                <dd className="mt-1 whitespace-pre-wrap text-slate-800">
                                  {detail.business_description || 'Not provided'}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-slate-500">Products and services</dt>
                                <dd className="mt-1 whitespace-pre-wrap text-slate-800">
                                  {detail.products_services_description || 'Not provided'}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-slate-500">Product categories</dt>
                                <dd className="mt-1 text-slate-800">
                                  {detail.product_categories?.join(', ') || 'Not provided'}
                                </dd>
                              </div>
                            </dl>

                            <section className="space-y-4 border-t border-slate-200 pt-4">
                              <h3 className="font-semibold text-slate-900">
                                Verification documents ({detail.documents?.length ?? 0})
                              </h3>

                              {!detail.documents?.length ? (
                                <p className="text-sm text-slate-600">
                                  No documents have been uploaded for this application.
                                </p>
                              ) : (
                                detail.documents.map((document) => (
                                  <div
                                    key={document.id}
                                    className="space-y-3 rounded-lg border border-slate-200 p-4"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0">
                                        <p className="break-words text-sm font-semibold text-slate-900">
                                          {document.document_type.replace(/_/g, ' ')}
                                        </p>
                                        <p className="mt-1 break-all text-sm text-slate-700">
                                          {document.original_filename}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {document.mime_type} · {Math.ceil(document.size_bytes / 1024)} KB · Uploaded {formatDate(document.uploaded_at)}
                                        </p>
                                      </div>
                                      <Badge tone={
                                        document.verification_status === 'ACCEPTED'
                                          ? 'success'
                                          : document.verification_status === 'REJECTED'
                                            ? 'danger'
                                            : 'warning'
                                      }>
                                        {document.verification_status}
                                      </Badge>
                                    </div>

                                    {document.reviewer_note && (
                                      <p className="text-sm text-slate-600">
                                        Reviewer note: {document.reviewer_note}
                                      </p>
                                    )}

                                    {document.reviewed_at && (
                                      <p className="text-xs text-slate-500">
                                        Reviewed: {formatDate(document.reviewed_at)}
                                      </p>
                                    )}

                                    {documentDownloadErrors[document.id] && (
                                      <p className="text-sm text-red-600" role="alert">
                                        {documentDownloadErrors[document.id]}
                                      </p>
                                    )}

                                    {documentReviewErrors[document.id] && (
                                      <p className="text-sm text-red-600" role="alert">
                                        {documentReviewErrors[document.id]}
                                      </p>
                                    )}

                                    <Button
                                      type="button"
                                      variant="secondary"
                                      disabled={downloadingDocumentId === document.id}
                                      onClick={() => void downloadApplicationDocument(
                                        application.id,
                                        document.id,
                                        document.original_filename,
                                      )}
                                    >
                                      {downloadingDocumentId === document.id
                                        ? 'Downloading...'
                                        : 'Download document'}
                                    </Button>

                                    {document.verification_status === 'PENDING' && (
                                      <div className="space-y-3 border-t border-slate-100 pt-3">
                                        <label
                                          htmlFor={`document-note-${document.id}`}
                                          className="label"
                                        >
                                          Review note (optional)
                                        </label>
                                        <textarea
                                          id={`document-note-${document.id}`}
                                          className="input min-h-20"
                                          maxLength={2000}
                                          value={documentNotes[document.id] ?? ''}
                                          disabled={reviewingDocumentId === document.id}
                                          onChange={(event) => setDocumentNotes((current) => ({
                                            ...current,
                                            [document.id]: event.target.value,
                                          }))}
                                          placeholder="Explain the decision or identify any issue with this document..."
                                        />
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            disabled={reviewingDocumentId !== null}
                                            onClick={() => void reviewApplicationDocument(
                                              application.id,
                                              document.id,
                                              'ACCEPTED',
                                            )}
                                          >
                                            {reviewingDocumentId === document.id
                                              ? 'Saving...'
                                              : 'Accept document'}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={reviewingDocumentId !== null}
                                            onClick={() => void reviewApplicationDocument(
                                              application.id,
                                              document.id,
                                              'REJECTED',
                                            )}
                                          >
                                            Reject document
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </section>
                          </div>
                        );
                      })()}
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
