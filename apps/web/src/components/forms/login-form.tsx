'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/primitives';

export function LoginForm() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError('');

    try {
      const result = await api.login({
        identifier: identifier.trim(),
        password,
      });

      setSession(result);
      router.replace(
        result.user.roles?.some(
          (role) => role === 'SUPER_ADMIN' || role === 'ADMIN',
        )
          ? '/dashboard/admin'
          : '/dashboard',
      );
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 401
            ? 'Invalid email or password.'
            : caught.message,
        );
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="identifier" className="label">
          Email or phone number
        </label>

        <input
          id="identifier"
          type="text"
          className="input"
          value={identifier}
          onChange={(event) => {
            setIdentifier(event.target.value);
            setError('');
          }}
          required
          autoComplete="username"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>

        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError('');
          }}
          required
          autoComplete="current-password"
        />
      </div>

      <div className="-mt-2 flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-brand-600 hover:text-brand-700"
        >
          Forgot password?
        </Link>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? 'Signing in...' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        New here?{' '}
        <Link
          className="text-brand-600 hover:text-brand-700"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
