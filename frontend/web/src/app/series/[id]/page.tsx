"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';

type SeriesDetail = {
  id: string;
  topic: string;
  goal: string;
  level: string;
  timezone: string;
  status: string;
  created_at: string;
};

type SeriesIssue = {
  id: string;
  subject: string;
  sequence_no: number;
  status: string;
  scheduled_at: string;
  created_at: string;
};

type SeriesSource = {
  id: string;
  url?: string;
  name?: string;
  status: string;
};

export default function SeriesViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [issues, setIssues] = useState<SeriesIssue[]>([]);
  const [sources, setSources] = useState<SeriesSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'issues' | 'sources' | 'plan'>('issues');

  useEffect(() => {
    loadSeriesData();
  }, [id]);

  const loadSeriesData = async () => {
    setLoading(true);
    try {
      // Mock data - in a real implementation, fetch from backend
      setSeries({
        id,
        topic: 'Intro to Kubernetes',
        goal: 'Learn Kubernetes fundamentals',
        level: 'beginner',
        timezone: 'UTC',
        status: 'planned',
        created_at: '2024-01-15T10:00:00Z',
      });

      setIssues([
        {
          id: '1',
          subject: 'Welcome to Kubernetes Fundamentals',
          sequence_no: 1,
          status: 'approved',
          scheduled_at: '2024-01-22T09:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
        },
        {
          id: '2',
          subject: 'Kubernetes Architecture',
          sequence_no: 2,
          status: 'draft',
          scheduled_at: '2024-01-29T09:00:00Z',
          created_at: '2024-01-16T10:00:00Z',
        },
      ]);

      setSources([]);
    } catch (err) {
      console.error('Failed to load series data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{series?.topic}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                series?.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : series?.status === 'planned'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {series?.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['issues', 'sources', 'plan'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'issues' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Issues</h2>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Issue
              </button>
            </div>
            
            <div className="space-y-4">
              {issues.map((issue) => (
                <div key={issue.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">#{issue.sequence_no} {issue.subject}</h3>
                      <p className="text-sm text-gray-600">Scheduled: {new Date(issue.scheduled_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      issue.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : issue.status === 'draft'
                        ? 'bg-gray-100 text-gray-800'
                        : issue.status === 'sent'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {issue.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sources' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Sources</h2>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Source
              </button>
            </div>
            
            {sources.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No sources added yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="bg-white rounded-lg shadow p-4">
                    <p className="font-medium text-gray-900">{source.url || source.name}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      source.status === 'ready'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {source.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Curriculum Plan</h2>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 mb-4">No plan generated yet.</p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Generate Plan
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
