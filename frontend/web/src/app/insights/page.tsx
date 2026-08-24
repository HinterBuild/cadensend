"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { AnalyticsOverview, NamedCount } from '@/types';

function maxCount(items: NamedCount[]) {
  return Math.max(1, ...items.map((item) => item.count));
}

function BarList({ items, empty }: { items: NamedCount[]; empty: string }) {
  if (!items.length) {
    return <p className="text-sm text-stone-500">{empty}</p>;
  }
  const max = maxCount(items);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="capitalize text-stone-800">{item.name.replace('-', ' / ')}</span>
            <span className="tabular-nums text-stone-500">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#efe8dc]">
            <div
              className="h-full rounded-full bg-stone-800"
              style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[#e7e0d6] bg-white px-5 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="font-display mt-1 text-3xl text-stone-900 tabular-nums">{value}</p>
    </div>
  );
}

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
          series_by_status: overview.series_by_status ?? [],
          issues_by_status: overview.issues_by_status ?? [],
          levels: overview.levels ?? [],
          genres: overview.genres ?? [],
          topics: overview.topics ?? [],
          diagrams_by_type: overview.diagrams_by_type ?? [],
          sources_by_status: overview.sources_by_status ?? [],
          activity: overview.activity ?? [],
          coverage: overview.coverage ?? [],
          improvements: overview.improvements ?? [],
          suggestions: overview.suggestions ?? [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load insights');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800"
          role="status"
          aria-label="Loading insights"
        />
        <p className="mt-4 text-stone-500">Loading insights...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700">
          {error || 'No insights yet'}
        </div>
      </div>
    );
  }

  const { headline, pipeline, cadence, plan } = data;
  const activityMax = Math.max(
    1,
    ...data.activity.map((week) => Math.max(week.series_created, week.issues_created, week.issues_sent))
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Workspace</p>
          <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900">Insights</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-500">
            How your series are moving, what topics you cover, and where the next series should go.
          </p>
        </div>
        <Link
          href="/series/create"
          className="rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-stone-800 hover:no-underline"
        >
          Create series
        </Link>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Series going" value={headline.series_active} />
        <StatCard label="Topics covered" value={headline.unique_topics} />
        <StatCard label="Issues sent" value={headline.issues_sent} />
        <StatCard label="Diagrams" value={headline.diagrams} />
      </div>
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        <StatCard label="Code blocks" value={headline.code_blocks} />
        <StatCard label="Citations" value={headline.citations} />
        <StatCard label="All series" value={headline.series_total} />
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900 text-wrap:balance">Pipeline</h2>
          <p className="mt-1 text-sm text-stone-500">Plan modules through generated and sent issues.</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-stone-500">Planned modules</dt>
              <dd className="font-display text-2xl text-stone-900">{pipeline.planned_modules}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Issues total</dt>
              <dd className="font-display text-2xl text-stone-900">{pipeline.issues_total}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Generated</dt>
              <dd className="font-display text-2xl text-stone-900">{pipeline.generated}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Failed</dt>
              <dd className="font-display text-2xl text-stone-900">{pipeline.failed}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Cadence</h2>
          <p className="mt-1 text-sm text-stone-500">What is due, late, or quiet.</p>
          <dl className="mt-5 grid grid-cols-1 gap-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Due in next 7 days</dt>
              <dd className="tabular-nums text-stone-900">{cadence.due_next_7_days}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Overdue, not sent</dt>
              <dd className="tabular-nums text-stone-900">{cadence.overdue_pending}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Stale active series</dt>
              <dd className="tabular-nums text-stone-900">{cadence.stale_active_series}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Plans ready / empty / failed</dt>
              <dd className="tabular-nums text-stone-900">
                {plan.ready} / {plan.empty} / {plan.failed}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Topic mix</h2>
          <p className="mb-5 mt-1 text-sm text-stone-500">Genres inferred from series titles and goals.</p>
          <BarList items={data.genres} empty="Create a series to see genre mix." />
        </section>
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Level mix</h2>
          <p className="mb-5 mt-1 text-sm text-stone-500">Beginner through advanced.</p>
          <BarList items={data.levels} empty="No levels recorded yet." />
        </section>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Series status</h2>
          <div className="mt-5">
            <BarList items={data.series_by_status} empty="No series yet." />
          </div>
        </section>
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Issue status</h2>
          <div className="mt-5">
            <BarList items={data.issues_by_status} empty="No issues generated yet." />
          </div>
        </section>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Diagrams by type</h2>
          <p className="mb-5 mt-1 text-sm text-stone-500">Mermaid, D2, and other visual specs.</p>
          <BarList items={data.diagrams_by_type} empty="No diagrams generated yet." />
        </section>
        <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Sources</h2>
          <p className="mb-5 mt-1 text-sm text-stone-500">Ingest pipeline health.</p>
          <BarList items={data.sources_by_status} empty="No sources yet." />
        </section>
      </div>

      <section className="mb-8 rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-xl text-stone-900">Activity</h2>
        <p className="mt-1 text-sm text-stone-500">Last eight weeks of series and issues.</p>
        <div className="mt-6 flex h-40 items-end gap-2">
          {data.activity.map((week) => (
            <div key={week.week_start} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end justify-center gap-0.5">
                <div
                  className="w-1.5 rounded-t bg-stone-300"
                  style={{ height: `${(week.series_created / activityMax) * 100}%` }}
                  title={`Series ${week.series_created}`}
                />
                <div
                  className="w-1.5 rounded-t bg-stone-500"
                  style={{ height: `${(week.issues_created / activityMax) * 100}%` }}
                  title={`Issues ${week.issues_created}`}
                />
                <div
                  className="w-1.5 rounded-t bg-stone-900"
                  style={{ height: `${(week.issues_sent / activityMax) * 100}%` }}
                  title={`Sent ${week.issues_sent}`}
                />
              </div>
              <span className="text-[10px] text-stone-400">{week.week_start.slice(5)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500">Light: series created · Mid: issues created · Dark: sent</p>
      </section>

      <section className="mb-8 rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-xl text-stone-900">Coverage vs plan</h2>
        <p className="mt-1 text-sm text-stone-500">Issued lessons against planned modules.</p>
        {data.coverage.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Plans with modules will show coverage here.</p>
        ) : (
          <ul className="mt-5 divide-y divide-[#efe8dc]">
            {data.coverage.map((row) => (
              <li key={row.series_id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <Link href={`/series/${row.series_id}`} className="font-medium text-stone-800 no-underline hover:underline">
                  {row.topic}
                </Link>
                <span className="tabular-nums text-stone-500">
                  {row.issued}/{row.planned} ({Math.round(row.percent)}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8 rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-xl text-stone-900">Improvements</h2>
        <p className="mt-1 text-sm text-stone-500">Failed ingest, empty plans, quiet series, missing diagrams.</p>
        {data.improvements.length === 0 ? (
          <p className="mt-4 text-sm text-emerald-800">Nothing urgent. Pipelines look healthy.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {data.improvements.map((item, index) => (
              <li key={`${item.kind}-${index}`} className="rounded-xl bg-[#f3eee6] px-4 py-3">
                <p className="text-sm font-medium text-stone-900">{item.title}</p>
                <p className="mt-1 text-sm text-stone-600">{item.detail}</p>
                {item.series_id ? (
                  <Link
                    href={`/series/${item.series_id}`}
                    className="mt-2 inline-block text-xs font-medium text-stone-800"
                  >
                    Open series
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {plan.placeholder_titles > 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            {plan.placeholder_titles} placeholder module title{plan.placeholder_titles === 1 ? '' : 's'} (like “Module 2”).
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-xl text-stone-900">Suggested series</h2>
        <p className="mt-1 text-sm text-stone-500">Based on your current mix, not a live LLM call.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.suggestions.map((item) => {
            const params = new URLSearchParams({
              topic: item.topic,
              goal: item.goal,
              level: item.level,
            });
            return (
              <div key={item.topic} className="rounded-2xl border border-[#e7e0d6] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                  {item.genre} · {item.level}
                </p>
                <h3 className="font-display mt-2 text-lg text-stone-900">{item.topic}</h3>
                <p className="mt-2 text-sm text-stone-600">{item.goal}</p>
                <p className="mt-2 text-sm text-stone-500">{item.reason}</p>
                <Link
                  href={`/series/create?${params.toString()}`}
                  className="mt-4 inline-flex rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-stone-800 hover:no-underline"
                >
                  Start this series
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {data.topics.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h2 className="font-display text-xl text-stone-900">Topics</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.topics.map((topic) => (
              <span key={topic.name} className="rounded-full bg-[#f3eee6] px-3 py-1 text-sm text-stone-800">
                {topic.name}
                <span className="ml-2 text-stone-500">{topic.count}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
