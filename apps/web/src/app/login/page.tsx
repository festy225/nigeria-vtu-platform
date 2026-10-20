import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { LoginForm } from '@/components/forms/login-form';

export const metadata: Metadata = { title: 'Sign in | CHIMZO' };
export default function LoginPage() { return <main className="grid min-h-screen place-items-center bg-[#F4F7FB] px-5 py-12"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Brand /></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="eyebrow">Welcome back</p><h1 className="mt-2 text-3xl font-bold text-[#08205B]">Sign in to your wallet</h1><p className="mt-3 text-sm leading-6 text-slate-600">Manage airtime, data, payments and more from one secure workspace.</p><div className="mt-8"><LoginForm /></div><p className="mt-6 text-center text-xs text-slate-500">Authentication is securely handled by the platform API.</p></div></div></main>; }
