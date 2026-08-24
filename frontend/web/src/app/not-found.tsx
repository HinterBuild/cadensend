import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">404</p>
        <h1 className="font-display mt-2 text-3xl text-stone-900">Page not found</h1>
        <p className="mt-2 text-sm text-stone-600">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
