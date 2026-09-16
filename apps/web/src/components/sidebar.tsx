'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';

const links = [
  ['Dashboard', '/dashboard', '⌂'],
  ['Airtime & Data', '/dashboard/services', '◈'],
  ['Transactions', '/dashboard/transactions', '↔'],
  ['Wallet', '/dashboard/wallet', '₦'],
  ['Account', '/dashboard/account', '○']
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <aside className="flex h-full w-72 flex-col border-r border-slate-800 bg-slate-950 px-5 py-6"><Brand /><nav className="mt-12 space-y-1" aria-label="Main navigation">{links.map(([label, href, icon]) => <Link key={href} onClick={onNavigate} href={href} className={`nav-link ${pathname === href ? 'nav-link-active' : ''}`}><span className="w-6 text-center text-lg">{icon}</span>{label}</Link>)}</nav><div className="mt-auto rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4"><p className="text-xs font-semibold text-brand-300">Need help?</p><p className="mt-1 text-xs leading-5 text-slate-400">Our support team is available to help with your account.</p><button className="mt-3 text-xs font-semibold text-brand-300">Contact support →</button></div></aside>;
}
