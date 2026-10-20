'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const result = await api.passwordResetRequest(identifier.trim());
      if (result.token) {
        sessionStorage.setItem('chimzo_dev_reset_token', result.token);
        setMessage('Development reset token received. Continue to the reset page.');
      } else {
        setMessage('If the account can receive a recovery email, instructions will be sent shortly.');
      }
    } catch {
      setError('Unable to process the request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-5 py-12">
      <section className="card w-full max-w-md">
        <p className="eyebrow">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold text-[#08205B]">Forgot password?</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter the email address or phone number associated with your account.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="identifier" className="label">Email or phone number</label>
            <input
              id="identifier"
              className="input"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Submitting...' : 'Send reset instructions'}
          </button>
          <p className="text-center text-sm text-slate-600">
            <Link className="text-brand-600 hover:text-brand-700" href="/reset-password">
              Continue to password reset
            </Link>
            {' · '}
            <Link className="text-brand-600 hover:text-brand-700" href="/login">Back to sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}