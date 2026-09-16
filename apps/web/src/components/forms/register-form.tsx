'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/primitives';

export function RegisterForm() {
  const router = useRouter(); const { setSession } = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSubmitting(true); setError(''); try { const result = await api.register({ email, password }); setSession(result); router.replace('/dashboard'); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Unable to create your account. Please try again.'); } finally { setSubmitting(false); } }
  return <form onSubmit={submit} className="space-y-5"><div><label htmlFor="email" className="label">Email address</label><input id="email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div><div><label htmlFor="password" className="label">Password</label><input id="password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" minLength={10} /></div>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button><p className="text-center text-sm text-slate-500">Already registered? <Link className="text-brand-300 hover:text-brand-200" href="/login">Sign in</Link></p></form>;
}
