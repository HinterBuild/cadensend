"use client"

import { useState, useEffect } from 'react'
import { Plus, BookOpen, Calendar, Send } from 'lucide-react'
import Link from 'next/link'
import { useRequireAuth, useAuth } from '@/contexts/AuthContext'
import { seriesApi } from '@/lib/api'
import { Series } from '@/types'

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { logout } = useAuth();
  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return;

    const loadSeries = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await seriesApi.list();
        setSeries(response.series);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load series');
      } finally {
        setLoading(false);
      }
    };

    loadSeries();
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Cadensend</h1>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading series...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Cadensend</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">{user?.email || 'user@example.com'}</span>
              <button
                onClick={logout}
                className="text-blue-600 hover:text-blue-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Your Series</h2>
          <Link href="/series/create">
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Series
            </button>
          </Link>
        </div>

        {error ? (
          <div className="text-center py-12 text-red-600">{error}</div>
        ) : series.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No series yet</h3>
            <p className="text-gray-500 mb-4">Create your first learning series to get started.</p>
            <Link href="/series/create">
              <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                Create your first series
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s) => (
              <Link key={s.id} href={`/series/${s.id}`}>
                <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{s.topic}</h3>
                        <p className="text-sm text-gray-600 mt-1">{s.goal}</p>
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full mt-2">
                          {s.level}
                        </span>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        s.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : s.status === 'planned'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        Created {new Date(s.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex items-center">
                        <Send className="h-4 w-4 mr-1" />
                        {s.status === 'active' ? 'Sending' : 'Scheduled'}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
