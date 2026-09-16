'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';

const links = [
  { label: 'Dashboard', href: '/dashboard', icon: '⌂' },
  { label: 'Services', href: '/dashboard/services', icon: '◈', roles: ['CUSTOMER', 'AGENT', 'VENDOR', 'ADMIN', 'SUPER_ADMIN'] },
  { label: 'Transactions', href: '/dashboard/transactions', icon: '↔' },
  { label: 'Wallet', href: '/dashboard/wallet', icon: '₦' },
  { label: 'Account', href: '/dashboard/account', icon: '○' },
  { label: 'Admin workspace', href: '/dashboard/admin', icon: '◆', roles: ['ADMIN', 'SUPER_ADMIN'] }
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname(); const { hasRole } = useAuth();
  return <aside className="flex h-full w-72 flex-col border-r border-slate-800 bg-slate-950 px-5 py-6"><Brand /><nav className="mt-12 space-y-1" aria-label="Main navigation">{links.filter((link) => !link.roles || hasRole(...link.roles)).map((link) => <Link key={link.href} onClick={onNavigate} href={link.href} className={`nav-link ${pathname === link.href ? 'nav-link-active' : ''}`}><span className="w-6 text-center text-lg">{link.icon}</span>{link.label}</Link>)}</nav><div className="mt-auto rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4"><p className="text-xs font-semibold text-brand-300">Need help?</p><p className="mt-1 text-xs leading-5 text-slate-400">Our support team is available to help with your account.</p><button className="mt-3 text-xs font-semibold text-brand-300">Contact support →</button></div></aside>;
}
