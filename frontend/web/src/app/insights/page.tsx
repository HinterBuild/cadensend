"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { AnalyticsOverview } from '@/types';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[#e7e0d6] bg-white px-5 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="font-display mt-1 text-3xl text-stone-900 tabular-nums">{value}</p>
    </div>
  );
}

const MAX_ATTENTION = 4;

export default function InsightsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await analyticsApi.overview();
        const overview = response.data;
        setData({
          ...overview,
          cadence: overview.cadence ?? { due_next_7_days: 0, overdue_pending: 0, stale_active_series: 0 },
          improvements: overview.improvements ?? [],
          coverage: overview.coverage ?? [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load insights');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800"
          role="status"
          aria-label="Loading insights"
        />
        <p className="mt-4 text-stone-500">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700">
          {error || 'Could not load insights'}
        </div>
      </div>
    );
  }

  const { headline, cadence } = data;
  const attention = data.improvements.slice(0, MAX_ATTENTION);
  const behind = data.coverage
    .filter((row) => row.percent < 100)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Workspace</p>
          <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900 sm:text-4xl">Insights</h1>
          <p className="mt-2 text-sm text-stone-500">A quick read on what needs your attention.</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-[#e7e0d6] bg-white px-4 py-2.5 text-sm font-medium text-stone-700 no-underline hover:bg-[#faf8f5] hover:no-underline"
        >
          View series
        </Link>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active series" value={headline.series_active} />
        <StatCard label="Issues sent" value={headline.issues_sent} />
        <StatCard label="Due in 7 days" value={cadence.due_next_7_days} />
        <StatCard label="Overdue" value={cadence.overdue_pending} />
      </div>

      <section className="rounded-lg border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Nothing urgent right now.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {attention.map((item, index) => (
              <li key={`${item.kind}-${index}`} className="rounded-xl bg-[#faf8f5] px-4 py-3">
                <p className="text-sm font-medium text-stone-900">{item.title}</p>
                <p className="mt-1 text-sm text-stone-600">{item.detail}</p>
                {item.series_id ? (
                  <Link
                    href={`/series/${item.series_id}`}
                    className="mt-2 inline-block text-xs font-medium text-stone-800 no-underline hover:underline"
                  >
                    Open series
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {behind.length > 0 && (
        <section className="mt-6 rounded-lg border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-lg text-stone-900">Behind on plan</h2>
          <ul className="mt-4 divide-y divide-[#efe8dc]">
            {behind.map((row) => (
              <li key={row.series_id} className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
                <Link
                  href={`/series/${row.series_id}`}
                  className="font-medium text-stone-800 no-underline hover:underline"
                >
                  {row.topic}
                </Link>
                <div className="w-28 shrink-0">
                  <p className="mb-1 text-right text-xs tabular-nums text-stone-500">{row.issued} of {row.planned} issues</p>
                  <progress aria-label={`${row.topic} plan completion`} max={100} value={Math.max(0, Math.min(100, row.percent))} className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-stone-100 [&::-webkit-progress-value]:bg-stone-800 [&::-moz-progress-bar]:bg-stone-800" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
