"use client";

import { SearchField, EmptyResults, SummaryCards } from '@/components/WorkspaceUI';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen, Calendar, Send, ArrowUpRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRequireAuth } from '@/contexts/AuthContext';
import { seriesApi } from '@/lib/api';
import { Series } from '@/types';
import { AssistantChat } from '@/components/assistant/AssistantChat';

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSeries = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await seriesApi.list();
      setSeries(response.series);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadSeries();
  }, [authLoading, loadSeries]);

  const greetingName = user?.name?.trim() || user?.email?.split('@')[0] || 'there';
  const activeCount = series.filter((item) => item.status === 'active').length;

  const visibleSeries = series.filter(item =>
    (statusFilter === 'all' || item.status === statusFilter) &&
    `${item.topic} ${item.goal || ''}`.toLowerCase().includes(query.trim().toLowerCase()));

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
      <div className="py-16 text-center">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800"
          role="status"
          aria-label="Loading series"
        />
        <p className="mt-4 text-stone-500">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Dashboard</p>
        <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900 sm:text-4xl">
          Good day, {greetingName}
        </h1>
        <p className="mt-1 text-sm text-stone-500">{user?.email}</p>
      </div>

      <div className="mb-6">
        <AssistantChat layout="dock" onSeriesChange={() => void loadSeries(true)} />
      </div>

      <SummaryCards items={[{ label: 'Total series', value: series.length }, { label: 'Active', value: activeCount }, { label: 'Drafts', value: series.filter(item => item.status === 'draft').length }]} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight text-stone-900">Your Series</h2>
            <p className="mt-1 text-sm text-stone-500">Series you are writing and sending.</p>
          </div>
          <Link
            href="/series/create"
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create New Series
          </Link>
      </div>

      {series.length > 0 && <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField label="Search series" placeholder="Search by topic or goal…" value={query} onChange={setQuery} />
        <select aria-label="Filter series by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2.5 text-sm">
          <option value="all">All statuses</option>{Array.from(new Set(series.map(item => item.status))).sort().map(status => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
        </select>
        <p className="text-xs text-stone-500" role="status">{visibleSeries.length} of {series.length} series</p>
      </div>}

      {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700"
          >
            {error}<button type="button" onClick={() => void loadSeries()} className="mx-auto mt-4 block rounded-lg border border-red-200 bg-white px-4 py-2 text-sm">Retry</button>
          </div>
        ) : series.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d6cdc0] bg-white/70 px-6 py-16 text-center">
            <BookOpen className="mx-auto mb-4 h-10 w-10 text-stone-300" aria-hidden="true" />
            <h3 className="font-display text-2xl text-stone-900">No series yet</h3>
            <p className="mx-auto mt-2 max-w-md text-stone-500">
              Create your first series to plan issues and send them on a schedule.
            </p>
            <Link
              href="/series/create"
              className="mt-6 inline-flex rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
            >
              Create your first series
            </Link>
          </div>
      ) : visibleSeries.length === 0 ? <EmptyResults onClear={() => { setQuery(''); setStatusFilter('all'); }} /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSeries.map((s) => (
              <article
                key={s.id}
                className="group flex h-full flex-col rounded-lg border border-[#e7e0d6] bg-white p-6 shadow-[0_1px_0_rgba(28,25,23,0.04)] transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
              >
                <Link
                  href={`/series/${s.id}`}
                  className="block min-w-0 flex-1 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-xl leading-snug text-stone-900 text-wrap:balance">{s.topic}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500 text-wrap:pretty">{s.goal}</p>
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
                </Link>
                <div className="mt-4 flex justify-end border-t border-[#efe8dc] pt-3">
                  <button
                    type="button"
                    aria-label={`Delete ${s.topic}`}
                    disabled={deletingId === s.id}
                    onClick={(e) => handleDeleteSeries(e, s.id, s.topic)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
