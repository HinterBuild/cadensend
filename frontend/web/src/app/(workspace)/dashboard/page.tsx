'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen, Calendar, ArrowUpRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRequireAuth } from '@/contexts/AuthContext';
import { seriesApi } from '@/lib/api';
import { Series } from '@/types';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { SearchField, EmptyResults, EmptyState, ErrorNotice, PageHeader, PageSkeleton, SummaryCards } from '@/components/WorkspaceUI';
import { ConfirmDialog } from '@/components/Modal';

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Series | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadSeries = useCallback(() => seriesApi.list()
    .then(response => { setSeries(response.series); setError(null); })
    .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load series'))
    .finally(() => setLoading(false)), []);

  useEffect(() => { if (!authLoading) void loadSeries(); }, [authLoading, loadSeries]);

  async function deleteSeries() {
    if (!selected) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await seriesApi.delete(selected.id);
      setSeries(current => current.filter(item => item.id !== selected.id));
      setSelected(null);
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Could not delete this series.'); }
    finally { setDeleting(false); }
  }

  if (authLoading || loading) return <PageSkeleton label="Loading series" />;
  const name = user?.name?.trim() || user?.email?.split('@')[0] || 'there';
  const visible = series.filter(item => (statusFilter === 'all' || item.status === statusFilter) && `${item.topic} ${item.goal || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const createAction = <Link href="/series/create" className="button-primary"><Plus className="h-4 w-4" aria-hidden="true" />Create New Series</Link>;

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
    <PageHeader eyebrow="Your workspace" title={`Good day, ${name}`} description="Turn your next idea into a series your readers look forward to." actions={createAction} />
    <section aria-label="AI assistant" className="mb-8 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-emerald-950">Start with an idea</h2>
        <p className="text-xs text-stone-600">Plan, write, or refine with your assistant</p>
      </div>
      <AssistantChat layout="dock" onSeriesChange={() => void loadSeries()} />
    </section>
    {error && <ErrorNotice onRetry={() => void loadSeries()}>{error}</ErrorNotice>}
    {!error && <SummaryCards items={[{label:'Total series',value:series.length},{label:'Active',value:series.filter(s => s.status === 'active').length},{label:'Drafts',value:series.filter(s => s.status === 'draft').length}]} />}
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-xl font-semibold tracking-tight">Your Series</h2><p className="mt-1 text-sm text-stone-500">Your writing, from first draft to scheduled delivery.</p></div>
      {series.length > 0 && <p className="text-xs text-stone-500" role="status">{visible.length} of {series.length} series</p>}
    </div>
    {series.length > 0 && <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchField label="Search series" placeholder="Search by topic or goal…" value={query} onChange={setQuery} />
      <select aria-label="Filter series by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="field-input sm:!w-auto">
        <option value="all">All statuses</option>{Array.from(new Set(series.map(s => s.status))).sort().map(status => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
      </select>
    </div>}
    {!error && series.length === 0 ? <EmptyState title="Your first series starts here" description="Choose a topic, bring your references, and turn what you know into a thoughtful email series." icon={<BookOpen className="h-6 w-6" />} action={<Link href="/series/create" className="button-primary">Create your first series</Link>} /> : series.length > 0 && visible.length === 0 ? <EmptyResults onClear={() => { setQuery(''); setStatusFilter('all'); }} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(s => {
        const status = s.plan_status === 'generating' ? 'Plan in progress' : s.plan_status === 'failed' ? 'Plan failed' : s.status;
        const badge = s.plan_status === 'failed' ? 'bg-red-50 text-red-800' : s.plan_status === 'generating' ? 'bg-amber-50 text-amber-800' : s.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600';
        return <article key={s.id} className="surface group flex flex-col p-5 transition-shadow hover:shadow-md">
          <Link href={`/series/${s.id}`} className="flex-1 no-underline hover:no-underline">
            <div className="mb-5 flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-emerald-800"><BookOpen className="h-5 w-5" aria-hidden="true" /></span><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${badge}`}>{status}</span></div>
            <h3 className="font-display text-2xl leading-tight text-stone-900">{s.topic}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{s.goal}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-stone-500">
              {s.level && <span className="rounded-md bg-stone-100 px-2 py-1 capitalize">{s.level}</span>}
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{new Date(s.created_at).toLocaleDateString()}</span>
            </div>
          </Link>
          <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-3">
            <Link href={`/series/${s.id}`} aria-label={`Open ${s.topic}`} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-emerald-800">Open series<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            <button type="button" aria-label={`Delete ${s.topic}`} title="Delete series" onClick={() => { setDeleteError(''); setSelected(s); }} className="icon-button hover:!bg-red-50 hover:!text-red-700"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </article>;
      })}
    </div>}
    {selected && <ConfirmDialog title="Delete series?" description={`“${selected.topic}” will be permanently deleted. This cannot be undone.`} confirmLabel="Delete series" busy={deleting} error={deleteError} onConfirm={() => void deleteSeries()} onClose={() => setSelected(null)} />}
  </div>;
}
