import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <header className="flex items-center justify-between border-b px-6 py-5">
        <Link href="/" className="text-2xl font-extrabold text-[#08205B]">CHIM<span className="text-emerald-600">ZO</span></Link>
        <nav className="flex gap-3">
          <Link href="/login" className="px-4 py-3 font-semibold">Sign in</Link>
          <Link href="/register" className="rounded-xl bg-[#08205B] px-5 py-3 font-semibold text-white">Create account</Link>
        </nav>
      </header>
      <section className="bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-bold uppercase tracking-widest text-emerald-700">Welcome to CHIMZO</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight text-[#08205B] sm:text-6xl">Digital services and marketplace opportunities, connected.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Recharge, pay for services, manage your wallet, discover products and grow your business on one platform.</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/register" className="rounded-xl bg-emerald-600 px-7 py-4 font-bold text-white">Get started</Link>
            <Link href="/marketplace" className="rounded-xl border border-slate-300 bg-white px-7 py-4 font-bold text-[#08205B]">Explore marketplace</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-extrabold text-[#08205B]">One platform. Multiple possibilities.</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Airtime & Data', 'Recharge lines and buy data bundles.', '/dashboard/services'],
            ['Bills & Utilities', 'Access electricity and TV services.', '/dashboard/services'],
            ['Marketplace', 'Discover products from CHIMZO sellers.', '/marketplace'],
            ['Your Wallet', 'Manage payments and wallet activity.', '/dashboard/wallet'],
          ].map(([title, description, href]) => (
            <Link key={title} href={href} className="rounded-2xl border border-slate-200 p-6 hover:border-emerald-400 hover:shadow-lg">
              <h3 className="font-bold text-[#08205B]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
              <span className="mt-5 inline-block font-semibold text-emerald-700">Explore →</span>
            </Link>
          ))}
        </div>
      </section>
      <footer className="bg-[#08205B] px-6 py-10 text-center text-white">
        <h2 className="text-2xl font-bold">Start with CHIMZO today.</h2>
        <Link href="/register" className="mt-5 inline-block rounded-xl bg-emerald-400 px-6 py-3 font-bold text-[#08205B]">Create your account</Link>
        <p className="mt-8 text-sm text-blue-200">© {new Date().getFullYear()} CHIMZO. All rights reserved.</p>
      </footer>
    </main>
  );
}
