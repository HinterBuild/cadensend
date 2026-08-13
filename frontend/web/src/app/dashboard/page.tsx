"use client";

import { useState, useEffect } from 'react';
import { Plus, BookOpen, Calendar, Send, ArrowUpRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRequireAuth, useAuth } from '@/contexts/AuthContext';
import { seriesApi } from '@/lib/api';
import { Series } from '@/types';
import { BrandLogo } from '@/components/BrandLogo';

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { logout } = useAuth();
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const greetingName = user?.name?.trim() || user?.email?.split('@')[0] || 'there';
  const activeCount = series.filter((item) => item.status === 'active').length;

  const handleDeleteSeries = async (e: React.MouseEvent, seriesId: string, topic: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete “${topic}”? This cannot be undone.`)) {
      return;
    }
    setDeletingId(seriesId);
    try {
      await seriesApi.delete(seriesId);
      setSeries((current) => current.filter((item) => item.id !== seriesId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete series');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-[#e7e0d6] bg-[#faf8f5]/80">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
            <BrandLogo className="h-9 w-9" />
            <h1 className="font-display text-3xl text-stone-900">Cadensend</h1>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center">
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800"
              role="status"
              aria-label="Loading series"
            ></div>
            <p className="mt-4 text-stone-500">Loading series...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#e7e0d6] bg-[#faf8f5]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500">
              <BrandLogo className="h-5 w-5" />
              Cadensend
            </p>
            <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900">
              Good day, {greetingName}
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden text-sm text-stone-500 sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="text-sm font-medium text-stone-700 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e7e0d6] bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Series</p>
            <p className="font-display mt-1 text-3xl text-stone-900">{series.length}</p>
          </div>
          <div className="rounded-2xl border border-[#e7e0d6] bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Active</p>
            <p className="font-display mt-1 text-3xl text-stone-900">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-[#e7e0d6] bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Drafts</p>
            <p className="font-display mt-1 text-3xl text-stone-900">{Math.max(series.length - activeCount, 0)}</p>
          </div>
        </div>

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight text-stone-900">Your Series</h2>
            <p className="mt-1 text-sm text-stone-500">Courses you are writing and sending.</p>
          </div>
          <Link
            href="/series/create"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create New Series
          </Link>
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700"
          >
            {error}
          </div>
        ) : series.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d6cdc0] bg-white/70 px-6 py-16 text-center">
            <BookOpen className="mx-auto mb-4 h-10 w-10 text-stone-300" aria-hidden="true" />
            <h3 className="font-display text-2xl text-stone-900">No series yet</h3>
            <p className="mx-auto mt-2 max-w-md text-stone-500">
              Create your first learning series to start planning issues and sending them on a schedule.
            </p>
            <Link
              href="/series/create"
              className="mt-6 inline-flex rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
            >
              Create your first series
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="group block no-underline hover:no-underline"
              >
                <div
                  tabIndex={-1}
                  className="h-full rounded-2xl border border-[#e7e0d6] bg-white p-6 shadow-[0_1px_0_rgba(28,25,23,0.04)] transition-all group-hover:-translate-y-0.5 group-hover:border-stone-300 group-hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-xl leading-snug text-stone-900">{s.topic}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500">{s.goal}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-300 transition-colors group-hover:text-stone-700" aria-hidden="true" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {s.level && (
                      <span className="rounded-full bg-[#f3eee6] px-2.5 py-1 text-xs capitalize text-stone-700">
                        {s.level}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs capitalize ${
                        s.plan_status === 'generating'
                          ? 'bg-yellow-50 text-yellow-800'
                          : s.plan_status === 'ready'
                          ? 'bg-emerald-50 text-emerald-800'
                          : s.plan_status === 'failed'
                          ? 'bg-red-50 text-red-800'
                          : s.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800'
                          : s.status === 'planned' || s.status === 'draft'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                      aria-label={`Status: ${s.plan_status === 'generating' ? 'plan generating' : s.status}`}
                    >
                      {s.plan_status === 'generating'
                        ? 'Plan in progress'
                        : s.plan_status === 'failed'
                        ? 'Plan failed'
                        : s.status}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${s.topic}`}
                      disabled={deletingId === s.id}
                      onClick={(e) => handleDeleteSeries(e, s.id, s.topic)}
                      className="ml-auto rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-5 flex items-center gap-4 text-xs text-stone-500">
                    <div className="flex items-center">
                      <Calendar className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      <span>Created {new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center">
                      <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      <span>{s.status === 'active' ? 'Sending' : 'Scheduled'}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
