"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Lock, Send, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { login, sendMagicLink } = useAuth();

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      const backendError = err.message || '';
      if (backendError.includes('user not found')) {
        setError('We could not find an account with that email. Check the address or ask your workspace admin for access.');
      } else if (backendError.includes('incorrect password')) {
        setError('Incorrect password. Please try again or reset your password.');
      } else {
        setError(backendError || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await sendMagicLink(email);
      setMagicLinkSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-[#f6f3ee] py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-3">
              <BrandLogo className="h-10 w-10" />
              <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
            </div>
            <p className="text-sm text-stone-600">Plan and send email series on a schedule</p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"
            >
              {error}
            </div>
          )}

          {magicLinkSent ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <Send className="h-8 w-8 text-green-600" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-600 mb-4">
                We sent a magic link to <span className="font-medium text-gray-900">{email}</span>.
                Click the link in the email to sign in.
              </p>
              <button
                type="button"
                onClick={() => setMagicLinkSent(false)}
                className="text-stone-800 hover:text-blue-700 font-medium text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
              >
                Use a different email
              </button>
            </div>
          ) : showMagicLink ? (
            <form onSubmit={handleMagicLink} className="space-y-6">
              <div>
                <label htmlFor="magic-link-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    id="magic-link-email"
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
                className="w-full py-2.5 px-4 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
                {!loading && <Send className="h-4 w-4" aria-hidden="true" />}
              </button>

              <div className="text-center text-sm text-gray-600 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowMagicLink(false)}
                  className="font-medium text-stone-800 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  Back to password login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    id="login-email"
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

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent text-gray-900 bg-white text-base sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 rounded"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end text-sm">
                <Link
                  href="/forgot-password"
                  className="font-medium text-stone-800 hover:text-stone-900 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>

              <div className="text-center text-sm text-gray-600 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowMagicLink(true)}
                  className="font-medium text-stone-800 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  Use magic link instead
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-stone-500">
          Sign in with the account provided by your workspace.
        </p>
      </div>
    </main>
  );
}
