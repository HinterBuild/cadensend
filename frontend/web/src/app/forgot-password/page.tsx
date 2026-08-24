"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Send } from 'lucide-react';
import { authApi } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-3">
              <BrandLogo className="h-10 w-10" />
              <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
            </div>
            <p className="text-sm text-gray-600">Reset your password</p>
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {sent ? (
            <div className="text-center py-8" role="status">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <Send className="h-8 w-8 text-green-600" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-600 mb-4">
                If an account exists for <span className="font-medium text-gray-900">{email}</span>, a reset
                link is on its way. The link expires in one hour.
              </p>
              <Link
                href="/login"
                className="font-medium text-stone-800 hover:text-stone-900 underline-offset-2 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent text-gray-900 bg-white text-base sm:text-sm"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
              >
                {loading ? 'Sending…' : 'Send reset link'}
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
          )}
        </div>
      </div>
    </main>
  );
}
