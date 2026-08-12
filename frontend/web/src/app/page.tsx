'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
          role="status"
          aria-label="Loading page"
        ></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </main>
  );
}
