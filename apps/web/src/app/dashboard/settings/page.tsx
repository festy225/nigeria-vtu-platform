import Link from 'next/link';

const items = [
  {
    title: 'Personal account',
    description: 'Review your profile information and account details.',
    href: '/dashboard/account',
    action: 'Open account',
  },
  {
    title: 'Wallet and payments',
    description: 'Access your wallet and available payment options.',
    href: '/dashboard/wallet',
    action: 'Open wallet',
  },
  {
    title: 'Transactions',
    description: 'Review your available transaction history.',
    href: '/dashboard/transactions',
    action: 'View transactions',
  },
];

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700">Your account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage your CHIMZO account using the available account features.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
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
              {item.action} →
            </Link>
          </article>
        ))}
      </section>

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Editable preferences and security controls will be added when their
        supported update flows are available.
      </p>
    </main>
  );
}