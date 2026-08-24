"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { recipientApi } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';

function VerifyRecipientInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('Confirming your subscription…');

  useEffect(() => {
    // Verification happens on the public backend endpoint via a plain link;
    // this page just reflects the outcome by calling it server-side proxy.
    const token = searchParams.get('token') || '';
    const email = searchParams.get('email') || '';
    if (!token || !email) {
      setState('error');
      setMessage('This verification link is incomplete. Please use the link from your email.');
      return;
    }
    fetch(`/api/v1/recipients/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`)
      .then(async (res) => {
        if (res.ok) {
          setState('ok');
          setMessage(`${email} is confirmed and will start receiving issues.`);
        } else {
          const data = await res.json().catch(() => ({}));
          setState('error');
          setMessage(data?.error || 'This link is invalid or has expired.');
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Could not reach the server. Please try the link again.');
      });
  }, [searchParams]);

  return (
    <div className="text-center py-8" role="status" aria-live="polite">
      <div className="mb-4 flex justify-center">
        {state === 'pending' && (
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-stone-800" aria-hidden="true" />
        )}
        {state === 'ok' && <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden="true" />}
        {state === 'error' && <XCircle className="h-12 w-12 text-red-600" aria-hidden="true" />}
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        {state === 'ok' ? 'Subscription confirmed' : state === 'error' ? 'Verification failed' : 'One moment…'}
      </h2>
      <p className="text-gray-600">{message}</p>
    </div>
  );
}

export default function VerifyRecipientPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-3">
              <BrandLogo className="h-10 w-10" />
              <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="py-8 text-center" role="status">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-stone-800" aria-hidden="true" />
              </div>
            }
          >
            <VerifyRecipientInner />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
