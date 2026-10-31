import Link from 'next/link';

const destinations = [
  {
    title: 'Wallet and payments',
    description: 'Review your wallet and payment area.',
    href: '/dashboard/wallet',
  },
  {
    title: 'Transactions',
    description: 'Find a transaction you need help understanding.',
    href: '/dashboard/transactions',
  },
  {
    title: 'Account details',
    description: 'Review the account information currently available.',
    href: '/dashboard/account',
  },
];

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700">We&apos;re here to help</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Support</h1>
        <p className="mt-2 text-sm text-slate-600">
          Start with the CHIMZO account area related to your question.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.description}
            </p>
            <Link
              href={item.href}
              className="mt-5 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Open area â†’
            </Link>
          </article>
        ))}
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        A support contact or ticket-submission endpoint has not yet been
        confirmed. This page does not claim to submit a support request.
      </p>
    </main>
  );
}
