'use client';

import { useState } from 'react';
import { useAuth } from './providers/auth-provider';
import { Brand } from './brand';
import { Sidebar } from './sidebar';

export function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return <><header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-5 backdrop-blur lg:px-8"><button className="icon-button lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">☰</button><div className="lg:hidden"><Brand compact /></div><div className="hidden lg:block"><p className="text-sm text-slate-400">Workspace</p><p className="font-semibold text-white">Good to see you back</p></div><div className="relative"><button className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-900" onClick={() => setOpen(!open)}><span className="avatar">{(user?.email ?? user?.phone ?? 'U')[0].toUpperCase()}</span><span className="hidden text-left sm:block"><span className="block text-sm font-semibold text-white">{user?.email ?? 'Account'}</span><span className="block text-xs text-slate-500">{user?.roles?.[0] ?? 'CUSTOMER'}</span></span><span className="text-slate-500">⌄</span></button>{open && <div className="absolute right-0 top-14 z-30 w-52 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl"><button onClick={() => void logout()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10">Sign out</button></div>}</div></header><div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none invisible'}`}><div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} /><div className="relative h-full"><Sidebar onNavigate={() => setOpen(false)} /></div></div></>;
}
