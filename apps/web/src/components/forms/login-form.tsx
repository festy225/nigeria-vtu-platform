'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/primitives';

export function LoginForm() {
  const router = useRouter(); const { setSession } = useAuth();
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSubmitting(true); setError(''); try { const result = await api.login({ identifier, password }); setSession(result); router.replace('/dashboard'); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Unable to sign in. Please try again.'); } finally { setSubmitting(false); } }
  return <form onSubmit={submit} className="space-y-5"><div><label htmlFor="identifier" className="label">Email or phone number</label><input id="identifier" className="input" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" /></div><div><label htmlFor="password" className="label">Password</label><input id="password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></div>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button><p className="text-center text-sm text-slate-500">New here? <Link className="text-brand-300 hover:text-brand-200" href="/register">Create an account</Link></p></form>;
}
