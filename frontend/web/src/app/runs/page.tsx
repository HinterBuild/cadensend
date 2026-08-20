"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { useRequireAuth } from '@/contexts/AuthContext';
import { issueApi, runsApi, seriesApi, sourceApi, type RunItem, type RunSummary } from '@/lib/api';

const KIND_LABEL: Record<string, string> = {
  issue: 'Issue',
  ingest: 'Ingest',
  plan: 'Plan',
};

function statusClass(status: string) {
  if (status === 'failed') return 'bg-red-50 text-red-800';
  if (status === 'generating' || status === 'ingesting' || status === 'running') {
    return 'bg-amber-50 text-amber-800';
  }
  if (status === 'ready' || status === 'sent' || status === 'completed' || status === 'approved') {
    return 'bg-emerald-50 text-emerald-800';
  }
  return 'bg-stone-100 text-stone-700';
}

export default function RunCenterPage() {
  const { loading: authLoading } = useRequireAuth();
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [summary, setSummary] = useState<RunSummary>({ queued: 0, running: 0, failed: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const response = await runsApi.list({
        kind: kind || undefined,
        status: status || undefined,
      });
      setRuns(response.data ?? []);
      setSummary(response.summary ?? { queued: 0, running: 0, failed: 0, completed: 0 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    loadRuns();
  }, [authLoading, loadRuns]);

  useEffect(() => {
    if (authLoading || !autoRefresh) return;
    const timer = window.setInterval(loadRuns, 8000);
    return () => window.clearInterval(timer);
  }, [authLoading, autoRefresh, loadRuns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((run) =>
      `${run.title} ${run.detail} ${run.status} ${run.kind} ${run.error || ''}`.toLowerCase().includes(q)
    );
  }, [runs, query]);

  const retry = async (run: RunItem) => {
    setRetrying(run.id);
    try {
      if (run.kind === 'issue' && run.issue_id) {
        await issueApi.generate(run.issue_id);
      } else if (run.kind === 'ingest' && run.source_id) {
        await sourceApi.reindex(run.source_id);
      } else if (run.kind === 'plan' && run.series_id) {
        await seriesApi.generatePlan(run.series_id);
      }
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  if (authLoading || (loading && runs.length === 0)) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800" role="status" aria-label="Loading runs" />
        <p className="mt-4 text-stone-500">Loading runs...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Operations</p>
          <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900">Run Center</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-500">
            Live plans, ingest jobs, and issue generations for this workspace.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={loadRuns}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ['Queued', summary.queued],
          ['Running', summary.running],
          ['Failed', summary.failed],
          ['Completed', summary.completed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-[#e7e0d6] bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</p>
            <p className="font-display mt-1 text-3xl text-stone-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, status, or error"
            className="w-full rounded-full border border-[#e7e0d6] bg-white py-2 pl-9 pr-4 text-sm"
          />
        </label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-full border border-[#e7e0d6] bg-white px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="issue">Issues</option>
          <option value="ingest">Ingest</option>
          <option value="plan">Plans</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full border border-[#e7e0d6] bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="generating">Generating</option>
          <option value="ingesting">Ingesting</option>
          <option value="failed">Failed</option>
          <option value="ready">Ready</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#d6cdc0] bg-white/70 px-6 py-16 text-center text-stone-500">
          No runs match these filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((run) => (
            <li key={run.id} className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                    {KIND_LABEL[run.kind] || run.kind}
                  </p>
                  <h2 className="mt-1 font-medium text-stone-900">{run.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">{run.detail}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusClass(run.status)}`}>
                  {run.status}
                </span>
              </div>
              {run.error ? (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{run.error}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-stone-500">
                <span>Updated {new Date(run.updated_at).toLocaleString()}</span>
                {run.href ? (
                  <Link href={run.href} className="font-medium text-stone-800 underline">
                    Open
                  </Link>
                ) : null}
                {run.can_retry ? (
                  <button
                    type="button"
                    disabled={retrying === run.id}
                    onClick={() => retry(run)}
                    className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {retrying === run.id ? 'Retrying…' : 'Retry'}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
