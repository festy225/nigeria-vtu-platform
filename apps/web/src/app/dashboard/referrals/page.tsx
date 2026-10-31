import Link from 'next/link';

export default function ReferralsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700">Grow with CHIMZO</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">My Referrals</h1>
        <p className="mt-2 text-sm text-slate-600">
          Referral information and eligible rewards will appear here when the
          referral service is available.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700">
          <span aria-hidden="true">↗</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Referral programme
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Your referral link, invited users, and reward balance will be shown
          here after referral tracking and reward APIs are connected. No
          referral earnings or codes are being assumed.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}