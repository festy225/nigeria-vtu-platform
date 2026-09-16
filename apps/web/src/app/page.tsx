import type { ApiResponse, WalletAccount, UserRole } from '@nigeria-vtu-platform/shared';

export default function HomePage() {
  const sampleWallet: WalletAccount = {
    id: 'wallet_001',
    userId: 'user_001',
    currency: 'NGN',
    availableBalance: 50000,
    heldBalance: 0
  };

  const sampleApi: ApiResponse<{ wallet: WalletAccount; role: UserRole }> = {
    success: true,
    data: {
      wallet: sampleWallet,
      role: 'CUSTOMER'
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-400">Platform Foundation</p>
            <h1 className="mt-3 text-4xl font-bold">Nigerian VTU Platform</h1>
          </div>
          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
            Frontend ready
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Wallet</p>
            <p className="mt-3 text-3xl font-semibold">₦{sampleWallet.availableBalance.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Role</p>
            <p className="mt-3 text-3xl font-semibold uppercase">{sampleApi.data?.role}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">API</p>
            <p className="mt-3 text-3xl font-semibold">{sampleApi.success ? 'Live' : 'Pending'}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Monorepo foundation is active</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-slate-300">
            <li>Frontend application scaffolded with Next.js</li>
            <li>Backend application scaffolded with NestJS</li>
            <li>Shared types package prepared for future modules</li>
            <li>Environment templates created for local development</li>
            <li>Documentation and project setup included</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
