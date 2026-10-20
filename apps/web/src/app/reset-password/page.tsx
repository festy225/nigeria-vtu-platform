'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get('token');
    const localToken = sessionStorage.getItem('chimzo_dev_reset_token');
    setToken(queryToken || localToken || '');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('The reset link is missing. Request a new password-reset link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(password)) {
      setError('Use at least 10 characters with uppercase, lowercase, number, and symbol.');
      return;
    }

    setBusy(true);
    try {
      await api.passwordResetConfirm(token, password);
      sessionStorage.removeItem('chimzo_dev_reset_token');
      setToken('');
      setMessage('Your password has been changed. Sign in with your new password.');
    } catch {
      setError('This reset link is invalid or expired. Request a new one and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-5 py-12">
      <section className="card w-full max-w-md">
        <p className="eyebrow">Account security</p>
        <h1 className="mt-2 text-3xl font-bold text-[#08205B]">Reset password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Choose a strong new password. Reset links expire after 30 minutes.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="password" className="label">New password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="label">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {!message && (
            <button className="btn-primary w-full" type="submit" disabled={busy}>
              {busy ? 'Resetting...' : 'Set new password'}
            </button>
          )}
          <p className="text-center text-sm text-slate-600">
            <Link className="text-brand-600 hover:text-brand-700" href="/forgot-password">
              Request a new reset link
            </Link>
            {' · '}
            <Link className="text-brand-600 hover:text-brand-700" href="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}