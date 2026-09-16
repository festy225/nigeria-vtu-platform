import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { RegisterForm } from '@/components/forms/register-form';
export const metadata: Metadata = { title: 'Create account | VTUPay' };
export default function RegisterPage() { return <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-12"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Brand /></div><div className="card"><p className="eyebrow">Get started</p><h1 className="mt-2 text-3xl font-bold text-white">Create your wallet</h1><p className="mt-3 text-sm leading-6 text-slate-400">Open a secure customer account for digital services and future upgrades.</p><div className="mt-8"><RegisterForm /></div></div></div></main>; }
