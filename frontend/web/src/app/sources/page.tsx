"use client";

import { useEffect, useState, useRef } from 'react';
import { Upload, Link2, FileText } from 'lucide-react';
import { sourceApi } from '@/lib/api';
import type { Source } from '@/types';

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMethod, setAddMethod] = useState('url');
  const dialogRef = useRef<HTMLDivElement>(null);
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

  const loadSources = async () => {
    setLoading(true);
    try {
      const response = await sourceApi.list();
      setSources(response.data ?? []);
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const submitUrlSource = async (url: string) => {
    try {
      await sourceApi.submitUrl(url, 'url', 'workspace');
      setShowAddDialog(false);
      loadSources();
    } catch (err) {
      console.error('Failed to add URL source:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Source Library</h2>
          <button
            type="button"
            aria-label="Add Source"
            onClick={() => setShowAddDialog(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Add Source
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              Add Source
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {sources.map((source) => (
              <div key={source.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{source.url || 'File source'}</h3>
                    <p className="text-sm text-gray-600">{source.type}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      source.status === 'ready'
                        ? 'bg-green-100 text-green-800'
                        : source.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                    aria-label={`Source status: ${source.status}`}
                  >
                    {source.status}
                  </span>
                </div>
              </div>
            ))}
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
            <div
              ref={dialogRef}
              className="bg-white rounded-lg p-8 w-full max-w-md"
            >
              <h3 id="dialog-title" className="text-lg font-semibold mb-4">Add Source</h3>
              <div className="space-y-3 mb-6">
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={() => setAddMethod('url')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'url' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
                >
                  <Link2 className="h-5 w-5" aria-hidden="true" />
                  <span>From URL</span>
                </button>
                <button
                  ref={lastFocusableRef}
                  type="button"
                  onClick={() => setAddMethod('file')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'file' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
                >
                  <Upload className="h-5 w-5" aria-hidden="true" />
                  <span>Upload File</span>
                </button>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => submitUrlSource('https://example.com')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
