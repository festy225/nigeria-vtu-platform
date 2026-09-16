import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { LoginForm } from '@/components/forms/login-form';

export const metadata: Metadata = { title: 'Sign in | VTUPay' };
export default function LoginPage() { return <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-12"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Brand /></div><div className="card"><p className="eyebrow">Welcome back</p><h1 className="mt-2 text-3xl font-bold text-white">Sign in to your wallet</h1><p className="mt-3 text-sm leading-6 text-slate-400">Manage airtime, data, payments and more from one secure workspace.</p><div className="mt-8"><LoginForm /></div><p className="mt-6 text-center text-xs text-slate-500">Authentication is securely handled by the platform API.</p></div></div></main>; }
