"use client";

import { useEffect } from 'react';
import Link from 'next/link';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the console so support requests include context.
    console.error('Route render failed:', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h2 className="font-display text-2xl text-stone-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-stone-600">
          The page hit an unexpected error. You can retry, or head back to the dashboard —
          your data is safe.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-stone-400">ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-800 hover:bg-white"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
