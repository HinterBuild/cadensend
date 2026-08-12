"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Send, RefreshCw } from 'lucide-react';
import { seriesApi } from '@/lib/api';
import { Series, Issue } from '@/types';

type SeriesDetail = Series & {
  issues?: Issue[];
};

export default function SeriesViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'sources' | 'plan'>('issues');

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (id) {
      loadSeriesData();
    }
  }, [id]);

  const loadSeriesData = async () => {
    setLoading(true);
    setError(null);
    try {
      const seriesRes = await seriesApi.get(id);
      setSeries(seriesRes.data);

      const issuesRes = await seriesApi.getIssues(id);
      setIssues(issuesRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load series data');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: 'issues' | 'sources' | 'plan') => {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
            role="status"
            aria-label="Loading"
          ></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p role="alert" aria-live="assertive" className="text-red-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'issues', label: 'Issues' },
    { id: 'sources', label: 'Sources' },
    { id: 'plan', label: 'Curriculum Plan' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                type="button"
                aria-label="Back to Dashboard"
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{series?.topic}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  series?.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : series?.status === 'planned'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
                aria-label={`Status: ${series?.status}`}
              >
                {series?.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav aria-label="Series sections">
            <div
              role="tablist"
              aria-label="Series sections"
              className="-mb-px flex space-x-8"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  ref={(el) => (tabRefs.current[tab.id] = el)}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`${tab.id}-panel`}
                  id={`tab-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {activeTab === 'issues' && (
          <div
            id="issues-panel"
            role="tabpanel"
            aria-labelledby="tab-issues"
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Issues</h2>
              <button
                type="button"
                aria-label="Add Issue"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Issue
              </button>
            </div>

            {issues.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No issues yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {issues.map((issue) => (
                  <div key={issue.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">#{issue.sequence_no} {issue.objective || ''}</h3>
                        <p className="text-sm text-gray-600">
                          Scheduled: {issue.scheduled_at ? new Date(issue.scheduled_at).toLocaleDateString() : 'Not scheduled'}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          issue.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : issue.status === 'sent'
                            ? 'bg-purple-100 text-purple-800'
                            : issue.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        aria-label={`Issue status: ${issue.status}`}
                      >
                        {issue.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div
            id="sources-panel"
            role="tabpanel"
            aria-labelledby="tab-sources"
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Sources</h2>
              <button
                type="button"
                aria-label="Add Source"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Source
              </button>
            </div>

            <div className="text-center py-12">
              <p className="text-gray-600">No sources added yet.</p>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div
            id="plan-panel"
            role="tabpanel"
            aria-labelledby="tab-plan"
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Curriculum Plan</h2>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 mb-4">No plan generated yet.</p>
              <button
                type="button"
                onClick={() => {
                  seriesApi.generatePlan(id).catch((err) =>
                    console.error('Plan generation failed:', err)
                  );
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              >
                Generate Plan
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
