"use client";

import { useEffect, useState } from 'react';
import { Upload, Link2, FileText } from 'lucide-react';
import { sourceApi } from '@/lib/api';
import type { Source } from '@/types';

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMethod, setAddMethod] = useState('url');

  useEffect(() => {
    loadSources();
  }, []);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Source Library</h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Add Source
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading sources...</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sources yet</h3>
            <p className="text-gray-600 mb-4">Add your first source to start building content.</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
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
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    source.status === 'ready'
                      ? 'bg-green-100 text-green-800'
                      : source.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {source.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Source Dialog */}
        {showAddDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Add Source</h3>
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => setAddMethod('url')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'url' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                >
                  <Link2 className="h-5 w-5" />
                  <span>From URL</span>
                </button>
                <button
                  onClick={() => setAddMethod('file')}
                  className={`w-full p-3 border rounded-lg flex items-center gap-3 ${
                    addMethod === 'file' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                >
                  <Upload className="h-5 w-5" />
                  <span>Upload File</span>
                </button>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitUrlSource('https://example.com')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
