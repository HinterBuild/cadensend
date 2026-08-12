"use client";

import { useState, FormEvent } from 'react';
import { Mail, Lock, Send, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();

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
      const response = await authApi.login(email, password);
      localStorage.setItem('token', response.token);
      router.push('/dashboard');
    } catch (err: any) {
      const backendError = err.message || '';
      if (backendError.includes('user not found')) {
        setError('We could not find an account with that email. Please check your email or sign up.');
      } else if (backendError.includes('incorrect password')) {
        setError('Incorrect password. Please try again or use "Forgot password?".');
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
      await authApi.loginWithMagicLink(email);
      setMagicLinkSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Cadensend</h1>
            <p className="text-sm text-gray-600">AI-powered newsletter series platform</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {magicLinkSent ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <Send className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h3>
              <p className="text-gray-600 mb-4">
                We sent a magic link to <span className="font-medium text-gray-900">{email}</span>.
                Click the link in the email to sign in.
              </p>
              <button
                onClick={() => setMagicLinkSent(false)}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Use a different email
              </button>
            </div>
          ) : showMagicLink ? (
            <form onSubmit={handleMagicLink} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
                {!loading && <Send className="h-4 w-4" />}
              </button>

              <div className="text-center text-sm text-gray-600 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowMagicLink(false)}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Back to password login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>

              <div className="text-center text-sm text-gray-600 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowMagicLink(true)}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Use magic link instead
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">
          By continuing, you agree to Cadensend's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
