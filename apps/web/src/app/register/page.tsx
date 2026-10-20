import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { RegisterForm } from '@/components/forms/register-form';
export const metadata: Metadata = { title: 'Create account | CHIMZO' };
export default function RegisterPage() { return <main className="grid min-h-screen place-items-center bg-[#F4F7FB] px-5 py-12"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Brand /></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="eyebrow">Get started</p><h1 className="mt-2 text-3xl font-bold text-[#08205B]">Create your wallet</h1><p className="mt-3 text-sm leading-6 text-slate-600">Open a secure customer account for digital services and future upgrades.</p><div className="mt-8"><RegisterForm /></div></div></div></main>; }
