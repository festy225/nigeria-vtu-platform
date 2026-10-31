'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type SellerMembershipProgram, type SellerMembershipPaymentStatus } from '@/lib/api';
import { Button, Card } from '@/components/ui/primitives';
import { LoadingState } from '@/components/ui/loading-state';

type BillingPeriod = 'MONTHLY' | 'ANNUAL';
const SELLER_MEMBERSHIP_PAYMENT_STORAGE_KEY = 'chimzo:seller-membership';

function getCode(program: SellerMembershipProgram) {
  return program.programCode ?? program.program_code ?? '';
}

function getName(program: SellerMembershipProgram) {
  return program.displayName ?? program.display_name ?? 'Seller membership';
}

function getPrice(program: SellerMembershipProgram, period: BillingPeriod) {
  const value = period === 'MONTHLY'
    ? program.monthlyPriceMinor ?? program.monthly_price_minor
    : program.annualPriceMinor ?? program.annual_price_minor;
  return Number(value ?? 0);
}

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function paymentState(status: SellerMembershipPaymentStatus) {
  const payment = status.payment as unknown as Record<string, unknown> | undefined;
  return String(
    payment?.state ?? payment?.payment_state ?? payment?.status ?? '',
  ).trim().toUpperCase();
}

export default function SellerMembershipGate({
  onVerified,
}: {
  onVerified: () => void;
}) {
  const [program, setProgram] = useState<SellerMembershipProgram | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [accepted, setAccepted] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [verifyRestoredPayment, setVerifyRestoredPayment] = useState(false);
  const restoredVerificationStarted = useRef(false);
  const paymentCheckInFlight = useRef(false);

  const priceMinor = useMemo(
    () => program ? getPrice(program, period) : 0,
    [program, period],
  );

  useEffect(() => {
    try {
      const savedPaymentId = window.sessionStorage.getItem(
        SELLER_MEMBERSHIP_PAYMENT_STORAGE_KEY,
      );
      if (savedPaymentId) {
        setPaymentId(savedPaymentId);
        setState('pending');
        setVerifyRestoredPayment(true);
      }
    } catch {
      // Storage may be unavailable; payment verification remains server-side.
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.getSellerMembershipPrograms()
      .then((programs) => {
        if (!active) return;
        const sellerProgram = programs.find(
          (item) => getCode(item).toUpperCase() === 'SELLER',
        );
        if (!sellerProgram) {
          setError('The SELLER membership program is not enabled. Please contact support.');
          return;
        }
        setProgram(sellerProgram);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof ApiError
          ? caught.message
          : 'Unable to load the configured seller membership. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function startPayment() {
    if (!program || !accepted || working) return;
    setWorking(true);
    setError('');
    let checkoutWindow: Window | null = null;
    try {
      // Open synchronously from the click to reduce popup-blocking risk.
      checkoutWindow = window.open('about:blank', '_blank');
      await api.acceptSellerMembershipTerms(program.id);
      const intent = await api.createSellerMembershipPayment({
        membershipProgramId: program.id,
        billingPeriod: period,
        idempotencyKey: crypto.randomUUID(),
      });
      const id = intent.payment?.id;
      if (!id) throw new Error('The payment service did not return a payment ID.');
      setPaymentId(id);
      try {
        window.sessionStorage.setItem(
          SELLER_MEMBERSHIP_PAYMENT_STORAGE_KEY,
          id,
        );
      } catch {
        // This page can still check payment status without storage.
      }
      // A payment intent alone must never unlock seller onboarding.
      setState('pending');
      const checkoutUrl = intent.checkout?.url;
      if (checkoutUrl) {
        if (checkoutWindow) checkoutWindow.location.href = checkoutUrl;
        else window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      } else {
        checkoutWindow?.close();
        setError('Payment was created, but no checkout URL was returned. Check payment status or contact support.');
      }
    } catch (caught) {
      checkoutWindow?.close();
      setError(caught instanceof ApiError ? caught.message :
        caught instanceof Error ? caught.message : 'Unable to start seller membership payment.');
    } finally {
      setWorking(false);
    }
  }

  const checkPayment = useCallback(async () => {
    if (!paymentId || working || paymentCheckInFlight.current) return;
    paymentCheckInFlight.current = true;
    setWorking(true);
    setError('');
    try {
      const result = await api.getSellerMembershipPaymentStatus(paymentId);
      const current = paymentState(result);
      if (['SUCCESS', 'SUCCESSFUL'].includes(current)) {
        setState('success');
        try {
          window.sessionStorage.removeItem(
            SELLER_MEMBERSHIP_PAYMENT_STORAGE_KEY,
          );
        } catch {
          // Storage may be unavailable; server verification remains authoritative.
        }
        onVerified();
        return;
      }
      if (['FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(current)) {
        setState('failed');
        setError(`The payment status is ${current.toLowerCase()}. You can start a new payment if appropriate.`);
      } else {
        setState('pending');
        setError('Payment is not confirmed yet. Please wait a moment and check again.');
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message :
        'Unable to verify payment status with the server.');
    } finally {
      paymentCheckInFlight.current = false;
      setWorking(false);
    }
  }, [paymentId, working, onVerified]);

  // seller-payment-return-auto-check: verify a payment restored after returning to CHIMZO.
  useEffect(() => {
    if (!verifyRestoredPayment || !paymentId || restoredVerificationStarted.current) return;
    restoredVerificationStarted.current = true;
    setVerifyRestoredPayment(false);
    void checkPayment();
  }, [verifyRestoredPayment, paymentId, checkPayment]);

  // Recheck a pending payment when the customer returns from the checkout tab.
  useEffect(() => {
    if (!paymentId || state !== 'pending') return;

    const handleReturn = () => {
      if (document.visibilityState === 'visible') {
        void checkPayment();
      }
    };

    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);

    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [paymentId, state, checkPayment]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#155EEF]">Business</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Seller membership</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Complete the configured membership payment before submitting your seller application.
        </p>
      </header>

      <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
        {program ? (
          <>
            <h2 className="text-lg font-bold">{getName(program)}</h2>
            {program.description && <p className="mt-2 text-sm text-slate-600">{program.description}</p>}
            <div className="mt-5">
              <label htmlFor="seller-billing-period" className="mb-2 block text-sm font-medium">
                Billing period
              </label>
              <select
                id="seller-billing-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as BillingPeriod)}
                disabled={working || Boolean(paymentId)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
              <p className="mt-3 text-2xl font-bold">
                {money(priceMinor, program.currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Price and currency are supplied by CHIMZO membership configuration.
              </p>
            </div>
            <label className="mt-5 flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={working || Boolean(paymentId)}
                className="mt-1"
              />
              <span>
                I have read and accept the current seller membership terms.
                {program.termsVersion ? ` Terms version: ${program.termsVersion}.` : ''}
              </span>
            </label>
          </>
        ) : (
          <p className="text-sm text-slate-600">The seller membership program could not be loaded.</p>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {state === 'success' && (
          <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Payment is confirmed. Continue to the seller application.
          </p>
        )}
        {state === 'pending' && (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Payment is awaiting server confirmation. Do not pay again while this payment is pending.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!paymentId ? (
            <Button onClick={startPayment} disabled={!program || !accepted || working || priceMinor <= 0}>
              {working ? 'Starting payment...' : 'Accept terms and pay'}
            </Button>
          ) : (
            <Button onClick={checkPayment} disabled={working}>
              {working ? 'Checking...' : 'Check payment status'}
            </Button>
          )}
          {state === 'failed' && (
            <Button
              variant="secondary"
              onClick={() => {
                setPaymentId('');
                try {
                  window.sessionStorage.removeItem(
                    SELLER_MEMBERSHIP_PAYMENT_STORAGE_KEY,
                  );
                } catch {
                  // Storage may be unavailable.
                }
                setState('idle');
                setError('');
                setAccepted(false);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
