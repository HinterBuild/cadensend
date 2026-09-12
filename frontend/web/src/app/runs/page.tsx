"use client";

import { EmptyResults, EmptyState, ErrorNotice, PageHeader, PageSkeleton, SummaryCards } from '@/components/WorkspaceUI';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { useRequireAuth } from '@/contexts/AuthContext';
import { issueApi, runsApi, seriesApi, sourceApi, type RunItem, type RunSummary } from '@/lib/api';

const KIND_LABEL: Record<string, string> = {
  issue: 'Issue',
  ingest: 'Ingest',
  plan: 'Plan',
  generation: 'Generation',
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

function formatTokens(tokensIn?: number, tokensOut?: number) {
  if (!tokensIn && !tokensOut) return '';
  const fmt = (n?: number) => {
    if (!n) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };
  return `${fmt(tokensIn)} in / ${fmt(tokensOut)} out`;
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

  const loadRuns = useCallback(() => runsApi.list({ kind: kind || undefined, status: status || undefined })
    .then(response => {
      setRuns(response.data ?? []);
      setSummary(response.summary ?? { queued: 0, running: 0, failed: 0, completed: 0 });
      setError(null);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load runs'))
    .finally(() => setLoading(false)), [kind, status]);

  useEffect(() => {
    if (authLoading) return;
    void loadRuns();
  }, [authLoading, loadRuns]);

  useEffect(() => {
    if (authLoading || !autoRefresh) return;
    const timer = window.setInterval(() => { if (!document.hidden) void loadRuns(); }, 8000);
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
      if ((run.kind === 'issue' || run.kind === 'generation') && run.issue_id) {
        await issueApi.generate(run.issue_id);
      } else if (run.kind === 'ingest' && run.source_id) {
        await sourceApi.reindex(run.source_id);
      } else if ((run.kind === 'plan' || run.kind === 'generation') && !run.issue_id && run.series_id) {
        await seriesApi.generatePlan(run.series_id);
      }
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  if (authLoading || (loading && runs.length === 0)) return <PageSkeleton label="Loading runs" />;

  const refreshAction = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
        Auto-refresh
      </label>
      <button type="button" onClick={() => void loadRuns()} className="button-primary">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Refresh
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operations"
        title="Run Center"
        description="Live plans, ingest jobs, and issue generations for this workspace."
        actions={refreshAction}
      />
      {error && <ErrorNotice onRetry={() => void loadRuns()}>{error}</ErrorNotice>}
      <SummaryCards items={[
        { label: 'Queued', value: summary.queued },
        { label: 'Running', value: summary.running },
        { label: 'Failed', value: summary.failed },
        { label: 'Completed', value: summary.completed },
      ]} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            aria-label="Search runs"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, status, or error"
            className="w-full surface py-2 pl-9 pr-4 text-sm"
          />
        </label>
        <select
          aria-label="Filter by run type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="surface px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="issue">Issues</option>
          <option value="ingest">Ingest</option>
          <option value="plan">Plans</option>
          <option value="generation">Dead-lettered generations</option>
        </select>
        <select
          aria-label="Filter by run status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="surface px-3 py-2 text-sm"
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

      {!error && runs.length === 0 && !kind && !status && !query.trim() ? <EmptyState title="Your work will appear here" description="Generate a plan, create an issue, or add a source to track its progress here." /> : !error && visible.length === 0 ? (
        <EmptyResults onClear={() => { setQuery(''); setKind(''); setStatus(''); }} />
      ) : (
        <ul className="space-y-3">
          {visible.map((run) => (
            <li key={run.id} className="surface p-5">
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
                {(run.tokens_in || run.tokens_out) ? (
                  <span className="tabular-nums" title={`Model: ${run.model || 'unknown'}`}>
                    {formatTokens(run.tokens_in, run.tokens_out)} tokens
                  </span>
                ) : null}
                {run.model && (run.tokens_in || run.tokens_out) ? (
                  <span className="text-xs">{run.model}</span>
                ) : null}
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
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
