'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Link2, FileText, Trash2, RefreshCw, Eye } from 'lucide-react';
import { sourceApi } from '@/lib/api';
import { InjectionBadge } from '@/components/InjectionBadge';
import { useRequireAuth } from '@/contexts/AuthContext';
import { SearchField, EmptyResults, EmptyState, ErrorNotice, PageHeader, PageSkeleton, SummaryCards } from '@/components/WorkspaceUI';
import { Modal, ConfirmDialog } from '@/components/Modal';
import type { Source } from '@/types';

type ChunkPreview = { chunk_index: number; title?: string; heading_path: string[]; preview: string };
const BUSY_STATUSES = ['pending', 'ingesting', 'fetching', 'parsing', 'chunking', 'embedding', 'indexing'];
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function SourcesPage() {
  const { loading: authLoading } = useRequireAuth();
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [method, setMethod] = useState('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Source | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[] | null>(null);
  const [previewError, setPreviewError] = useState('');
  const previewRequest = useRef(0);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => sourceApi.list()
    .then(response => { setSources(response.data ?? []); setError(''); })
    .catch((err: unknown) => setError(message(err, 'Could not load sources.')))
    .finally(() => setLoading(false)), []);

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);
  const busy = sources.some(source => BUSY_STATUSES.includes(source.status));
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (method === 'file') {
        if (!file) { setFormError('Choose a file to upload.'); return; }
        await sourceApi.upload(file, 'workspace');
      } else {
        const parsed = new URL(url.trim());
        if (!['https:', 'http:'].includes(parsed.protocol)) { setFormError('Use an HTTP or HTTPS URL.'); return; }
        await sourceApi.submitUrl(url.trim(), 'url', 'workspace');
      }
      setShowAdd(false); setUrl(''); setFile(null);
      await load();
    } catch (err) { setFormError(message(err, 'Could not add source.')); }
    finally { setSaving(false); }
  }

  async function openPreview(source: Source) {
    const request = ++previewRequest.current;
    setPreview(source); setChunks(null); setPreviewError('');
    try {
      const response = await sourceApi.chunks(source.id);
      if (request === previewRequest.current) setChunks(response.data.chunks ?? []);
    } catch (err) { if (request === previewRequest.current) setPreviewError(message(err, 'Could not load indexed content.')); }
  }

  async function reindex(source: Source) {
    setReindexing(source.id);
    try { await sourceApi.reindex(source.id); await load(); }
    catch (err) { setError(message(err, 'Could not re-ingest source.')); }
    finally { setReindexing(null); }
  }

  async function remove() {
    if (!selected) return;
    setDeleting(true); setDeleteError('');
    try { await sourceApi.delete(selected.id); setSources(current => current.filter(s => s.id !== selected.id)); setSelected(null); }
    catch (err) { setDeleteError(message(err, 'Could not delete source.')); }
    finally { setDeleting(false); }
  }

  if (authLoading || loading) return <PageSkeleton label="Loading sources" />;
  const visible = sources.filter(source => `${source.url || ''} ${source.type} ${source.status}`.toLowerCase().includes(query.trim().toLowerCase()));
  const addButton = <button type="button" onClick={() => { setFormError(''); setShowAdd(true); }} className="button-primary"><Upload className="h-4 w-4" aria-hidden="true" />Add source</button>;

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
    <PageHeader eyebrow="Library" title="Sources" description="Give every issue a trusted foundation. Add references and keep your knowledge library organized." actions={addButton} />
    {error && <ErrorNotice onRetry={() => void load()}>{error}</ErrorNotice>}
    {!error && <SummaryCards items={[{label:'Sources',value:sources.length},{label:'Indexed chunks',value:sources.reduce((sum,s) => sum + (s.chunk_count || 0),0)},{label:'Needs attention',value:sources.filter(s => s.status === 'failed').length}]} />}
    {sources.length > 0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><SearchField label="Search sources" placeholder="Search by URL, type, or status…" value={query} onChange={setQuery} /><p role="status" className="text-xs text-stone-500">{visible.length} of {sources.length} sources</p></div>}
    {busy && <p role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />Indexing your sources. You can continue working while this finishes.</p>}
    {!error && sources.length === 0 ? <EmptyState title="Build your reference library" description="Add a URL or upload a file to ground your next issue in material you trust." icon={<FileText className="h-6 w-6" />} action={addButton} /> : sources.length > 0 && visible.length === 0 ? <EmptyResults onClear={() => setQuery('')} /> : <ul className="space-y-3">{visible.map(source => <li key={source.id} className="surface p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-50 text-emerald-800">{source.type === 'url' ? <Link2 className="h-5 w-5" aria-hidden="true" /> : <FileText className="h-5 w-5" aria-hidden="true" />}</span>
          <div className="min-w-0"><h2 className="break-words text-sm font-semibold text-stone-900">{source.url || 'Uploaded file'}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500"><span className="capitalize">{source.type}</span><span aria-hidden="true">·</span><span>{source.scope === 'series' ? 'Series only' : 'Workspace wide'}</span>{(source.chunk_count ?? 0) > 0 && <><span aria-hidden="true">·</span><span>{source.chunk_count} indexed chunks</span></>}
              {source.injection_status === 'flagged' && <InjectionBadge status={source.injection_status} findings={source.injection_findings} />}
            </div>
            {source.duplicate_of && <p className="mt-2 text-xs text-amber-800">Duplicate content: uses the existing index.</p>}
            {source.ingest_error && source.status === 'failed' && <p className="mt-2 break-words text-sm text-red-700">{source.ingest_error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`mr-2 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${source.status === 'ready' ? 'bg-emerald-50 text-emerald-800' : source.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{source.status}</span>
          {source.status === 'ready' && <button type="button" className="icon-button" title="Preview indexed content" aria-label={`Preview ${source.url || 'source'}`} onClick={() => void openPreview(source)}><Eye className="h-4 w-4" aria-hidden="true" /></button>}
          {['ready','failed'].includes(source.status) && <button type="button" className="icon-button" title="Re-ingest source" aria-label={`Re-ingest ${source.url || 'source'}`} disabled={reindexing !== null} onClick={() => void reindex(source)}><RefreshCw className={`h-4 w-4 ${reindexing === source.id ? 'animate-spin' : ''}`} aria-hidden="true" /></button>}
          <button type="button" className="icon-button hover:!bg-red-50 hover:!text-red-700" title="Delete source" aria-label={`Delete ${source.url || 'source'}`} onClick={() => { setDeleteError(''); setSelected(source); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
    </li>)}</ul>}
    {showAdd && <Modal title="Add source" onClose={() => setShowAdd(false)} busy={saving}>
      <form onSubmit={addSource}>
        <p className="mb-5 text-sm leading-6 text-stone-600">Workspace sources are available to all your series.</p>
        {formError && <ErrorNotice>{formError}</ErrorNotice>}
        <div className="mb-5 grid grid-cols-2 gap-3" role="group" aria-label="Source type">
          {['url','file'].map(value => <button key={value} type="button" disabled={saving} aria-pressed={method === value} onClick={() => { setMethod(value); setFormError(''); }} className={`button-secondary ${method === value ? '!border-emerald-600 !bg-emerald-50 !text-emerald-900' : ''}`}>{value === 'url' ? <Link2 className="h-4 w-4" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}{value === 'url' ? 'From a URL' : 'Upload file'}</button>)}
        </div>
        {method === 'url' ? <label className="block text-sm font-medium">Source URL<input type="url" required disabled={saving} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/article" className="field-input mt-2" /></label> : <label className="block text-sm font-medium">Source file<input type="file" required disabled={saving} onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-dashed border-stone-300 p-4 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-800" /></label>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="button-secondary">Cancel</button><button type="submit" disabled={saving} className="button-primary">{saving ? 'Adding…' : 'Add source'}</button></div>
      </form>
    </Modal>}
    {preview && <Modal title="Indexed content" wide onClose={() => { ++previewRequest.current; setPreview(null); }}>
      <p className="mb-4 break-words text-xs text-stone-500">{preview.url || 'Uploaded file'}</p>
      {previewError ? <ErrorNotice onRetry={() => void openPreview(preview)}>{previewError}</ErrorNotice> : chunks === null ? <p role="status" className="py-8 text-center text-sm text-stone-600">Loading indexed content…</p> : chunks.length === 0 ? <p className="py-8 text-center text-sm text-stone-600">No indexed chunks found.</p> : <ol className="space-y-3">{chunks.map((chunk,index) => <li key={index} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="mb-2 text-xs text-stone-500">Chunk {chunk.chunk_index}{chunk.heading_path?.length ? ` · ${chunk.heading_path.join(' › ')}` : ''}</p><p className="break-words text-sm leading-7 text-stone-700">{chunk.preview}</p></li>)}</ol>}
    </Modal>}
    {selected && <ConfirmDialog title="Delete source?" description={`Remove “${selected.url || 'this file'}” from future generation? Existing issues will keep their citations.`} confirmLabel="Delete source" busy={deleting} error={deleteError} onConfirm={() => void remove()} onClose={() => setSelected(null)} />}
  </div>;
}
