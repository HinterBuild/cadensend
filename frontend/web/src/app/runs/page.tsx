"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, FileText } from 'lucide-react';
import { useRequireAuth } from '@/contexts/AuthContext';

type Run = {
  id: string;
  operation: string;
  status: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  created_at: string;
  completed_at?: string;
  error_code?: string;
};

export default function RunCenterPage() {
  const { loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      loadRuns();
    }
  }, [authLoading]);

  const loadRuns = async () => {
    setLoading(true);
    try {
      setRuns([
        {
          id: 'run-1',
          operation: 'issue:generate',
          status: 'completed',
          model: 'poolside/laguna-s-2.1:free',
          tokens_in: 1250,
          tokens_out: 850,
          cost: 0.0012,
          created_at: '2024-01-20T10:00:00Z',
          completed_at: '2024-01-20T10:00:30Z',
        },
        {
          id: 'run-2',
          operation: 'source:ingest',
          status: 'failed',
          model: 'N/A',
          tokens_in: 0,
          tokens_out: 0,
          cost: 0,
          created_at: '2024-01-19T15:00:00Z',
          completed_at: '2024-01-19T15:00:10Z',
          error_code: 'FETCH_TIMEOUT',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Run Center</h1>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Search className="h-4 w-4" />
              <span>Last updated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {runs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No runs yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <div key={run.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{run.operation}</h3>
                    <p className="text-sm text-gray-600">
                      {run.tokens_in.toLocaleString()} tokens in · {run.tokens_out.toLocaleString()} tokens out
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    run.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : run.status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : run.status === 'running'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {run.status}
                  </span>
                </div>
                
                {run.error_code && (
                  <div className="flex items-center gap-2 text-sm text-red-600 mb-2">
                    <span className="font-medium">Error:</span>
                    <span>{run.error_code}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Cost: ${run.cost.toFixed(4)}</span>
                  <span>Started: {new Date(run.created_at).toLocaleString()}</span>
                  {run.completed_at && (
                    <span>Completed: {new Date(run.completed_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
