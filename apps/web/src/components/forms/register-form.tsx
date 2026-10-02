'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/primitives';

export function RegisterForm() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [accountExists, setAccountExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();

    setError('');
    setAccountExists(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await api.register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
      });

      setSession(result);
      router.replace('/dashboard');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const message = caught.errors?.[0] ?? caught.message;

        if (
          caught.status === 409 ||
          message.toLowerCase().includes('already exists') ||
          message.toLowerCase().includes('duplicate') ||
          message.toLowerCase().includes('already registered')
        ) {
          setAccountExists(true);
          setError(
            'An account already exists with these details. Please log in.',
          );
        } else {
          setError(message);
        }
      } else {
        setError('Unable to create your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = error
    ? 'input border-rose-500 focus:border-rose-500 focus:ring-rose-500'
    : 'input';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="name" className="label">
          Name
        </label>
        <input
          id="name"
          type="text"
          className={inputClass}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
            setAccountExists(false);
          }}
          required
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError('');
            setAccountExists(false);
          }}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="phone" className="label">
          Phone Number
        </label>
        <input
          id="phone"
          type="tel"
          className={inputClass}
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setError('');
            setAccountExists(false);
          }}
          required
          autoComplete="tel"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          type="password"
          className={inputClass}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError('');
            setAccountExists(false);
          }}
          required
          autoComplete="new-password"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="label">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          className={inputClass}
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setError('');
            setAccountExists(false);
          }}
          required
          autoComplete="new-password"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
        >
          <p>{error}</p>

          {accountExists && (
            <Link
              href="/login"
              className="mt-3 inline-block font-medium text-brand-300 hover:text-brand-200"
            >
              Go to Login
            </Link>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link
          className="text-brand-300 hover:text-brand-200"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}