"use client";

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { authApi } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing its token. Request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-8" role="status">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Password updated</h2>
        <p className="text-gray-600">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}
      {!token && (
        <div role="alert" className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
          This link is missing its reset token.{' '}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </div>
      )}

      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-2">
          New password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent text-gray-900 bg-white text-base sm:text-sm"
            placeholder="At least 8 characters"
          />
        </div>
      </div>

      <div>
        <label htmlFor="reset-confirm" className="block text-sm font-medium text-gray-700 mb-2">
          Confirm new password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent text-gray-900 bg-white text-base sm:text-sm"
            placeholder="Repeat the password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !token}
        className="w-full py-2.5 px-4 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
      >
        {loading ? 'Updating…' : 'Set new password'}
      </button>

      <div className="text-center text-sm text-gray-600 pt-4 border-t border-gray-200">
        <Link
          href="/login"
          className="font-medium text-stone-800 hover:text-stone-900 underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  // Suspense boundary required by useSearchParams during prerender.
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-3">
              <BrandLogo className="h-10 w-10" />
              <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
            </div>
            <p className="text-sm text-gray-600">Choose a new password</p>
          </div>
          <Suspense
            fallback={
              <p className="py-8 text-center text-sm text-gray-500" role="status">
                Loading…
              </p>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
