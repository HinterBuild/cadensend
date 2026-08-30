"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';

export default function MagicLinkPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { verifyMagicLink } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');
  const [error, setError] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    if (!token) {
      setStatus('error');
      setError('This sign-in link is missing its token. Request a new magic link.');
      return;
    }

    let cancelled = false;

    verifyMagicLink(token).catch((err: unknown) => {
      if (cancelled) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not verify this sign-in link.');
    });

    return () => {
      cancelled = true;
    };
  }, [token, verifyMagicLink]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center gap-3">
            <BrandLogo className="h-10 w-10" />
            <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
          </div>
          <p className="text-sm text-gray-600">Magic link sign-in</p>
        </div>

        {status === 'verifying' ? (
          <div className="space-y-3 text-center">
            <h2 className="text-lg font-semibold text-gray-900">Signing you in</h2>
            <p className="text-sm text-gray-600">Verifying your one-time link and starting a session.</p>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold text-gray-900">Link could not be used</h2>
            <p className="text-sm text-red-700">{error}</p>
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              Back to login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
