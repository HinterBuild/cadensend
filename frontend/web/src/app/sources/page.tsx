"use client";

import { useEffect, useState, useRef } from 'react';
import { Upload, Link2, FileText, X } from 'lucide-react';
import { sourceApi } from '@/lib/api';
import type { Source } from '@/types';

type ChunkPreview = { chunk_index: number; title?: string; heading_path: string[]; preview: string };

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMethod, setAddMethod] = useState('url');
  const [urlValue, setUrlValue] = useState('');
  const [fileValue, setFileValue] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [previewChunks, setPreviewChunks] = useState<ChunkPreview[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusableRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  // Close dialog on Escape and trap focus
  useEffect(() => {
    if (!showAddDialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddDialog(false);
      }
    };
    const handleFocusTrap = (e: FocusEvent) => {
      if (!dialogRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        firstFocusableRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusTrap);
    firstFocusableRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusTrap);
      previouslyFocused?.focus();
    };
  }, [showAddDialog]);

  const loadSources = async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const response = await sourceApi.list();
      setSources(response.data ?? []);
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  const sourcesBusy = sources.some((source) =>
    ['pending', 'ingesting', 'fetching', 'parsing', 'chunking', 'embedding', 'indexing'].includes(source.status)
  );

  useEffect(() => {
    if (!sourcesBusy) {
      return;
    }
    const timer = setInterval(() => {
      loadSources(false);
    }, 2500);
    return () => clearInterval(timer);
  }, [sourcesBusy]);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      setSaving(true);
      if (addMethod === 'file') {
        if (!fileValue) {
          setFormError('Choose a file to upload');
          return;
        }
        await sourceApi.upload(fileValue, 'workspace');
      } else {
        const url = urlValue.trim();
        if (!url) {
          setFormError('Enter a URL');
          return;
        }
        await sourceApi.submitUrl(url, 'url', 'workspace');
      }
      setShowAddDialog(false);
      setUrlValue('');
      setFileValue(null);
      loadSources(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to add source');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Source Library</h2>
          <button
            type="button"
            aria-label="Add Source"
            onClick={() => setShowAddDialog(true)}
            className="bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Add Source
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900 mx-auto"
              role="status"
              aria-label="Loading sources"
            ></div>
            <p className="mt-4 text-gray-600">Loading sources...</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sources yet</h3>
            <p className="text-gray-600 mb-4">Add your first source to start building content.</p>
            <button
              type="button"
              aria-label="Add Source"
              onClick={() => setShowAddDialog(true)}
              className="bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
            >
              Add Source
            </button>
          </div>
        ) : (
          <>
            {sourcesBusy && (
              <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-700" aria-hidden="true"></div>
                  <div>
                    <p className="text-sm font-medium text-yellow-900">Ingesting sources</p>
                    <p className="text-sm text-yellow-800">The backend is working on this. You can leave this page and come back.</p>
                  </div>
                </div>
              </div>
            )}
          <div className="grid gap-4">
            {sources.map((source) => (
              <div key={source.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-gray-900">{source.url || 'File source'}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{source.type}</span>
                      {source.scope === 'series' ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Series-only</span>
                      ) : (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">Workspace-wide</span>
                      )}
                      {!['pending', 'ingesting', 'fetching', 'parsing', 'chunking', 'embedding', 'indexing'].includes(source.status) &&
                        source.status !== 'failed' && (
                          <span>
                            {(source.chunk_count ?? 0) > 0
                              ? `${source.chunk_count} indexed chunks`
                              : source.duplicate_of
                              ? 'Duplicate content'
                              : ''}
                          </span>
                        )}
                    </div>
                    {source.duplicate_of && (
                      <p className="mt-1 text-xs text-amber-700">
                        Identical content already ingested — shares the same index, no extra storage.
                      </p>
                    )}
                    {source.status === 'failed' && source.ingest_error && (
                      <p className="mt-1 text-sm text-red-600">{source.ingest_error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`inline-flex items-center gap-2 px-2 py-1 text-xs rounded-full ${
                        source.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : source.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : ['pending', 'ingesting', 'fetching', 'parsing', 'chunking', 'embedding', 'indexing'].includes(source.status)
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                      aria-label={`Source status: ${source.status}`}
                    >
                      {['pending', 'ingesting', 'fetching', 'parsing', 'chunking', 'embedding', 'indexing'].includes(source.status) && (
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-800" aria-hidden="true"></span>
                      )}
                      {source.status === 'pending' || source.status === 'ingesting' ? 'In progress' : source.status}
                    </span>
                    <div className="flex gap-1">
                      {source.status === 'ready' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              setPreviewSourceId(source.id);
                              setPreviewLoading(true);
                              setPreviewChunks(null);
                              try {
                                const response = await sourceApi.preview(source.id);
                                setPreviewChunks(response.data?.chunks ?? []);
                              } catch (err: any) {
                                setPreviewChunks([]);
                                setPreviewError(err.message || 'Could not load preview');
                              } finally {
                                setPreviewLoading(false);
                              }
                            }}
                            aria-label={`Preview indexed chunks of ${source.url || 'source'}`}
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setReindexingId(source.id);
                              try {
                                await sourceApi.reindex(source.id);
                                await loadSources(false);
                              } catch (err: any) {
                                setError(err.message || 'Reindex failed');
                              } finally {
                                setReindexingId(null);
                              }
                            }}
                            disabled={reindexingId === source.id}
                            aria-label={`Re-ingest ${source.url || 'source'}`}
                            title="Re-fetch and re-index this source"
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {reindexingId === source.id ? 'Queuing…' : 'Re-ingest'}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(
                            `Remove “${source.url || 'this file'}”? Future issue generation will no longer use it as context. Already generated issues keep their citations.`,
                          )) return;
                          try {
                            await sourceApi.delete(source.id);
                            await loadSources(false);
                          } catch (err: any) {
                            setError(err.message || 'Delete failed');
                          }
                        }}
                        aria-label={`Delete ${source.url || 'source'}`}
                        className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {/* Chunk Preview Drawer */}
        {previewSourceId && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Indexed content preview"
          >
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Indexed chunks</h3>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSourceId(null);
                    setPreviewChunks(null);
                    setPreviewError('');
                  }}
                  aria-label="Close preview"
                  className="rounded p-1 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {previewLoading && <p className="text-sm text-gray-500" role="status">Loading…</p>}
              {previewError && <p className="text-sm text-red-600" role="alert">{previewError}</p>}
              {previewChunks && previewChunks.length === 0 && (
                <p className="text-sm text-gray-500">No indexed chunks found for this source.</p>
              )}
              {previewChunks && previewChunks.length > 0 && (
                <ul className="space-y-3">
                  {previewChunks.map((chunk, index) => (
                    <li key={index} className="rounded-xl border border-[#e7e0d6] bg-[#faf8f5] p-4">
                      <p className="mb-1 text-xs text-stone-500">
                        Chunk {chunk.chunk_index}
                        {(chunk.heading_path || []).length > 0 ? ` · ${chunk.heading_path.join(' › ')}` : ''}
                      </p>
                      <p className="text-sm leading-relaxed text-stone-800">{chunk.preview}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Add Source Dialog */}
        {showAddDialog && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            aria-modal="true"
            role="dialog"
            aria-label="Add Source"
            aria-labelledby="dialog-title"
          >
            <form onSubmit={handleAddSource} ref={dialogRef} className="bg-white rounded-lg p-8 w-full max-w-md">
              <h3 id="dialog-title" className="text-lg font-semibold mb-4">Add Source</h3>
              {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
              <div className="space-y-3 mb-4">
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={() => setAddMethod('url')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'url' ? 'border-stone-800 bg-stone-100' : 'border-gray-300'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800`}
                >
                  <Link2 className="h-5 w-5" aria-hidden="true" />
                  <span>From URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMethod('file')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'file' ? 'border-stone-800 bg-stone-100' : 'border-gray-300'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800`}
                >
                  <Upload className="h-5 w-5" aria-hidden="true" />
                  <span>Upload File</span>
                </button>
              </div>
              {addMethod === 'url' ? (
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              ) : (
                <input
                  type="file"
                  onChange={(e) => setFileValue(e.target.files?.[0] ?? null)}
                  className="w-full mb-6 text-sm"
                />
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
                >
                  Cancel
                </button>
                <button
                  ref={lastFocusableRef}
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
                >
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
